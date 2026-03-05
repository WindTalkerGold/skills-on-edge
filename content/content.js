// Skills on Edge - Content Script
// Extracts page content and handles skill execution on the page

// Track last known selection — survives popup focus stealing
let lastSelection = '';
document.addEventListener('mouseup', () => {
  const sel = window.getSelection().toString();
  if (sel) lastSelection = sel;
});
document.addEventListener('keyup', () => {
  const sel = window.getSelection().toString();
  if (sel) lastSelection = sel;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXTRACT_CONTENT') {
    const content = extractPageContent();
    sendResponse(content);
  }

  if (message.type === 'RUN_SKILL') {
    // TODO: Open skill panel with selected text
    console.log('[Skills on Edge] Run skill on:', message.text);
  }

  if (message.type === 'SET_HOVER_MODE') {
    setHoverMode(message.enabled, message.alias, message.delay);
    sendResponse({ ok: true });
  }
});

function extractPageContent() {
  // Get the main readable content from the page
  const article = document.querySelector('article') || document.querySelector('main') || document.body;
  // Use live selection if available, otherwise fall back to last captured selection
  const liveSelection = window.getSelection().toString();
  const selection = liveSelection || lastSelection;

  return {
    title: document.title,
    url: window.location.href,
    text: article.innerText.substring(0, 50000), // limit to ~50k chars
    selection
  };
}

// ─── C# Symbol Hover ───

const hoverState = {
  enabled: false,
  alias: 'finalizer',
  delay: 3000,
  timer: null,
  lastSymbol: null,
  lastX: 0,
  lastY: 0,
  querying: false,
  modal: null
};

function setHoverMode(enabled, alias, delay) {
  hoverState.enabled = enabled;
  if (alias) hoverState.alias = alias;
  if (delay != null) hoverState.delay = delay;

  if (enabled) {
    document.addEventListener('mousemove', onHoverMouseMove);
    document.addEventListener('keydown', onHoverKeyDown);
  } else {
    document.removeEventListener('mousemove', onHoverMouseMove);
    document.removeEventListener('keydown', onHoverKeyDown);
    clearTimeout(hoverState.timer);
    dismissHoverModal();
  }
}

function onHoverKeyDown(e) {
  if (e.key === 'Escape') dismissHoverModal();
}

function onHoverMouseMove(e) {
  // Don't reset timer or trigger new lookups if modal is open
  if (hoverState.modal) return;

  hoverState.lastX = e.clientX;
  hoverState.lastY = e.clientY;

  clearTimeout(hoverState.timer);

  hoverState.timer = setTimeout(() => {
    if (!hoverState.enabled || hoverState.querying || hoverState.modal) return;
    const word = getWordAtPoint(e.clientX, e.clientY);
    if (word && word !== hoverState.lastSymbol && isLikelySymbol(word)) {
      hoverState.lastSymbol = word;
      querySymbol(word, e.clientX, e.clientY);
    }
  }, hoverState.delay);
}

function getWordAtPoint(x, y) {
  let range;
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(x, y);
  } else if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(x, y);
    if (!pos || !pos.offsetNode) return null;
    range = document.createRange();
    range.setStart(pos.offsetNode, pos.offset);
    range.setEnd(pos.offsetNode, pos.offset);
  }

  if (!range || !range.startContainer || range.startContainer.nodeType !== Node.TEXT_NODE) return null;

  const textNode = range.startContainer;
  const text = textNode.textContent;
  const offset = range.startOffset;

  // Expand to word boundaries (C# identifiers: letters, digits, underscore)
  let start = offset, end = offset;
  while (start > 0 && /[\w]/.test(text[start - 1])) start--;
  while (end < text.length && /[\w]/.test(text[end])) end++;

  const word = text.substring(start, end);
  return word.length >= 2 ? word : null;
}

