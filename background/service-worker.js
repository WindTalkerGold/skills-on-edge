// Skills on Edge - Background Service Worker
importScripts('../lib/providers.js');
importScripts('../lib/stats.js');
importScripts('../lib/template-engine.js');
importScripts('../lib/skill-loader.js');
importScripts('../lib/skill-executor.js');
importScripts('../lib/text-utils.js');

// Context menu for running skills on selected text
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'run-skill',
    title: 'Run Skill on Selection',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'run-skill' && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'RUN_SKILL',
      text: info.selectionText
    });
  }
});

// Message relay between popup/content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_PAGE_CONTENT') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) { sendResponse(null); return; }

        // Try sending to existing content script first
        try {
          const result = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_CONTENT' });
          if (result) { sendResponse(result); return; }
        } catch {
          // Content script not injected — try injecting on demand
        }

        // Fallback: inject content script first so lastSelection is available, then extract
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content/content.js']
          });
          // Now try sending again — content script should be loaded
          const retryResult = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_CONTENT' });
          if (retryResult) { sendResponse(retryResult); return; }
        } catch { /* injection failed, use direct approach */ }

        // Last resort: direct extraction (selection may be empty)
        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const article = document.querySelector('article') || document.querySelector('main') || document.body;
            return {
              title: document.title,
              url: window.location.href,
              text: article.innerText.substring(0, 50000),
              selection: window.getSelection().toString()
            };
          }
        });
        sendResponse(result);
      } catch (err) {
        // Can't access this page at all (restricted page)
        sendResponse(null);
      }
    })();
    return true;
  }

  if (message.type === 'GET_STATS') {
    Stats.getStats().then(stats => sendResponse(stats));
    return true;
  }

  if (message.type === 'INJECT_SKILL_CONTENT') {
    (async () => {
      try {
        const { file, tabId } = message;
        const targetTabId = tabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
        if (!targetTabId) { sendResponse({ error: 'No active tab' }); return; }
        await chrome.scripting.executeScript({
          target: { tabId: targetTabId },
          files: [file]
        });
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }

  if (message.type === 'FETCH_MODELS') {
    (async () => {
      try {
        const provider = message.provider;
        const baseUrl = provider.baseUrl.replace(/\/$/, '');
        let url, headers = { 'Content-Type': 'application/json' };

        if (provider.anthropic) {
          url = baseUrl + '/models';
          headers['x-api-key'] = provider.apiKey;
          headers['anthropic-version'] = '2023-06-01';
        } else if (provider.azure) {
          url = `${baseUrl}/openai/models?api-version=2024-02-01`;
          if (provider.apiKey) headers['api-key'] = provider.apiKey;
        } else {
          url = `${baseUrl}/v1/models`;
          if (provider.apiKey) headers['Authorization'] = `Bearer ${provider.apiKey}`;
        }

        const resp = await fetch(url, { headers });
        if (!resp.ok) {
          const text = await resp.text();
          sendResponse({ error: `HTTP ${resp.status}: ${text.substring(0, 200)}` });
          return;
        }
        const json = await resp.json();
        const models = (json.data || []).map(m => m.id).sort();
        sendResponse({ models });
      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }
});

// Helper: make a non-streaming LLM call and return the text
async function llmCall(provider, messages) {
  const req = Providers.buildRequest(provider, messages, false);
  const response = await fetch(req.url, req.options);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }
  const json = await response.json();
  if (provider.anthropic) {
    return (json.content || []).map(b => b.text || '').join('');
  }
  return json.choices?.[0]?.message?.content || '';
}

// Helper: stream an LLM call, sending STREAM_TOKEN messages to port, return full text
async function llmStream(provider, messages, port) {
  const req = Providers.buildRequest(provider, messages, true);
  const response = await fetch(req.url, req.options);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
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
      } catch { /* skip unparseable */ }
    }
  }
  return fullText;
}

