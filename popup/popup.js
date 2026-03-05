// Skills on Edge - Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  const skillsListEl = document.getElementById('skills-list');
  const outputSection = document.getElementById('output');
  const resultDiv = document.getElementById('result');
  const closeBtn = document.getElementById('close-output');
  const copyBtn = document.getElementById('copy-output');
  const providerSelect = document.getElementById('provider-select');
  const langSelect = document.getElementById('lang-select');
  const popoutBtn = document.getElementById('popout-output');
  const settingsLink = document.getElementById('settings-link');

  const LANGUAGES = [
    { label: '中文', value: 'Chinese' },
    { label: 'English', value: 'English' },
    { label: '日本語', value: 'Japanese' },
    { label: '한국어', value: 'Korean' },
    { label: 'Español', value: 'Spanish' },
    { label: 'Français', value: 'French' },
    { label: 'Deutsch', value: 'German' },
    { label: 'Русский', value: 'Russian' },
    { label: 'Português', value: 'Portuguese' },
    { label: 'العربية', value: 'Arabic' }
  ];

  // Load providers into selector
  const providers = await Providers.getAll();
  const active = await Providers.getActive();

  providers.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    if (p.id === active.id) opt.selected = true;
    providerSelect.appendChild(opt);
  });

  providerSelect.addEventListener('change', () => {
    Providers.setActive(providerSelect.value);
  });

  // Load language selector
  const { outputLang } = await chrome.storage.local.get('outputLang');
  LANGUAGES.forEach(({ label, value }) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    if (value === (outputLang || 'Chinese')) opt.selected = true;
    langSelect.appendChild(opt);
  });

  langSelect.addEventListener('change', () => {
    chrome.storage.local.set({ outputLang: langSelect.value });
  });

  // Render skill buttons
  const skills = getAllSkills();
  skills.forEach(skill => {
    const btn = document.createElement('button');
    btn.className = 'skill-btn';
    btn.dataset.skill = skill.id;
    btn.textContent = `${skill.icon} ${skill.name}`;
    btn.addEventListener('click', () => {
      if (skill.needsUserInput) {
        showUserInputPrompt(skill);
      } else {
        runSkill(skill.id);
      }
    });
    skillsListEl.appendChild(btn);
  });

  function showUserInputPrompt(skill) {
    resultDiv.innerHTML = '';
    outputSection.classList.remove('hidden');

    const prompt = document.createElement('div');
    prompt.className = 'user-input-prompt';

    const textarea = document.createElement('textarea');
    textarea.id = 'user-input';
    textarea.placeholder = skill.inputPlaceholder || 'Type here...';
    textarea.rows = 4;

    const submitBtn = document.createElement('button');
    submitBtn.className = 'skill-btn';
    submitBtn.textContent = 'Check';
    submitBtn.addEventListener('click', () => {
      const text = textarea.value.trim();
      if (!text) return;
      runSkill(skill.id, { userInput: text });
    });

    // Submit on Ctrl+Enter
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        submitBtn.click();
      }
    });

    prompt.appendChild(textarea);
    prompt.appendChild(submitBtn);
    resultDiv.appendChild(prompt);
    textarea.focus();
  }

  closeBtn.addEventListener('click', () => {
    outputSection.classList.add('hidden');
  });

  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(resultDiv.textContent);
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
  });

  popoutBtn.addEventListener('click', async () => {
    const raw = resultDiv.textContent;
    if (!raw) return;
    await chrome.storage.local.set({ popoutContent: raw });
    chrome.tabs.create({ url: chrome.runtime.getURL('output/output.html') });
  });

  settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // Stats panel
  const statsPanel = document.getElementById('stats-panel');
  const statsContent = document.getElementById('stats-content');
  const statsLink = document.getElementById('stats-link');
  const closeStats = document.getElementById('close-stats');

  statsLink.addEventListener('click', async (e) => {
    e.preventDefault();
    statsPanel.classList.toggle('hidden');
    if (!statsPanel.classList.contains('hidden')) {
      await renderStats();
    }
  });

  closeStats.addEventListener('click', () => {
    statsPanel.classList.add('hidden');
  });

  async function renderStats() {
    statsContent.innerHTML = 'Loading...';
    const stats = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
    if (!stats) {
      statsContent.innerHTML = 'Could not load stats.';
      return;
    }

    const fmt = n => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n;

    let html = `<div class="stats-total">
      <div class="stat-card"><div class="stat-val">${fmt(stats.total.sent)}</div><div class="stat-label">Sent</div></div>
      <div class="stat-card"><div class="stat-val">${fmt(stats.total.received)}</div><div class="stat-label">Received</div></div>
      <div class="stat-card"><div class="stat-val">${stats.total.requests}</div><div class="stat-label">Requests</div></div>
    </div>`;

    // Daily chart (7 days)
    html += '<div class="stats-section-title">Daily (past 7 days)</div>';
    html += renderBarChart(stats.daily);

    // Hourly chart (24h)
    html += '<div class="stats-section-title">Hourly (past 24h)</div>';
    html += renderBarChart(stats.hourly);

    statsContent.innerHTML = html;
  }

  function renderBarChart(data) {
    const maxVal = Math.max(...data.map(d => d.sent + d.received), 1);
    let html = '<div class="bar-chart">';
    data.forEach(d => {
      const total = d.sent + d.received;
      const pct = Math.max((total / maxVal) * 100, 1);
      const sentPct = total > 0 ? (d.sent / total) * 100 : 50;
      html += `<div class="bar-row" title="${d.label}: ${d.sent} sent, ${d.received} received, ${d.requests} req">
        <div class="bar-label">${d.label}</div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${pct}%">
            <div class="bar-sent" style="width:${sentPct}%"></div>
          </div>
        </div>
        <div class="bar-val">${total > 0 ? total : ''}</div>
      </div>`;
    });
    html += '</div>';
    return html;
  }

  // Track pending skill when waiting for clipboard paste
  let pendingSkillId = null;

  async function runSkill(skillId, extraSettings) {
    const skill = getSkill(skillId);
    if (!skill) return;

    resultDiv.textContent = '';
    outputSection.classList.remove('hidden');
    setSkillButtonsDisabled(true);

    // Get page content
    let content;
    try {
      content = await chrome.runtime.sendMessage({ type: 'GET_PAGE_CONTENT' });
    } catch {
      content = null;
    }

    if (!content) {
      // Show clipboard fallback
      pendingSkillId = skillId;
      resultDiv.innerHTML = '';
      const notice = document.createElement('div');
      notice.className = 'paste-fallback';
      notice.innerHTML = `<p>Cannot access this page. Copy content first (Ctrl+C), then paste below:</p>`;
      const textarea = document.createElement('textarea');
      textarea.id = 'paste-input';
      textarea.placeholder = 'Paste content here (Ctrl+V)...';
      textarea.rows = 5;
      const goBtn = document.createElement('button');
      goBtn.className = 'skill-btn';
      goBtn.textContent = 'Go';
      goBtn.addEventListener('click', () => {
        const text = textarea.value.trim();
        if (!text) return;
        runSkillWithContent(skillId, {
          title: '(pasted content)',
          url: '',
          text,
          selection: text
        }, extraSettings);
      });
      resultDiv.appendChild(notice);
      resultDiv.appendChild(textarea);
      resultDiv.appendChild(goBtn);
      setSkillButtonsDisabled(false);
      return;
    }

    if (skill.needsSelection && !content.selection) {
      resultDiv.textContent = 'Please select some text on the page first, then try again.';
      setSkillButtonsDisabled(false);
      return;
    }

    runSkillWithContent(skillId, content, extraSettings);
  }

  async function runSkillWithContent(skillId, content, extraSettings) {
    const skill = getSkill(skillId);
    if (!skill) return;

    resultDiv.textContent = '';
    setSkillButtonsDisabled(true);

    // Build settings from current language selection
    const selectedLang = langSelect.value;
    const skillSettings = { outputLang: selectedLang, ...extraSettings };

    // For translate, also set translateLang to the same output language
    if (skillId === 'translate') {
      skillSettings.translateLang = selectedLang;
    }

    const provider = await Providers.getActive();
    const messages = skill.buildMessages(content, skillSettings);

    // Stream via background service worker
    resultDiv.textContent = 'Thinking...';

    const port = chrome.runtime.connect({ name: 'ai-stream' });

    port.onMessage.addListener((msg) => {
      if (msg.type === 'STREAM_TOKEN') {
        if (resultDiv.textContent === 'Thinking...') {
          resultDiv.textContent = '';
        }
        resultDiv.textContent += msg.token;
        outputSection.scrollTop = outputSection.scrollHeight;
      } else if (msg.type === 'STREAM_DONE') {
        setSkillButtonsDisabled(false);
        port.disconnect();
      } else if (msg.type === 'STREAM_ERROR') {
        resultDiv.textContent = `Error: ${msg.error}`;
        setSkillButtonsDisabled(false);
        port.disconnect();
      }
    });

    port.postMessage({
      type: 'STREAM_REQUEST',
      provider,
      messages,
      skillId
    });
  }

  function setSkillButtonsDisabled(disabled) {
    document.querySelectorAll('.skill-btn').forEach(btn => {
      btn.disabled = disabled;
      btn.classList.toggle('loading', disabled);
    });
  }
});
