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
  });
});
