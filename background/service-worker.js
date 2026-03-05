// Skills on Edge - Background Service Worker
importScripts('../lib/providers.js');
importScripts('../lib/stats.js');
importScripts('../lib/template-engine.js');
importScripts('../lib/skill-loader.js');
importScripts('../lib/skill-executor.js');

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

  if (message.type === 'SYMBOL_QUERY') {
    (async () => {
      try {
        const { symbol, alias } = message;
        const stored = await chrome.storage.local.get('roslynBaseUrl');
        const base = stored.roslynBaseUrl || 'http://localhost:5001';

        // Step 1: Search for matching types
        const searchResp = await fetch(`${base}/${alias}/search?q=${encodeURIComponent(symbol)}`);
        if (!searchResp.ok) {
          sendResponse({ error: `Roslyn service error: HTTP ${searchResp.status}` });
          return;
        }
        const searchJson = await searchResp.json();
        const searchResults = searchJson.results || searchJson;

        if (!searchResults || searchResults.length === 0) {
          sendResponse({ error: `No results found for "${symbol}"` });
          return;
        }

        // Step 2: Get full type details for the best match
        const bestMatch = searchResults[0];
        const fullName = bestMatch.fullName || bestMatch.FullName || bestMatch.name || bestMatch.Name;

        let typeInfo = null;
        try {
          const typeResp = await fetch(`${base}/${alias}/type/${encodeURIComponent(fullName)}`);
          if (typeResp.ok) {
            typeInfo = await typeResp.json();
          }
        } catch { /* type endpoint failed, continue with search result */ }

        // Step 3: Get references
        let references = null;
        try {
          const refsResp = await fetch(`${base}/${alias}/references/${encodeURIComponent(fullName)}`);
          if (refsResp.ok) {
            const refsJson = await refsResp.json();
            references = refsJson.references || refsJson;
          }
        } catch { /* references endpoint failed, continue without */ }

        sendResponse({
          searchResults,
          typeInfo,
          references,
          matchedName: fullName
        });
      } catch (err) {
        sendResponse({ error: `Roslyn service unavailable: ${err.message}` });
      }
    })();
    return true;
  }

  if (message.type === 'SET_HOVER_MODE') {
    (async () => {
      try {
        const { enabled, alias, delay, tabId } = message;
        // Forward to content script in the specified tab
        const targetTabId = tabId || (sender.tab && sender.tab.id);
        if (!targetTabId) {
          // If from popup, get active tab
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab) {
            await chrome.tabs.sendMessage(tab.id, {
              type: 'SET_HOVER_MODE',
              enabled,
              alias,
              delay
            });
          }
        } else {
          await chrome.tabs.sendMessage(targetTabId, {
            type: 'SET_HOVER_MODE',
            enabled,
            alias,
            delay
          });
        }
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