function isLikelySymbol(word) {
  // Filter out common English words, numbers-only, very short words
  if (/^\d+$/.test(word)) return false;
  if (word.length < 2) return false;
  // PascalCase or camelCase or has underscore → likely a symbol
  if (/^[A-Z][a-z]/.test(word) || /[a-z][A-Z]/.test(word) || word.includes('_')) return true;
  // All caps (constants) → likely a symbol
  if (/^[A-Z_]{2,}$/.test(word)) return true;
  // Interface naming convention
  if (/^I[A-Z]/.test(word)) return true;
  // Default: accept if starts with uppercase (likely a type name)
  if (/^[A-Z]/.test(word)) return true;
  return false;
}

function getWordRectAtPoint(x, y) {
  let range;
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(x, y);
  } else if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(x, y);
    if (!pos || !pos.offsetNode) return null;
    range = document.createRange();
    range.setStart(pos.offsetNode, pos.offset);
    range.setEnd(pos.offsetNode, pos.offset);
  }
  if (!range || !range.startContainer || range.startContainer.nodeType !== Node.TEXT_NODE) return null;

  const textNode = range.startContainer;
  const text = textNode.textContent;
  const offset = range.startOffset;
  let start = offset, end = offset;
  while (start > 0 && /[\w]/.test(text[start - 1])) start--;
  while (end < text.length && /[\w]/.test(text[end])) end++;

  const wordRange = document.createRange();
  wordRange.setStart(textNode, start);
  wordRange.setEnd(textNode, end);
  return wordRange.getBoundingClientRect();
}

function querySymbol(symbol, x, y) {
  hoverState.querying = true;
  const wordRect = getWordRectAtPoint(x, y);
  showHoverModal(wordRect, x, y, null, true); // show loading

  chrome.runtime.sendMessage(
    { type: 'SYMBOL_QUERY', symbol, alias: hoverState.alias },
    (response) => {
      hoverState.querying = false;
      if (chrome.runtime.lastError) {
        showHoverModal(wordRect, x, y, { error: 'Extension error: ' + chrome.runtime.lastError.message });
        return;
      }
      if (!response || response.error) {
        showHoverModal(wordRect, x, y, { error: (response && response.error) || 'No response' });
        return;
      }
      showHoverModal(wordRect, x, y, response);
    }
  );
}

function dismissHoverModal() {
  if (hoverState.modal) {
    hoverState.modal.remove();
    hoverState.modal = null;
  }
  hoverState.lastSymbol = null;
}