// Multi-round chunked summarize for large content
async function handleChunkedSummarize(provider, content, settings, skillId, port) {
  const langNote = settings?.outputLang ? ` Respond in ${settings.outputLang}.` : '';
  const text = content.text || '';
  let totalSent = 0;
  let totalReceived = 0;

  function trackTokens(input, output) {
    totalSent += estimateTokens(input);
    totalReceived += estimateTokens(output);
  }

  // --- Round 1: Peek (head + tail) ---
  const head = text.substring(0, 2000);
  const tail = text.substring(Math.max(0, text.length - 2000));
  const peekText = head + '\n...\n' + tail;

  port.postMessage({ type: 'STREAM_TOKEN', token: '\n📋 Phase 1/5: Identifying content...\n' });

  const peekMessages = [
    { role: 'system', content: 'You are a content analyst. Identify the topic, structure, and key themes of this content. Be concise (2-4 sentences).' + langNote },
    { role: 'user', content: `Title: ${content.title || ''}\n\nHere is the beginning and end of a long document:\n\n${peekText}` }
  ];
  const overview = await llmCall(provider, peekMessages);
  trackTokens(peekMessages.map(m => m.content).join(' '), overview);
  port.postMessage({ type: 'STREAM_TOKEN', token: overview + '\n' });

  // --- Rounds 2-4: Process middle chunks ---
  const middleStart = 2000;
  const middleEnd = Math.max(middleStart, text.length - 2000);
  const middleText = text.substring(middleStart, middleEnd);

  let accumulated = overview;
  const chunks = TextUtils.chunkText(middleText, 3);

  for (let i = 0; i < chunks.length; i++) {
    const round = i + 2;
    const extracted = TextUtils.extractUsefulText(chunks[i], 4000);

    if (extracted.trim().length < 50) continue; // skip near-empty chunks

    port.postMessage({ type: 'STREAM_TOKEN', token: `\n📋 Phase ${round}/5: Processing chunk ${i + 1}/${chunks.length}...\n` });

    const chunkMessages = [
      { role: 'system', content: 'You are a summarization assistant. Given what we know so far and a new chunk of text, extract any new key information not already covered. Be concise — bullet points preferred. If no new information, reply with "No new information."' + langNote },
      { role: 'user', content: `What we know so far:\n${accumulated}\n\n---\nNew chunk:\n${extracted}` }
    ];
    const findings = await llmCall(provider, chunkMessages);
    trackTokens(chunkMessages.map(m => m.content).join(' '), findings);
    port.postMessage({ type: 'STREAM_TOKEN', token: findings + '\n' });

    // If no new info, skip remaining chunks
    if (/no new information/i.test(findings)) break;

    accumulated += '\n' + findings;
  }

  // --- Round 5: Final synthesis (streaming) ---
  port.postMessage({ type: 'STREAM_TOKEN', token: '\n📋 Phase 5/5: Final summary...\n' });

  const synthMessages = [
    { role: 'system', content: 'You are a summarization expert. Synthesize a final concise bullet-point summary from the accumulated notes below. Use 3-7 bullets max. Each bullet should be one short sentence. No introduction, no filler.' + langNote },
    { role: 'user', content: `Synthesize a final summary from these notes:\n\n${accumulated}` }
  ];
  const synthSent = synthMessages.map(m => m.content).join(' ');
  const synthResult = await llmStream(provider, synthMessages, port);
  trackTokens(synthSent, synthResult);

  // Record total usage
  Stats.record(totalSent, totalReceived, provider.id, skillId || 'summarize');

  port.postMessage({ type: 'STREAM_DONE' });
}

// Streaming API calls via long-lived port connections
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'ai-stream') return;

  port.onMessage.addListener(async (message) => {
    if (message.type === 'EXECUTE_SKILL_WORKFLOW') {
      const { skillDef, context, settings, provider } = message;
      try {
        await SkillExecutor.execute(skillDef, context, settings, provider, port);
      } catch (err) {
        port.postMessage({ type: 'STREAM_ERROR', error: err.message });
      }
      return;
    }

    if (message.type === 'CHUNKED_SUMMARIZE') {
      const { provider, content, settings, skillId } = message;
      try {
        await handleChunkedSummarize(provider, content, settings, skillId, port);
      } catch (err) {
        port.postMessage({ type: 'STREAM_ERROR', error: err.message });
      }
      return;
    }

    if (message.type !== 'STREAM_REQUEST') return;

    const { provider, messages, skillId } = message;
    try {
      // Estimate sent tokens
      const sentText = messages.map(m => m.content || '').join(' ');
      const sentTokens = estimateTokens(sentText);

      const req = Providers.buildRequest(provider, messages, true);
      const response = await fetch(req.url, req.options);

      if (!response.ok) {
        const errorText = await response.text();
        port.postMessage({ type: 'STREAM_ERROR', error: `API error ${response.status}: ${errorText}` });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let receivedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            let token = '';

            if (provider.anthropic) {
              if (parsed.type === 'content_block_delta') {
                token = parsed.delta?.text || '';
              }
            } else {
              token = parsed.choices?.[0]?.delta?.content || '';
            }

            if (token) {
              receivedText += token;
              port.postMessage({ type: 'STREAM_TOKEN', token });
            }
          } catch {
            // skip unparseable lines
          }
        }
      }

      // Record usage stats
      const receivedTokens = estimateTokens(receivedText);
      Stats.record(sentTokens, receivedTokens, provider.id, skillId || '');

      port.postMessage({ type: 'STREAM_DONE' });
    } catch (err) {
      port.postMessage({ type: 'STREAM_ERROR', error: err.message });
    }
  });
});
