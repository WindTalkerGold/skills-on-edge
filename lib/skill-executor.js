// Skills on Edge - Skill Executor
// Orchestrator that runs a skill's actions[] sequentially in the service worker

const SkillExecutor = {
  /**
   * Execute a user skill workflow.
   * @param {object} skillDef - The skill JSON definition
   * @param {object} context - { title, url, text, selection }
   * @param {object} settings - { outputLang, userInput, ... }
   * @param {object} provider - Active provider config
   * @param {Port} port - Chrome runtime port for streaming
   */
  async execute(skillDef, context, settings, provider, port) {
    const steps = {};
    const data = { context, settings, steps };

    for (const action of skillDef.actions) {
      try {
        const result = await this.runAction(action, data, provider, port);
        steps[action.id] = { result };
      } catch (err) {
        const onError = action.onError || 'abort';
        if (onError === 'abort') {
          port.postMessage({ type: 'STREAM_ERROR', error: `Action "${action.id}" failed: ${err.message}` });
          return;
        } else if (onError === 'skip') {
          steps[action.id] = { result: '', error: err.message };
          continue;
        } else if (onError === 'fallback') {
          steps[action.id] = { result: action.config?.fallbackValue || '', error: err.message };
          continue;
        }
      }
    }

    port.postMessage({ type: 'STREAM_DONE' });
  },

  async runAction(action, data, provider, port) {
    switch (action.type) {
      case 'llm-chat':
        return this.runLlmChat(action, data, provider, port, true);
      case 'llm-build-prompt':
        return this.runLlmChat(action, data, provider, port, false);
      case 'http-call':
        return this.runHttpCall(action, data);
      case 'transform':
        return this.runTransform(action, data);
      case 'loop':
        return this.runLoop(action, data, provider, port);
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  },

  /**
   * Run a loop action — repeats sub-actions until a condition is met or maxIterations reached.
   *
   * config.actions[]       — sub-actions to run each iteration
   * config.maxIterations   — hard cap (default 10)
   * config.until.step      — step id whose result to check
   * config.until.contains / notContains / matches / equals — condition
   *
   * Each iteration overwrites sub-step results in data.steps.
   * The loop result is the last value of the until.step (or last sub-action).
   */
  async runLoop(action, data, provider, port) {
    const config = action.config || {};
    const subActions = config.actions || [];
    const maxIterations = config.maxIterations ?? 10;
    const until = config.until;

    if (!subActions.length) throw new Error('Loop has no actions');

    for (let i = 0; i < maxIterations; i++) {
      data.loop = { iteration: i + 1, maxIterations };

      for (const subAction of subActions) {
        try {
          const result = await this.runAction(subAction, data, provider, port);
          data.steps[subAction.id] = { result };
        } catch (err) {
          const onError = subAction.onError || 'abort';
          if (onError === 'abort') throw err;
          if (onError === 'skip') {
            data.steps[subAction.id] = { result: '', error: err.message };
          } else if (onError === 'fallback') {
            data.steps[subAction.id] = { result: subAction.config?.fallbackValue || '', error: err.message };
          }
        }
      }

      // Check termination condition
      if (until && until.step) {
        const stepResult = String(data.steps[until.step]?.result ?? '');
        if (this.evaluateCondition(stepResult, until)) {
          break;
        }
      }
    }

    delete data.loop;

    // Return the result of the until.step, or the last sub-action
    const resultStep = until?.step || subActions[subActions.length - 1]?.id;
    return data.steps[resultStep]?.result ?? '';
  },

  /**
   * Evaluate a simple condition against a string value.
   * Supports: contains, notContains, equals, matches (regex).
   */
  evaluateCondition(value, condition) {
    if (condition.contains != null) {
      return value.includes(condition.contains);
    }
    if (condition.notContains != null) {
      return !value.includes(condition.notContains);
    }
    if (condition.equals != null) {
      return value === condition.equals;
    }
    if (condition.matches != null) {
      try {
        return new RegExp(condition.matches).test(value);
      } catch {
        return false;
      }
    }
    return false;
  },

  /**
   * Run an LLM chat action. If stream=true, tokens are sent to the port.
   */
  async runLlmChat(action, data, provider, port, stream) {
    const config = action.config || {};
    const messages = (config.messages || []).map(msg => ({
      role: msg.role,
      content: TemplateEngine.render(msg.content, data)
    }));

    const shouldStream = stream && config.stream !== false;
    const req = Providers.buildRequest(provider, messages, shouldStream);
    const response = await fetch(req.url, req.options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error ${response.status}: ${errorText.substring(0, 200)}`);
    }

    if (!shouldStream) {
      // Non-streaming: read full response
      const json = await response.json();
      if (provider.anthropic) {
        return json.content?.[0]?.text || '';
      }
      return json.choices?.[0]?.message?.content || '';
    }

    // Streaming: parse SSE and forward tokens
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    const sentText = messages.map(m => m.content || '').join(' ');
    const sentTokens = estimateTokens(sentText);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const d = trimmed.slice(6);
        if (d === '[DONE]') continue;

        try {
          const parsed = JSON.parse(d);
          let token = '';
          if (provider.anthropic) {
            if (parsed.type === 'content_block_delta') {
              token = parsed.delta?.text || '';
            }
          } else {
            token = parsed.choices?.[0]?.delta?.content || '';
          }
          if (token) {
            fullText += token;
            port.postMessage({ type: 'STREAM_TOKEN', token });
          }
        } catch {
          // skip unparseable lines
        }
      }
    }

    // Record stats
    const receivedTokens = estimateTokens(fullText);
    Stats.record(sentTokens, receivedTokens, provider.id, action.id);

    return fullText;
  },

  /**
   * Run an HTTP call action.
   */
  async runHttpCall(action, data) {
    const config = action.config || {};
    const url = TemplateEngine.render(config.url, data);
    const method = (config.method || 'GET').toUpperCase();

    const headers = {};
    if (config.headers) {
      for (const [key, val] of Object.entries(config.headers)) {
        headers[key] = TemplateEngine.render(val, data);
      }
    }

    const fetchOpts = { method, headers };
    if (method !== 'GET' && config.body) {
      const bodyStr = TemplateEngine.render(
        typeof config.body === 'string' ? config.body : JSON.stringify(config.body),
        data
      );
      fetchOpts.body = bodyStr;
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
    }

    const response = await fetch(url, fetchOpts);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text.substring(0, 200)}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await response.json();
    }
    return await response.text();
  },

  /**
   * Run a transform action — combine previous step results via template.
   */
  runTransform(action, data) {
    const config = action.config || {};
    return TemplateEngine.render(config.template || '', data);
  }
};
