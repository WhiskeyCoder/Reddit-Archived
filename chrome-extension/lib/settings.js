/** @typedef {{
 *   includeComments: boolean;
 *   includeImages: boolean;
 *   includeVideos: boolean;
 *   subfolderBySubreddit: boolean;
 *   filenamePattern: string;
 *   addDatePrefix: boolean;
 *   outputFolderName: string;
 * }} ExtensionSettings */

const DEFAULT_SETTINGS = {
  includeComments: true,
  includeImages: true,
  includeVideos: true,
  subfolderBySubreddit: false,
  filenamePattern: '{title}',
  addDatePrefix: true,
  outputFolderName: ''
};

/** @returns {Promise<ExtensionSettings>} */
export async function loadSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

/** @param {Partial<ExtensionSettings>} patch */
export async function saveSettings(patch) {
  await chrome.storage.sync.set(patch);
}
