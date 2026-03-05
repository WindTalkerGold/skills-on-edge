// Skills on Edge - Background Service Worker

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
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'EXTRACT_CONTENT' }, sendResponse);
      }
    });
    return true; // async response
  }
});
