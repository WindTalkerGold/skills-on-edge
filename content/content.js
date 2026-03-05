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

});

function extractPageContent() {
  const article = document.querySelector('article') || document.querySelector('main') || document.body;
  const liveSelection = window.getSelection().toString();
  let selection = liveSelection || lastSelection;

  // If selection looks truncated (virtual scrolling), try the largest <pre>/<code> block instead
  if (selection && /\n\s*[.…]{2,}\s*\n|\n\s*\.\.\.\s*\n/.test(selection)) {
    let best = '';
    document.querySelectorAll('pre, code').forEach(el => {
      if (el.textContent.length > best.length) best = el.textContent;
    });
    if (best.length > selection.length) selection = best;
  }

  return {
    title: document.title,
    url: window.location.href,
    text: article.innerText.substring(0, 50000),
    selection
  };
}