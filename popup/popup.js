// Skills on Edge - Popup Script

document.addEventListener('DOMContentLoaded', () => {
  const skillButtons = document.querySelectorAll('.skill-btn');
  const outputSection = document.getElementById('output');
  const resultDiv = document.getElementById('result');
  const closeBtn = document.getElementById('close-output');

  skillButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const skill = btn.dataset.skill;
      runSkill(skill);
    });
  });

  closeBtn.addEventListener('click', () => {
    outputSection.classList.add('hidden');
  });

  async function runSkill(skillName) {
    resultDiv.textContent = 'Running skill...';
    outputSection.classList.remove('hidden');

    // Get page content from content script
    const content = await chrome.runtime.sendMessage({ type: 'GET_PAGE_CONTENT' });

    if (!content) {
      resultDiv.textContent = 'Could not extract page content. Try refreshing the page.';
      return;
    }

    // TODO: Send to AI backend (Claude API) for processing
    resultDiv.textContent = `[${skillName}] Extracted ${content.text.length} chars from: ${content.title}\n\nBackend integration coming soon.`;
  }
});
