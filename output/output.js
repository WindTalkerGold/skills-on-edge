// Skills on Edge - Output page

document.addEventListener('DOMContentLoaded', async () => {
  const contentEl = document.getElementById('content');
  const copyBtn = document.getElementById('copy-btn');
  const copyHtmlBtn = document.getElementById('copy-html-btn');

  // Read raw markdown from storage
  const { popoutContent } = await chrome.storage.local.get('popoutContent');

  if (!popoutContent) {
    contentEl.innerHTML = '<p style="color:#888;">No content to display.</p>';
    return;
  }

  // Render markdown
  contentEl.innerHTML = Markdown.render(popoutContent);

  // Copy raw markdown
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(popoutContent);
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = 'Copy Markdown'; }, 1500);
  });

  // Copy rendered HTML
  copyHtmlBtn.addEventListener('click', () => {
    const html = contentEl.innerHTML;
    const blob = new Blob([html], { type: 'text/html' });
    navigator.clipboard.write([new ClipboardItem({ 'text/html': blob, 'text/plain': new Blob([popoutContent], { type: 'text/plain' }) })]);
    copyHtmlBtn.textContent = 'Copied!';
    setTimeout(() => { copyHtmlBtn.textContent = 'Copy HTML'; }, 1500);
  });
});
