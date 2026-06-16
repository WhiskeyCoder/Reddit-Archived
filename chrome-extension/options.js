import { loadSettings, saveSettings } from './lib/settings.js';
import {
  loadDirectoryHandle,
  saveDirectoryHandle,
  clearDirectoryHandle,
  verifyPermission
} from './lib/file-storage.js';

const els = {
  currentFolder: document.getElementById('currentFolder'),
  chooseFolderBtn: document.getElementById('chooseFolderBtn'),
  clearFolderBtn: document.getElementById('clearFolderBtn'),
  filenamePattern: document.getElementById('filenamePattern'),
  addDatePrefix: document.getElementById('addDatePrefix'),
  subfolderBySubreddit: document.getElementById('subfolderBySubreddit'),
  includeImages: document.getElementById('includeImages'),
  includeVideos: document.getElementById('includeVideos'),
  includeComments: document.getElementById('includeComments'),
  saveStatus: document.getElementById('saveStatus')
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  await refreshFolderDisplay();
  await loadForm();

  els.chooseFolderBtn.addEventListener('click', chooseFolder);
  els.clearFolderBtn.addEventListener('click', clearFolder);

  for (const el of [
    els.filenamePattern,
    els.addDatePrefix,
    els.subfolderBySubreddit,
    els.includeImages,
    els.includeVideos,
    els.includeComments
  ]) {
    el.addEventListener('change', persistForm);
  }
}

async function refreshFolderDisplay() {
  const handle = await loadDirectoryHandle();
  const settings = await loadSettings();
  els.currentFolder.textContent = handle?.name || settings.outputFolderName || 'No folder selected';
}

async function loadForm() {
  const s = await loadSettings();
  els.filenamePattern.value = s.filenamePattern;
  els.addDatePrefix.checked = s.addDatePrefix;
  els.subfolderBySubreddit.checked = s.subfolderBySubreddit;
  els.includeImages.checked = s.includeImages;
  els.includeVideos.checked = s.includeVideos;
  els.includeComments.checked = s.includeComments;
}

async function persistForm() {
  await saveSettings({
    filenamePattern: els.filenamePattern.value,
    addDatePrefix: els.addDatePrefix.checked,
    subfolderBySubreddit: els.subfolderBySubreddit.checked,
    includeImages: els.includeImages.checked,
    includeVideos: els.includeVideos.checked,
    includeComments: els.includeComments.checked
  });
  flash('Settings saved');
}

async function chooseFolder() {
  if (!('showDirectoryPicker' in window)) {
    flash('Folder picker requires Chrome or Edge.', true);
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    const ok = await verifyPermission(handle, 'readwrite');
    if (!ok) {
      flash('Permission to write folder was denied.', true);
      return;
    }
    await saveDirectoryHandle(handle);
    await saveSettings({ outputFolderName: handle.name });
    await refreshFolderDisplay();
    flash(`Output folder: ${handle.name}`);
  } catch (err) {
    if (err.name !== 'AbortError') flash(err.message, true);
  }
}

async function clearFolder() {
  await clearDirectoryHandle();
  await saveSettings({ outputFolderName: '' });
  await refreshFolderDisplay();
  flash('Output folder cleared');
}

function flash(message, isError = false) {
  els.saveStatus.textContent = message;
  els.saveStatus.classList.toggle('error', isError);
  els.saveStatus.classList.remove('hidden');
  setTimeout(() => els.saveStatus.classList.add('hidden'), 2500);
}
