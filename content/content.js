// Skills on Edge - Content Script
// Extracts page content and handles skill execution on the page

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
  // Get the main readable content from the page
  const article = document.querySelector('article') || document.querySelector('main') || document.body;

  return {
    title: document.title,
    url: window.location.href,
    text: article.innerText.substring(0, 50000), // limit to ~50k chars
    selection: window.getSelection().toString()
  };
}