function popoutHoverModal(data, shadow) {
  // Grab the rendered modal HTML + styles from shadow DOM
  const modalEl = shadow.querySelector('.modal');
  if (!modalEl) return;
  const modalHtml = modalEl.innerHTML;

  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>C# Symbol: ${escapeHtml(data.matchedName || 'Symbol')}</title>
<style>
  body {
    margin: 0;
    background: #11111b;
    color: #cdd6f4;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    line-height: 1.5;
    display: flex;
    justify-content: center;
    padding: 24px;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  .modal {
    width: 600px;
    max-width: 100%;
    background: #181825;
    border: 1px solid #313244;
    border-radius: 12px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.6);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  ${MODAL_CSS.replace(':host {', ':host-unused {').replace(/\.(modal)\s*\{[^}]+\}/m, '')}
</style>
</head>
<body>
<div class="modal">
${modalHtml}
</div>
<script>
  // Wire collapsible sections
  document.querySelectorAll('.section-hdr').forEach(hdr => {
    hdr.addEventListener('click', () => {
      const list = hdr.nextElementSibling;
      if (list) { list.classList.toggle('collapsed'); hdr.classList.toggle('collapsed'); }
    });
  });
  // Wire click-to-expand values
  document.querySelectorAll('.val').forEach(val => {
    val.addEventListener('click', (e) => { e.stopPropagation(); val.classList.toggle('expanded'); });
  });
  // Wire search/filter
  document.querySelectorAll('.member-search, .ref-search').forEach(input => {
    input.addEventListener('input', () => {
      const q = input.value.toLowerCase();
      const list = input.closest('.section-list');
      if (!list) return;
      list.querySelectorAll('[data-search]').forEach(item => {
        item.classList.toggle('search-hidden', q && !item.dataset.search.includes(q));
      });
    });
    input.addEventListener('click', (e) => e.stopPropagation());
  });
  // Hide popout + close buttons in the popped-out view
  document.querySelectorAll('.popout-btn, .close-btn').forEach(b => b.style.display = 'none');
</script>
</body>
</html>`;

  const blob = new Blob([fullHtml], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  // Revoke after a delay so the new tab has time to load
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ─── Shadow DOM styles (fully isolated from host page) ───
const MODAL_CSS = `
  :host {
    all: initial;
    position: fixed;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    line-height: 1.5;
    color: #cdd6f4;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .modal {
    width: 420px;
    max-height: 460px;
    background: #181825;
    border: 1px solid #313244;
    border-radius: 12px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.6), 0 0 1px rgba(137,180,250,0.15);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── Arrow ── */
  .arrow {
    position: absolute;
    width: 12px; height: 12px;
    background: #1e1e2e;
    border: 1px solid #313244;
    transform: rotate(45deg);
  }
  .arrow-top { border-bottom: none; border-right: none; }
  .arrow-bottom { border-top: none; border-left: none; }

  /* ── Titlebar ── */
  .titlebar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px 10px;
    background: linear-gradient(135deg, #1e1e2e 0%, #181825 100%);
    border-bottom: 1px solid #313244;
    flex-shrink: 0;
  }
  .title-icon { font-size: 18px; flex-shrink: 0; }
  .title-name {
    font-size: 15px;
    font-weight: 600;
    color: #cdd6f4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }
  .kind-badge {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    padding: 2px 8px;
    border-radius: 6px;
    flex-shrink: 0;
  }
  .kind-class    { background: #89b4fa1a; color: #89b4fa; }
  .kind-interface { background: #a6e3a11a; color: #a6e3a1; }
  .kind-enum     { background: #f9e2af1a; color: #f9e2af; }
  .kind-struct   { background: #fab3871a; color: #fab387; }
  .kind-delegate { background: #cba6f71a; color: #cba6f7; }
  .kind-default  { background: #9399b21a; color: #9399b2; }

  .titlebar-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: auto;
    flex-shrink: 0;
  }
  .title-btn {
    width: 26px; height: 26px;
    display: flex; align-items: center; justify-content: center;
    border: none;
    background: transparent;
    color: #6c7086;
    font-size: 14px;
    cursor: pointer;
    border-radius: 6px;
    flex-shrink: 0;
    transition: background 0.15s, color 0.15s;
    line-height: 1;
  }
  .title-btn:hover { background: #89b4fa1a; color: #89b4fa; }
  .close-btn {
    width: 26px; height: 26px;
    display: flex; align-items: center; justify-content: center;
    border: none;
    background: transparent;
    color: #6c7086;
    font-size: 18px;
    cursor: pointer;
    border-radius: 6px;
    flex-shrink: 0;
    transition: background 0.15s, color 0.15s;
    line-height: 1;
  }
  .close-btn:hover { background: #f38ba81a; color: #f38ba8; }

  /* ── Body ── */
  .body {
    padding: 10px 14px 14px;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }
  .body::-webkit-scrollbar { width: 5px; }
  .body::-webkit-scrollbar-track { background: transparent; }
  .body::-webkit-scrollbar-thumb { background: #45475a; border-radius: 3px; }

  /* ── Info rows ── */
  .info { display: flex; flex-direction: column; gap: 4px; }
  .row {
    display: flex;
    font-size: 12px;
    gap: 8px;
    line-height: 1.6;
  }
  .label {
    color: #6c7086;
    flex-shrink: 0;
    min-width: 76px;
    font-weight: 500;
  }
  .val {
    color: #bac2de;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
    border-radius: 3px;
    padding: 0 2px;
    transition: background 0.1s;
  }
  .val:hover { background: #313244; }
  .val.expanded {
    white-space: normal;
    word-break: break-all;
    overflow: visible;
  }
  .val-hl { color: #89b4fa; }

  /* ── Sections ── */
  .section { margin-top: 8px; }
  .section-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 0 4px;
    border-top: 1px solid #313244;
    cursor: pointer;
    user-select: none;
  }
  .section-hdr:hover .section-title { color: #a6adc8; }
  .section-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #6c7086;
    transition: color 0.1s;
  }
  .section-hdr .chevron {
    font-size: 10px;
    color: #6c7086;
    transition: transform 0.15s;
    margin-right: 4px;
  }
  .section-hdr.collapsed .chevron { transform: rotate(-90deg); }
  .count {
    font-size: 10px;
    background: #313244;
    color: #a6adc8;
    padding: 1px 7px;
    border-radius: 10px;
    font-weight: 600;
  }
  .section-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding-top: 2px;
  }
  .section-list.collapsed { display: none; }

  /* ── Members ── */
  .member {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 12px;
    padding: 3px 8px;
    border-radius: 6px;
    font-family: 'Cascadia Code', 'Consolas', 'Courier New', monospace;
    transition: background 0.1s;
  }
  .member:hover { background: #1e1e2e; }
  .m-icon {
    flex-shrink: 0;
    width: 16px;
    text-align: center;
    font-size: 11px;
    font-weight: 700;
    border-radius: 3px;
    padding: 0 2px;
    line-height: 18px;
  }
  .m-icon.method   { color: #cba6f7; background: #cba6f70d; }
  .m-icon.property { color: #89b4fa; background: #89b4fa0d; }
  .m-icon.field    { color: #fab387; background: #fab3870d; }
  .m-icon.event    { color: #f9e2af; background: #f9e2af0d; }
  .m-icon.ctor     { color: #89dceb; background: #89dceb0d; }
  .m-name {
    color: #cdd6f4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .m-type {
    color: #585b70;
    margin-left: auto;
    flex-shrink: 0;
    font-size: 11px;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ── Refs ── */
  .ref {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 6px;
    font-family: 'Cascadia Code', 'Consolas', 'Courier New', monospace;
    color: #a6adc8;
    transition: background 0.1s;
  }
  .ref:hover { background: #1e1e2e; }
  .ref-line { color: #585b70; }

  /* ── Other matches ── */
  .other {
    font-size: 11px;
    padding: 2px 8px;
    color: #a6adc8;
    font-family: 'Cascadia Code', 'Consolas', 'Courier New', monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .more {
    font-size: 10px;
    color: #585b70;
    padding: 3px 8px;
    font-style: italic;
  }

  /* ── Search filter ── */
  .search-box {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    margin-bottom: 4px;
  }
  .search-box input {
    flex: 1;
    background: #1e1e2e;
    border: 1px solid #313244;
    border-radius: 5px;
    padding: 4px 8px;
    font-size: 11px;
    color: #cdd6f4;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s;
  }
  .search-box input:focus { border-color: #89b4fa; }
  .search-box input::placeholder { color: #585b70; }
  .search-match { display: flex; }
  .search-hidden { display: none !important; }

  /* ── Deep-dive hint ── */
  .deepdive {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    margin-top: 6px;
    background: #89b4fa0a;
    border: 1px solid #89b4fa15;
    border-radius: 6px;
    font-size: 11px;
    color: #6c7086;
  }
  .deepdive code {
    background: #313244;
    padding: 1px 5px;
    border-radius: 3px;
    color: #a6adc8;
    font-family: 'Cascadia Code', 'Consolas', monospace;
    font-size: 10px;
  }

  /* ── Loading / Error ── */
  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 24px 14px;
    color: #6c7086;
    font-size: 13px;
  }
  .spinner {
    width: 18px; height: 18px;
    border: 2px solid #89b4fa;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .error {
    padding: 16px;
    color: #f38ba8;
    font-size: 12px;
    text-align: center;
  }
`;

function showHoverModal(wordRect, cursorX, cursorY, data, loading) {
  dismissHoverModal();

  // Create host element + shadow root for style isolation
  const host = document.createElement('div');
  host.id = 'soe-hover-host';
  host.style.cssText = 'all:initial; position:fixed; z-index:2147483647; pointer-events:auto;';
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = MODAL_CSS;
  shadow.appendChild(style);

  const modal = document.createElement('div');
  modal.className = 'modal';

  if (loading) {
    modal.innerHTML = '<div class="loading"><div class="spinner"></div> Looking up symbol\u2026</div>';
  } else if (data.error) {
    modal.innerHTML = `<div class="titlebar">
      <span class="title-icon">⚠️</span>
      <span class="title-name">Error</span>
      <button class="close-btn" title="Close (Esc)">\u00d7</button>
    </div><div class="error">${escapeHtml(data.error)}</div>`;
  } else {
    modal.innerHTML = buildModalContent(data);
  }

  shadow.appendChild(modal);
  document.body.appendChild(host);
  hoverState.modal = host;

  // Wire close button
  const closeBtn = shadow.querySelector('.close-btn');
  if (closeBtn) closeBtn.addEventListener('click', dismissHoverModal);

  // Wire pop-out button
  const popoutBtn = shadow.querySelector('.popout-btn');
  if (popoutBtn && data && !data.error) {
    popoutBtn.addEventListener('click', () => popoutHoverModal(data, shadow));
  }

  // Wire collapsible sections
  shadow.querySelectorAll('.section-hdr').forEach(hdr => {
    hdr.addEventListener('click', () => {
      const list = hdr.nextElementSibling;
      if (list) {
        list.classList.toggle('collapsed');
        hdr.classList.toggle('collapsed');
      }
    });
  });

  // Wire click-to-expand on truncated values
  shadow.querySelectorAll('.val').forEach(val => {
    val.addEventListener('click', (e) => {
      e.stopPropagation();
      val.classList.toggle('expanded');
    });
  });

  // Wire search/filter inputs
  shadow.querySelectorAll('.member-search, .ref-search').forEach(input => {
    input.addEventListener('input', () => {
      const query = input.value.toLowerCase();
      const list = input.closest('.section-list');
      if (!list) return;
      list.querySelectorAll('[data-search]').forEach(item => {
        const match = !query || item.dataset.search.includes(query);
        item.classList.toggle('search-hidden', !match);
      });
    });
    // Prevent section collapse when clicking in search box
    input.addEventListener('click', (e) => e.stopPropagation());
  });

  // ─── Positioning ───
  const modalRect = modal.getBoundingClientRect();
  const anchorX = wordRect ? (wordRect.left + wordRect.right) / 2 : cursorX;
  const anchorTop = wordRect ? wordRect.top : cursorY;
  const anchorBottom = wordRect ? wordRect.bottom : cursorY;

  let left = anchorX - modalRect.width / 2;
  let arrowLeft = modalRect.width / 2;

  if (left < 8) { arrowLeft += left - 8; left = 8; }
  if (left + modalRect.width > window.innerWidth - 8) {
    const over = (left + modalRect.width) - (window.innerWidth - 8);
    arrowLeft += over;
    left -= over;
  }
  arrowLeft = Math.max(16, Math.min(arrowLeft, modalRect.width - 16));

  const gap = 10;
  let top, arrowClass;
  if (anchorBottom + gap + modalRect.height <= window.innerHeight - 8) {
    top = anchorBottom + gap;
    arrowClass = 'arrow-top';
  } else {
    top = anchorTop - gap - modalRect.height;
    arrowClass = 'arrow-bottom';
  }
  if (top < 8) top = 8;

  host.style.left = left + 'px';
  host.style.top = top + 'px';

  // Add arrow
  const arrow = document.createElement('div');
  arrow.className = 'arrow ' + arrowClass;
  arrow.style.left = (arrowLeft - 6) + 'px';
  if (arrowClass === 'arrow-top') {
    arrow.style.top = '-7px';
  } else {
    arrow.style.bottom = '-7px';
  }
  modal.style.position = 'relative';
  modal.appendChild(arrow);
}

function buildModalContent(data) {
  const { typeInfo, searchResults, references, matchedName } = data;
  const info = typeInfo || (searchResults && searchResults[0]) || {};

  const name = info.name || info.Name || matchedName || '?';
  const kind = info.kind || info.Kind || info.typeKind || info.TypeKind || 'symbol';
  const kindIcon = getKindIcon(kind);
  const shortName = name.includes('.') ? name.split('.').pop() : name;
  const kindClass = getKindClass(kind);

  // ─── Titlebar ───
  let html = `<div class="titlebar">
    <span class="title-icon">${kindIcon}</span>
    <span class="title-name">${escapeHtml(shortName)}</span>
    <span class="kind-badge ${kindClass}">${escapeHtml(kind)}</span>
    <div class="titlebar-actions">
      <button class="title-btn popout-btn" title="Pop out to new tab">\u2197</button>
      <button class="close-btn" title="Close (Esc)">\u00d7</button>
    </div>
  </div>`;

  // ─── Body ───
  html += '<div class="body"><div class="info">';

  const ns = info.namespace || info.Namespace || info.containingNamespace || info.ContainingNamespace;
  if (ns) {
    html += `<div class="row"><span class="label">Namespace</span><span class="val" title="Click to expand">${escapeHtml(ns)}</span></div>`;
  }

  const fullName = info.fullName || info.FullName || matchedName;
  if (fullName && fullName !== shortName && fullName !== ns + '.' + shortName) {
    html += `<div class="row"><span class="label">Full name</span><span class="val" title="Click to expand">${escapeHtml(fullName)}</span></div>`;
  }

  const baseType = info.baseType || info.BaseType || info.baseTypeName || info.BaseTypeName;
  if (baseType && baseType !== 'object') {
    html += `<div class="row"><span class="label">Base</span><span class="val val-hl" title="Click to expand">${escapeHtml(baseType)}</span></div>`;
  }

  const ifaces = info.interfaces || info.Interfaces || [];
  if (ifaces.length > 0) {
    html += `<div class="row"><span class="label">Implements</span><span class="val val-hl" title="Click to expand">${escapeHtml(ifaces.join(', '))}</span></div>`;
  }

  const file = info.filePath || info.FilePath || info.file || info.File;
  const line = info.line || info.Line;
  if (file) {
    const short = file.replace(/^.*[/\\]/, '');
    html += `<div class="row"><span class="label">File</span><span class="val">${escapeHtml(short)}${line ? ':' + line : ''}</span></div>`;
  }

  html += '</div>'; // .info

  // ─── Members ───
  const members = info.members || info.Members || [];
  if (members.length > 0) {
    const hasSearch = members.length > 15;
    html += `<div class="section">
      <div class="section-hdr">
        <span class="section-title"><span class="chevron">\u25bc</span> Members</span>
        <span class="count">${members.length}</span>
      </div>
      <div class="section-list">`;
    if (hasSearch) {
      html += `<div class="search-box"><input type="text" class="member-search" placeholder="Filter members\u2026" data-target="members"></div>`;
    }
    members.forEach(m => {
      const mName = m.name || m.Name || '?';
      const mKind = m.kind || m.Kind || '';
      const mType = m.returnType || m.ReturnType || m.type || m.Type || '';
      const iconCls = getMemberIconClass(mKind);
      const icon = getMemberIconLetter(mKind);
      html += `<div class="member" data-search="${escapeHtml(mName.toLowerCase())}">
        <span class="m-icon ${iconCls}">${icon}</span>
        <span class="m-name">${escapeHtml(mName)}</span>
        ${mType ? `<span class="m-type" title="${escapeHtml(mType)}">${escapeHtml(simplifyType(mType))}</span>` : ''}
      </div>`;
    });
    html += '</div></div>';

    // Deep-dive hint for large types
    if (members.length > 50) {
      const skillName = hoverState.alias || 'finalizer';
      html += `<div class="deepdive">\u{1f4a1} Large type (${members.length} members) \u2014 for deep analysis use <code>/csharp-roslyn-${escapeHtml(skillName)}</code> in Claude Code</div>`;
    }
  }

  // ─── References ───
  const refs = references || [];
  if (refs.length > 0) {
    const hasRefSearch = refs.length > 15;
    html += `<div class="section">
      <div class="section-hdr collapsed">
        <span class="section-title"><span class="chevron">\u25bc</span> References</span>
        <span class="count">${refs.length}</span>
      </div>
      <div class="section-list collapsed">`;
    if (hasRefSearch) {
      html += `<div class="search-box"><input type="text" class="ref-search" placeholder="Filter references\u2026" data-target="refs"></div>`;
    }
    refs.forEach(r => {
      const rFile = (r.filePath || r.FilePath || r.file || r.File || '?').replace(/^.*[/\\]/, '');
      const rLine = r.line || r.Line || '';
      html += `<div class="ref" data-search="${escapeHtml(rFile.toLowerCase())}">
        <span>${escapeHtml(rFile)}</span>
        ${rLine ? `<span class="ref-line">:${rLine}</span>` : ''}
      </div>`;
    });
    html += '</div></div>';
  }

  // ─── Other matches ───
  if (searchResults && searchResults.length > 1) {
    html += `<div class="section">
      <div class="section-hdr collapsed">
        <span class="section-title"><span class="chevron">\u25bc</span> Other matches</span>
        <span class="count">${searchResults.length - 1}</span>
      </div>
      <div class="section-list collapsed">`;
    searchResults.slice(1).forEach(r => {
      const rName = r.fullName || r.FullName || r.name || r.Name || '?';
      html += `<div class="other">${escapeHtml(rName)}</div>`;
    });
    html += '</div></div>';
  }

  html += '</div>'; // .body
  return html;
}

function simplifyType(fullType) {
  return fullType
    .replace(/System\.Collections\.Generic\./g, '')
    .replace(/System\.Threading\.Tasks\./g, '')
    .replace(/System\./g, '')
    .replace(/Microsoft\.\w+\.\w+\./g, '');
}

function getKindClass(kind) {
  const k = (kind || '').toLowerCase();
  if (k.includes('class')) return 'kind-class';
  if (k.includes('interface')) return 'kind-interface';
  if (k.includes('enum')) return 'kind-enum';
  if (k.includes('struct')) return 'kind-struct';
  if (k.includes('delegate')) return 'kind-delegate';
  return 'kind-default';
}

function getMemberIconClass(kind) {
  const k = (kind || '').toLowerCase();
  if (k.includes('method') || k.includes('function')) return 'method';
  if (k.includes('property')) return 'property';
  if (k.includes('field')) return 'field';
  if (k.includes('event')) return 'event';
  if (k.includes('constructor')) return 'ctor';
  return 'method';
}

function getMemberIconLetter(kind) {
  const k = (kind || '').toLowerCase();
  if (k.includes('method') || k.includes('function')) return 'M';
  if (k.includes('property')) return 'P';
  if (k.includes('field')) return 'F';
  if (k.includes('event')) return 'E';
  if (k.includes('constructor')) return 'C';
  return 'M';
}

function getKindIcon(kind) {
  const k = (kind || '').toLowerCase();
  if (k.includes('class')) return '🔷';
  if (k.includes('interface')) return '🟢';
  if (k.includes('enum')) return '🟡';
  if (k.includes('struct')) return '🟠';
  if (k.includes('delegate')) return '🟣';
  if (k.includes('namespace')) return '📦';
  return '⬜';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
