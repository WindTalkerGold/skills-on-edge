// Skills on Edge - Provider Registry & API Logic
// All providers use OpenAI-compatible chat completions format

const DEFAULT_PROVIDERS = [
  {
    id: 'local',
    name: 'Local (localhost:4141)',
    baseUrl: 'http://localhost:4141',
    apiKey: '',
    model: '',
    headers: {},
    builtin: true
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com',
    apiKey: '',
    model: 'gpt-4o-mini',
    headers: {},
    builtin: true
  },
  {
    id: 'claude',
    name: 'Claude (Anthropic)',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKey: '',
    model: 'claude-sonnet-4-20250514',
    headers: {},
    builtin: true,
    anthropic: true
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    apiKey: '',
    model: 'deepseek-chat',
    headers: {},
    builtin: true
  },
  {
    id: 'glm',
    name: 'GLM (BigModel)',
    baseUrl: 'https://open.bigmodel.cn/api/paas',
    apiKey: '',
    model: 'glm-4-flash',
    headers: {},
    builtin: true
  },
  {
    id: 'azure',
    name: 'Azure OpenAI',
    baseUrl: '',
    apiKey: '',
    model: '',
    headers: {},
    builtin: true,
    azure: true
  }
];

const Providers = {
  async getAll() {
    const { providers } = await chrome.storage.local.get('providers');
    return providers || DEFAULT_PROVIDERS;
  },

  async save(providers) {
    await chrome.storage.local.set({ providers });
  },

  async getActive() {
    const [providers, { activeProviderId }] = await Promise.all([
      this.getAll(),
      chrome.storage.local.get('activeProviderId')
    ]);
    const id = activeProviderId || 'local';
    return providers.find(p => p.id === id) || providers[0];
  },

  async setActive(providerId) {
    await chrome.storage.local.set({ activeProviderId: providerId });
  },

  async addCustom(provider) {
    const providers = await this.getAll();
    provider.id = provider.id || 'custom_' + Date.now();
    provider.builtin = false;
    providers.push(provider);
    await this.save(providers);
    return provider;
  },

  async update(providerId, updates) {
    const providers = await this.getAll();
    const idx = providers.findIndex(p => p.id === providerId);
    if (idx !== -1) {
      Object.assign(providers[idx], updates);
      await this.save(providers);
    }
  },

  async remove(providerId) {
    let providers = await this.getAll();
    providers = providers.filter(p => p.id !== providerId || p.builtin);
    await this.save(providers);
  },

  // Fetch available models from the provider's /v1/models endpoint
  async fetchModels(provider) {
    const baseUrl = provider.baseUrl.replace(/\/$/, '');
    let url, headers = {};

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
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    // OpenAI-compatible: { data: [{ id: "model-name" }, ...] }
    const models = (json.data || []).map(m => m.id).sort();
    return models;
  },

  // Build the fetch request for a provider
  buildRequest(provider, messages, stream = true) {
    if (provider.anthropic) {
      return {
        url: provider.baseUrl + '/messages',
        options: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': provider.apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: provider.model,
            max_tokens: 4096,
            stream,
            messages
          })
        }
      };
    }

    const baseUrl = provider.baseUrl.replace(/\/$/, '');
    let url;
    if (provider.azure) {
      url = `${baseUrl}/openai/deployments/${provider.model}/chat/completions?api-version=2024-02-01`;
    } else {
      url = `${baseUrl}/v1/chat/completions`;
    }

    const headers = {
      'Content-Type': 'application/json',
      ...provider.headers
    };
    if (provider.apiKey) {
      if (provider.azure) {
        headers['api-key'] = provider.apiKey;
      } else {
        headers['Authorization'] = `Bearer ${provider.apiKey}`;
      }
    }

    return {
      url,
      options: {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: provider.model || undefined,
          messages,
          stream
        })
      }
    };
  }
};
