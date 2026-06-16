/** Service worker — keeps extension alive for message routing if needed later. */
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({
    includeComments: true,
    includeImages: true,
    includeVideos: true,
    subfolderBySubreddit: false,
    filenamePattern: '{title}',
    addDatePrefix: true
  });
});
