// Create a context menu item and open the popup with selected text
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'ai_flashcard',
    title: 'Create flashcard with AI',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'ai_flashcard') return;

  // info.selectionText may be available directly, but we'll prefer it when present
  const selection = info.selectionText || '';

  // Pass the originating tab id so the popup can inject back into that tab
  const url = chrome.runtime.getURL('popup.html') + '?text=' + encodeURIComponent(selection) + '&srcTabId=' + encodeURIComponent(tab.id);
  chrome.windows.create({ url, type: 'popup', width: 600, height: 680 });
});
