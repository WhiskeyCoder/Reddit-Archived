import { loadSettings, saveSettings } from './lib/settings.js';
import { buildMarkdown } from './lib/markdown-builder.js';
import { buildFilename } from './lib/filename.js';
import {
  loadDirectoryHandle,
  saveDirectoryHandle,
  writeTextFile,
  verifyPermission
} from './lib/file-storage.js';

/** @type {import('./content/extractor.js').RedditPostData | null} */
let postData = null;

const els = {
  statusPanel: document.getElementById('statusPanel'),
  statusMessage: document.getElementById('statusMessage'),
  mainPanel: document.getElementById('mainPanel'),
  loadingPanel: document.getElementById('loadingPanel'),
  postTitle: document.getElementById('postTitle'),
  postSubreddit: document.getElementById('postSubreddit'),
  postAuthor: document.getElementById('postAuthor'),
  postVotes: document.getElementById('postVotes'),
  postComments: document.getElementById('postComments'),
  postMedia: document.getElementById('postMedia'),
  optImages: document.getElementById('optImages'),
  optVideos: document.getElementById('optVideos'),
  optComments: document.getElementById('optComments'),
  folderLabel: document.getElementById('folderLabel'),
  pickFolderBtn: document.getElementById('pickFolderBtn'),
  saveBtn: document.getElementById('saveBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  copyBtn: document.getElementById('copyBtn'),
  actionFeedback: document.getElementById('actionFeedback')
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindEvents();
  await refreshFolderLabel();
  await loadAndApplySettings();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes('reddit.com')) {
    showError('Open a Reddit post in your browser, then click the extension again.');
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/extractor.js']
    });

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => (typeof globalThis.extractRedditPost === 'function'
        ? globalThis.extractRedditPost()
        : { error: 'no_extractor', message: 'Extractor did not load on this page.' })
    });

    if (result?.error) {
      showError(result.message || 'Could not extract this page.');
      return;
    }

    postData = result;
    renderPost(postData);
    els.loadingPanel.classList.add('hidden');
    els.mainPanel.classList.remove('hidden');
  } catch (err) {
    showError(`Extraction failed: ${err.message}. Refresh the Reddit tab and retry.`);
  }
}

function bindEvents() {
  for (const input of [els.optImages, els.optVideos, els.optComments]) {
    input.addEventListener('change', persistToggleSettings);
  }
  els.pickFolderBtn.addEventListener('click', pickOutputFolder);
  els.saveBtn.addEventListener('click', () => runExport('save'));
  els.downloadBtn.addEventListener('click', () => runExport('download'));
  els.copyBtn.addEventListener('click', () => runExport('copy'));
}

async function loadAndApplySettings() {
  const settings = await loadSettings();
  els.optImages.checked = settings.includeImages;
  els.optVideos.checked = settings.includeVideos;
  els.optComments.checked = settings.includeComments;
}

async function persistToggleSettings() {
  await saveSettings({
    includeImages: els.optImages.checked,
    includeVideos: els.optVideos.checked,
    includeComments: els.optComments.checked
  });
}

async function refreshFolderLabel() {
  const settings = await loadSettings();
  const handle = await loadDirectoryHandle();
  if (handle?.name) {
    els.folderLabel.textContent = handle.name;
    return;
  }
  if (settings.outputFolderName) {
    els.folderLabel.textContent = settings.outputFolderName;
    return;
  }
  els.folderLabel.textContent = 'Not configured — choose a folder below';
}

async function pickOutputFolder() {
  if (!('showDirectoryPicker' in window)) {
    showFeedback('Folder picker is not supported in this browser.', true);
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await saveDirectoryHandle(handle);
    await saveSettings({ outputFolderName: handle.name });
    await refreshFolderLabel();
    showFeedback(`Saving to: ${handle.name}`);
  } catch (err) {
    if (err.name !== 'AbortError') {
      showFeedback(err.message, true);
    }
  }
}

function renderPost(post) {
  els.postTitle.textContent = post.title;
  els.postTitle.href = post.postUrl;
  els.postSubreddit.textContent = post.subreddit;
  els.postSubreddit.href = post.subreddit.startsWith('r/')
    ? `https://www.reddit.com/${post.subreddit}`
    : `https://www.reddit.com/r/${post.subreddit}`;
  els.postAuthor.textContent = post.author;
  els.postAuthor.href = `https://www.reddit.com/user/${post.author}/`;
  els.postVotes.textContent = post.vote;
  els.postComments.textContent = post.totalComments;

  const images = post.media.filter((m) => m.type === 'image').length;
  const videos = post.media.filter((m) => m.type !== 'image').length;
  const parts = [];
  if (images) parts.push(`${images} image${images > 1 ? 's' : ''}`);
  if (videos) parts.push(`${videos} video${videos > 1 ? 's' : ''}`);
  els.postMedia.textContent = parts.length ? parts.join(', ') : 'Text only';
}

function showError(message) {
  els.loadingPanel.classList.add('hidden');
  els.mainPanel.classList.add('hidden');
  els.statusPanel.classList.remove('hidden');
  els.statusMessage.textContent = message;
}

function showFeedback(message, isError = false) {
  els.actionFeedback.textContent = message;
  els.actionFeedback.classList.toggle('error', isError);
  els.actionFeedback.classList.remove('hidden');
  setTimeout(() => els.actionFeedback.classList.add('hidden'), 3500);
}

async function getExportPayload() {
  if (!postData) throw new Error('No post loaded');
  const settings = await loadSettings();
  settings.includeImages = els.optImages.checked;
  settings.includeVideos = els.optVideos.checked;
  settings.includeComments = els.optComments.checked;

  const markdown = buildMarkdown(postData, settings);
  const filename = buildFilename(postData.title, postData.subreddit, {
    addDatePrefix: settings.addDatePrefix,
    filenamePattern: settings.filenamePattern
  });

  let relativePath = filename;
  if (settings.subfolderBySubreddit) {
    const folder = postData.subreddit.replace(/^r\//, 'r_').replace(/[^\w-]/g, '_');
    relativePath = `${folder}/${filename}`;
  }

  return { markdown, filename, relativePath, settings };
}

async function runExport(mode) {
  try {
    const { markdown, filename, relativePath } = await getExportPayload();

    if (mode === 'copy') {
      await navigator.clipboard.writeText(markdown);
      showFeedback('Copied to clipboard');
      return;
    }

    if (mode === 'download') {
      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      showFeedback(`Downloaded ${filename}`);
      return;
    }

    if (mode === 'save') {
      let handle = await loadDirectoryHandle();
      if (!handle) {
        await pickOutputFolder();
        handle = await loadDirectoryHandle();
      }
      if (!handle) return;

      const allowed = await verifyPermission(handle, 'readwrite');
      if (!allowed) {
        showFeedback('Folder permission denied. Choose the folder again.', true);
        return;
      }

      await writeTextFile(handle, relativePath, markdown);
      showFeedback(`Saved ${relativePath}`);
    }
  } catch (err) {
    showFeedback(err.message || 'Export failed', true);
  }
}
