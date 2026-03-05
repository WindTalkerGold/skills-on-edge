// Skills on Edge - Options Page

document.addEventListener('DOMContentLoaded', async () => {
  const providerListEl = document.getElementById('provider-list');
  const defaultProviderEl = document.getElementById('default-provider');
  const addCustomBtn = document.getElementById('add-custom');
  const statusEl = document.getElementById('status');

  let providers = await Providers.getAll();
  const { activeProviderId } = await chrome.storage.local.get('activeProviderId');

  function showStatus(msg) {
    statusEl.textContent = msg;
    statusEl.classList.remove('hidden');
    setTimeout(() => statusEl.classList.add('hidden'), 2000);
  }

  async function fetchModelsForProvider(providerId) {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;

    const refreshBtn = document.querySelector(`[data-refresh="${providerId}"]`);
    const selectEl = document.querySelector(`select[data-id="${providerId}"][data-field="model"]`);
    if (!selectEl) return;

    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.textContent = '...';
    }

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'FETCH_MODELS',
        provider
      });

      if (!result) {
        showStatus('No response from service worker. Try reloading the extension.');
        return;
      }

      if (result.error) {
        showStatus(`Failed to fetch models: ${result.error}`);
        return;
      }

      const models = result.models || [];
      const currentModel = provider.model;

      // Clear and rebuild options
      selectEl.innerHTML = '';

      if (models.length === 0) {
        const opt = document.createElement('option');
        opt.value = currentModel;
        opt.textContent = currentModel || '(no models found)';
        selectEl.appendChild(opt);
      } else {
        // If current model isn't in the list, add it at top
        if (currentModel && !models.includes(currentModel)) {
          const opt = document.createElement('option');
          opt.value = currentModel;
          opt.textContent = currentModel + ' (current)';
          selectEl.appendChild(opt);
        }

        models.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m;
          opt.textContent = m;
          if (m === currentModel) opt.selected = true;
          selectEl.appendChild(opt);
        });
      }

      showStatus(`Found ${models.length} models`);
    } catch (err) {
      showStatus(`Error: ${err.message}`);
    } finally {
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.textContent = 'Refresh';
      }
    }
  }

  function renderProviders() {
    providerListEl.innerHTML = '';
    defaultProviderEl.innerHTML = '';

    providers.forEach(p => {
      const card = document.createElement('div');
      card.className = 'provider-card';

      let fields = '';

      if (p.azure) {
        fields += `
          <label>Endpoint URL (e.g. https://myresource.openai.azure.com)</label>
          <input type="text" class="input" data-id="${p.id}" data-field="baseUrl" value="${p.baseUrl}" placeholder="https://your-resource.openai.azure.com">
        `;
      } else if (!p.builtin || p.id === 'local') {
        fields += `
          <label>Base URL</label>
          <input type="text" class="input" data-id="${p.id}" data-field="baseUrl" value="${p.baseUrl}">
        `;
      }

      if (p.id !== 'local') {
        fields += `
          <label>API Key</label>
          <input type="password" class="input" data-id="${p.id}" data-field="apiKey" value="${p.apiKey}" placeholder="Enter API key">
        `;
      }

      // Model: select dropdown with refresh button
      fields += `
        <label>Model</label>
        <div class="model-row">
          <select class="select model-select" data-id="${p.id}" data-field="model">
            <option value="${p.model}">${p.model || '(none)'}</option>
          </select>
          <button class="btn btn-refresh" data-refresh="${p.id}">Refresh</button>
        </div>
      `;

      const removeBtn = p.builtin ? '' : `<button class="remove-btn" data-remove="${p.id}">Remove</button>`;

      card.innerHTML = `
        <div class="provider-header">
          <span class="provider-name">${p.name}</span>
          ${removeBtn}
        </div>
        ${fields}
      `;
      providerListEl.appendChild(card);

      // Default provider option
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      if (p.id === (activeProviderId || 'local')) opt.selected = true;
      defaultProviderEl.appendChild(opt);
    });

    // Bind text input changes (baseUrl, apiKey)
    providerListEl.querySelectorAll('input[data-id]').forEach(input => {
      input.addEventListener('change', async () => {
        const id = input.dataset.id;
        const field = input.dataset.field;
        const provider = providers.find(p => p.id === id);
        if (provider) {
          provider[field] = input.value;
          await Providers.save(providers);
          showStatus('Saved');
        }
      });
    });

    // Bind model select changes
    providerListEl.querySelectorAll('select[data-field="model"]').forEach(select => {
      select.addEventListener('change', async () => {
        const id = select.dataset.id;
        const provider = providers.find(p => p.id === id);
        if (provider) {
          provider.model = select.value;
          await Providers.save(providers);
          showStatus('Saved');
        }
      });
    });

    // Bind refresh buttons
    providerListEl.querySelectorAll('[data-refresh]').forEach(btn => {
      btn.addEventListener('click', () => {
        fetchModelsForProvider(btn.dataset.refresh);
      });
    });

    // Bind remove buttons
    providerListEl.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.remove;
        providers = providers.filter(p => p.id !== id);
        await Providers.save(providers);
        renderProviders();
        showStatus('Provider removed');
      });
    });
  }

  renderProviders();

  // Default provider change
  defaultProviderEl.addEventListener('change', async () => {
    await Providers.setActive(defaultProviderEl.value);
    showStatus('Default provider updated');
  });

  // Add custom endpoint
  addCustomBtn.addEventListener('click', async () => {
    const provider = {
      id: 'custom_' + Date.now(),
      name: 'Custom Endpoint',
      baseUrl: 'http://localhost:8080',
      apiKey: '',
      model: '',
      headers: {},
      builtin: false
    };
    providers.push(provider);
    await Providers.save(providers);
    renderProviders();
  });
});
