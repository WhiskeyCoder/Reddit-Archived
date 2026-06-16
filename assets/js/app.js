/**
 * Main application orchestration.
 */
window.RedditViewer = window.RedditViewer || {};

RedditViewer.App = (function () {
    const TARGET_DIRECTORY_HINT = 'your Reddit Saves folder';
    const supportsFileSystemAccess = 'showDirectoryPicker' in window;

    let allPosts = [];
    let filteredPosts = [];
    let currentPost = null;
    let currentIndex = -1;
    let directoryHandle = null;
    let state = null;
    let duplicates = new Set();
    let duplicateGroups = new Map();
    let directoryPrompted = false;

    const filters = {
        subreddit: null,
        author: null,
        searchTerm: '',
        minVotes: 0,
        mediaFilter: 'all',
        showFavoritesOnly: false,
        showUnreadOnly: false,
        hideDuplicates: false,
        tag: null
    };

    async function init() {
        state = RedditViewer.Storage.loadState();
        RedditViewer.UI.applyTheme(state.theme);
        document.getElementById('themeToggle').textContent = state.theme === 'dark' ? '☀️ Light' : '🌙 Dark';
        RedditViewer.UI.initSidebarPanels(state);
        bindEvents();
        configureMarked();

        if (!supportsFileSystemAccess) {
            setFolderStatus('File System Access API not supported. Use Chrome or Edge.');
            document.getElementById('selectFolderBtn').disabled = true;
            return;
        }

        setFolderStatus('Restoring folder...');
        await tryRestoreDirectory();
    }

    function configureMarked() {
        if (typeof marked !== 'undefined') {
            marked.setOptions({ breaks: true, gfm: true });
        }
    }

    function bindEvents() {
        document.getElementById('selectFolderBtn').addEventListener('click', selectDirectory);
        document.getElementById('refreshBtn').addEventListener('click', () => loadDirectory(true));
        document.getElementById('searchInput').addEventListener('input', (e) => {
            filters.searchTerm = e.target.value;
            applyFilters();
        });
        document.getElementById('sortBy').addEventListener('change', (e) => {
            state.sortBy = e.target.value;
            RedditViewer.Storage.saveState(state);
            applyFilters();
        });
        document.getElementById('sortDir').addEventListener('change', (e) => {
            state.sortDir = e.target.value;
            RedditViewer.Storage.saveState(state);
            applyFilters();
        });
        document.getElementById('minVotes').addEventListener('input', (e) => {
            filters.minVotes = parseInt(e.target.value, 10) || 0;
            document.getElementById('minVotesLabel').textContent = filters.minVotes;
            applyFilters();
        });
        document.getElementById('mediaFilter').addEventListener('change', (e) => {
            filters.mediaFilter = e.target.value;
            applyFilters();
        });
        document.getElementById('favoritesOnly').addEventListener('change', (e) => {
            filters.showFavoritesOnly = e.target.checked;
            applyFilters();
        });
        document.getElementById('unreadOnly').addEventListener('change', (e) => {
            filters.showUnreadOnly = e.target.checked;
            applyFilters();
        });
        document.getElementById('hideDuplicates').addEventListener('change', (e) => {
            filters.hideDuplicates = e.target.checked;
            applyFilters();
        });
        document.getElementById('themeToggle').addEventListener('click', toggleTheme);
        document.getElementById('statsToggle').addEventListener('click', toggleStats);
        document.getElementById('sidebarToggle').addEventListener('click', () => RedditViewer.UI.toggleSidebar());
        document.getElementById('randomSidebarBtn').addEventListener('click', selectRandomPost);

        setupDragDrop();
        setupKeyboard();
        setupServiceWorker();

        window.addEventListener('load', () => {
            if (supportsFileSystemAccess && !directoryHandle) {
                setFolderStatus('Click anywhere or select folder. Target: ' + TARGET_DIRECTORY_HINT);
                const trigger = async () => {
                    if (!directoryPrompted && !directoryHandle) {
                        directoryPrompted = true;
                        document.removeEventListener('click', trigger);
                        document.removeEventListener('keydown', trigger);
                        try { await selectDirectory(); } catch { directoryPrompted = false; }
                    }
                };
                document.addEventListener('click', trigger, { once: true });
                document.addEventListener('keydown', trigger, { once: true });
            }
        });
    }

    function setupKeyboard() {
        document.addEventListener('keydown', (e) => {
            const tag = document.activeElement?.tagName;
            const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

            if (e.key === '/' && !isTyping) {
                e.preventDefault();
                document.getElementById('searchInput').focus();
                return;
            }

            if (isTyping) return;
            if (filteredPosts.length === 0) return;

            if (e.key === 'j' || e.key === 'ArrowDown') {
                e.preventDefault();
                if (currentIndex < filteredPosts.length - 1) selectPost(currentIndex + 1, { scrollIntoView: true });
            } else if (e.key === 'k' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (currentIndex > 0) selectPost(currentIndex - 1, { scrollIntoView: true });
            } else if (e.key === 'f' && currentPost) {
                toggleFavoriteCurrent();
            } else if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
                selectRandomPost();
            }
        });
    }

    function setupDragDrop() {
        const dropZone = document.getElementById('dropZone');
        ['dragenter', 'dragover'].forEach((evt) => {
            dropZone.addEventListener(evt, (e) => {
                e.preventDefault();
                dropZone.classList.add('drag-over');
            });
        });
        ['dragleave', 'drop'].forEach((evt) => {
            dropZone.addEventListener(evt, (e) => {
                e.preventDefault();
                dropZone.classList.remove('drag-over');
            });
        });
        dropZone.addEventListener('drop', async (e) => {
            const items = e.dataTransfer?.items;
            if (!items) return;
            for (const item of items) {
                if (item.kind === 'file') {
                    const entry = item.webkitGetAsEntry?.();
                    if (entry?.isDirectory) {
                        alert('Please use "Select Folder" for directory access. Drag-drop of folders requires the folder picker.');
                        return;
                    }
                }
            }
        });
    }

    async function setupServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                await navigator.serviceWorker.register('sw.js');
            } catch (err) {
                console.warn('SW registration failed:', err);
            }
        }
    }

    async function tryRestoreDirectory() {
        try {
            const handle = await RedditViewer.Storage.loadDirectoryHandle();
            if (!handle) {
                setFolderStatus('Select your Reddit Saves folder');
                return;
            }
            const permission = await handle.queryPermission({ mode: 'readwrite' });
            if (permission === 'granted') {
                directoryHandle = handle;
                setFolderStatus(`Restored: ${handle.name} ✓`);
                await loadDirectory();
            } else {
                const request = await handle.requestPermission({ mode: 'readwrite' });
                if (request === 'granted') {
                    directoryHandle = handle;
                    setFolderStatus(`Restored: ${handle.name} ✓`);
                    await loadDirectory();
                } else {
                    setFolderStatus('Permission needed — click Select Folder');
                }
            }
        } catch (err) {
            console.warn('Could not restore directory:', err);
            setFolderStatus('Select your Reddit Saves folder');
        }
    }

    async function selectDirectory() {
        try {
            const pickerOptions = { mode: 'readwrite', startIn: directoryHandle || 'documents' };
            directoryHandle = await window.showDirectoryPicker(pickerOptions);
            await RedditViewer.Storage.saveDirectoryHandle(directoryHandle);
            directoryPrompted = true;
            setFolderStatus(`Loaded: ${directoryHandle.name} ✓`);
            await loadDirectory(true);
        } catch (err) {
            if (err.name !== 'AbortError') {
                setFolderStatus('Error: ' + err.message);
            } else {
                directoryPrompted = false;
            }
        }
    }

    async function loadDirectory(forceRefresh = false) {
        if (!directoryHandle) return;

        allPosts = [];
        const fileList = document.getElementById('fileList');
        fileList.innerHTML = '<li class="empty-state sidebar-empty">Loading posts...</li>';

        try {
            const markdownFiles = await collectMarkdownFiles(directoryHandle);
            let loaded = 0;

            for (const { handle, relativePath } of markdownFiles) {
                try {
                    const file = await handle.getFile();
                    const cacheKey = `p${RedditViewer.Parser.getCacheVersion()}:${RedditViewer.Storage.cacheKey(handle, file)}`;
                    let post;

                    if (!forceRefresh) {
                        const cached = await RedditViewer.Storage.getCachedPost(cacheKey);
                        if (cached) {
                            post = { ...cached, directoryHandle, fileHandle: handle, filePath: relativePath };
                        }
                    }

                    if (!post) {
                        const content = await file.text();
                        post = RedditViewer.Parser.parseMarkdown(content, handle.name, directoryHandle, handle, relativePath);
                        await RedditViewer.Storage.cachePost(cacheKey, RedditViewer.Parser.serializePost(post));
                        post.directoryHandle = directoryHandle;
                        post.fileHandle = handle;
                    }

                    allPosts.push(post);
                } catch (err) {
                    console.error('Error reading file:', err);
                }

                loaded++;
                if (loaded % 10 === 0 || loaded === markdownFiles.length) {
                    RedditViewer.UI.showLoadingProgress(loaded, markdownFiles.length);
                }
            }

            duplicates = RedditViewer.Parser.findDuplicates(allPosts);
            duplicateGroups = RedditViewer.Parser.groupDuplicates(allPosts);
            syncFiltersFromState();
            applyFilters();
            setFolderStatus(`Loaded ${allPosts.length} posts${duplicates.size ? ` (${duplicates.size} duplicate URLs)` : ''}`);

            if (state.lastPostId) {
                const idx = filteredPosts.findIndex((p) => RedditViewer.Storage.getPostId(p) === state.lastPostId);
                if (idx >= 0) selectPost(idx);
            } else if (filteredPosts.length > 0) {
                selectPost(0);
            }
        } catch (err) {
            console.error('Error loading directory:', err);
            setFolderStatus('Error: ' + err.message);
        }
    }

    async function collectMarkdownFiles(dirHandle, basePath = '') {
        const files = [];
        for await (const entry of dirHandle.values()) {
            const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
            if (entry.kind === 'file' && entry.name.endsWith('.md')) {
                files.push({ handle: entry, relativePath });
            } else if (entry.kind === 'directory') {
                const sub = await collectMarkdownFiles(entry, relativePath);
                files.push(...sub);
            }
        }
        return files;
    }

    function syncFiltersFromState() {
        document.getElementById('sortBy').value = state.sortBy;
        document.getElementById('sortDir').value = state.sortDir;
        document.getElementById('minVotes').value = state.minVotes || 0;
        document.getElementById('minVotesLabel').textContent = state.minVotes || 0;
        filters.minVotes = state.minVotes || 0;
        filters.mediaFilter = state.mediaFilter || 'all';
        document.getElementById('mediaFilter').value = filters.mediaFilter;
    }

    function applyFilters() {
        state.minVotes = filters.minVotes;
        state.mediaFilter = filters.mediaFilter;
        RedditViewer.Storage.saveState(state);

        let posts = RedditViewer.Search.filterPosts(allPosts, filters, state, duplicates);
        posts = RedditViewer.Search.sortPosts(posts, state.sortBy, state.sortDir, duplicateGroups);
        filteredPosts = posts;

        RedditViewer.UI.buildSubredditList(allPosts, filters.subreddit, filterBySubreddit, clearSubredditFilter);
        RedditViewer.UI.buildAuthorFilter(allPosts, filters.author, (author) => {
            filters.author = author;
            applyFilters();
        });

        const stats = RedditViewer.Stats.compute(allPosts);
        const statsPanel = document.getElementById('statsPanel');
        const statsSection = document.getElementById('statsPanelSection');
        const statsCallbacks = {
            onSubreddit: (sub) => filterBySubreddit(sub),
            onPost: (filename) => {
                const idx = filteredPosts.findIndex((p) => p.filename === filename);
                if (idx >= 0) selectPost(idx);
            }
        };

        if (statsSection && !statsSection.classList.contains('sidebar-panel-hidden')) {
            RedditViewer.UI.showStatsPanel(stats, statsCallbacks);
        } else {
            statsPanel.dataset.ready = 'true';
            statsPanel._stats = stats;
            statsPanel._callbacks = statsCallbacks;
        }

        const subredditCount = new Set(allPosts.map((p) => p.subreddit || 'Unknown')).size;
        RedditViewer.UI.updatePanelSummaries({
            totalPosts: allPosts.length,
            filteredCount: filteredPosts.length,
            searchTerm: filters.searchTerm,
            sortBy: state.sortBy,
            sortDir: state.sortDir,
            mediaFilter: filters.mediaFilter,
            minVotes: filters.minVotes,
            favoritesOnly: filters.showFavoritesOnly,
            unreadOnly: filters.showUnreadOnly,
            hideDuplicates: filters.hideDuplicates,
            activeAuthor: filters.author,
            activeSubreddit: filters.subreddit,
            subredditCount
        });

        RedditViewer.UI.renderFileList(filteredPosts, state, duplicates, currentIndex, selectPost, deletePost);

        if (filteredPosts.length === 0) {
            document.getElementById('postContent').innerHTML = '';
            document.getElementById('emptyState').style.display = 'block';
            currentPost = null;
            currentIndex = -1;
        } else if (currentIndex >= filteredPosts.length) {
            selectPost(filteredPosts.length - 1);
        }
    }

    function filterBySubreddit(subreddit) {
        filters.subreddit = subreddit;
        applyFilters();
    }

    function clearSubredditFilter() {
        filters.subreddit = null;
        applyFilters();
    }

    async function selectPost(index, options = {}) {
        if (index < 0 || index >= filteredPosts.length) return;
        currentIndex = index;
        currentPost = filteredPosts[index];
        const postId = RedditViewer.Storage.getPostId(currentPost);
        RedditViewer.Storage.markRead(postId, state);

        const contentDiv = await RedditViewer.UI.renderPost(
            currentPost, state, filters.searchTerm, duplicateGroups
        );

        bindPostActions(contentDiv, postId);
        RedditViewer.UI.updateFileListActiveState(currentIndex, postId);

        if (options.scrollIntoView) {
            RedditViewer.UI.scrollActiveItemIntoView();
        }

        document.querySelector('.content')?.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function bindPostActions(contentDiv, postId) {
        contentDiv.querySelector('#favBtn')?.addEventListener('click', toggleFavoriteCurrent);
        contentDiv.querySelector('#randomBtn')?.addEventListener('click', selectRandomPost);
        contentDiv.querySelector('#galleryBtn')?.addEventListener('click', () => {
            const gallery = contentDiv.querySelector('.post-image-gallery');
            if (gallery) {
                gallery.scrollIntoView({ behavior: 'smooth', block: 'start' });
                gallery.querySelector('.pig-viewer')?.focus();
            } else {
                const images = RedditViewer.Gallery.collectImagesFromPost(contentDiv);
                if (images.length) RedditViewer.Gallery.openFullscreen(images, 0);
            }
        });
        contentDiv.querySelector('#exportBtn')?.addEventListener('click', () => exportPost(contentDiv));
        contentDiv.querySelector('#obsidianBtn')?.addEventListener('click', () => revealSourceFile());
        contentDiv.querySelector('#saveTagsBtn')?.addEventListener('click', () => {
            const raw = contentDiv.querySelector('#tagInput')?.value || '';
            const tags = raw.split(',').map((t) => t.trim()).filter(Boolean);
            RedditViewer.Storage.setTags(postId, tags, state);
            applyFilters();
        });
        contentDiv.querySelector('#deleteDupBtn')?.addEventListener('click', () => {
            if (currentPost) deletePost(currentPost);
        });
    }

    async function ensureWritePermission() {
        if (!directoryHandle) return false;
        const opts = { mode: 'readwrite' };
        let perm = await directoryHandle.queryPermission(opts);
        if (perm === 'granted') return true;
        perm = await directoryHandle.requestPermission(opts);
        return perm === 'granted';
    }

    async function deletePostFile(post) {
        const path = (post.filePath || post.filename).replace(/\\/g, '/');
        const parts = path.split('/').filter(Boolean);
        const fileName = parts.pop();
        if (!fileName) throw new Error('Invalid file path');

        let dir = directoryHandle;
        for (const part of parts) {
            dir = await dir.getDirectoryHandle(part);
        }
        await dir.removeEntry(fileName);
    }

    async function deletePost(post) {
        if (!post?.fileHandle && !post?.filePath) {
            alert('Cannot delete — file handle not available. Reload the folder.');
            return;
        }

        const label = post.title || post.filename;
        const siblings = RedditViewer.Parser.getDuplicateSiblings(post, duplicateGroups);
        const siblingHint = siblings.length
            ? `\n\n${siblings.length} other cop${siblings.length === 1 ? 'y' : 'ies'} of this post will remain.`
            : '';

        if (!confirm(`Delete this markdown file?\n\n"${label}"\n(${post.filePath || post.filename})${siblingHint}`)) {
            return;
        }

        try {
            if (!(await ensureWritePermission())) {
                alert('Write permission is required to delete files. Please allow access when prompted.');
                return;
            }

            await deletePostFile(post);

            const postId = RedditViewer.Storage.getPostId(post);
            const wasCurrent = currentPost === post;
            const prevIndex = currentIndex;

            allPosts = allPosts.filter((p) => p !== post);
            delete state.readPosts[postId];
            delete state.favorites[postId];
            delete state.tags[postId];
            RedditViewer.Storage.saveState(state);

            duplicates = RedditViewer.Parser.findDuplicates(allPosts);
            duplicateGroups = RedditViewer.Parser.groupDuplicates(allPosts);
            applyFilters();

            if (wasCurrent) {
                if (filteredPosts.length > 0) {
                    selectPost(Math.min(prevIndex, filteredPosts.length - 1));
                } else {
                    document.getElementById('postContent').innerHTML = '';
                    document.getElementById('emptyState').style.display = 'block';
                    currentPost = null;
                    currentIndex = -1;
                }
            }

            setFolderStatus(`Deleted ${post.filename}. ${allPosts.length} posts remaining.`);
        } catch (err) {
            console.error('Delete failed:', err);
            alert('Could not delete file: ' + err.message);
        }
    }

    function toggleFavoriteCurrent() {
        if (!currentPost) return;
        const postId = RedditViewer.Storage.getPostId(currentPost);
        RedditViewer.Storage.toggleFavorite(postId, state);
        RedditViewer.UI.renderFileList(filteredPosts, state, duplicates, currentIndex, selectPost, deletePost);
        selectPost(currentIndex);
    }

    function selectRandomPost() {
        if (filteredPosts.length === 0) return;
        const idx = Math.floor(Math.random() * filteredPosts.length);
        selectPost(idx);
    }

    async function revealSourceFile() {
        if (!currentPost?.fileHandle) {
            alert('Source file handle not available. Reload the folder.');
            return;
        }
        try {
            const file = await currentPost.fileHandle.getFile();
            const url = URL.createObjectURL(file);
            window.open(url, '_blank');
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (err) {
            alert('Could not open source file: ' + err.message);
        }
    }

    function exportPost(contentDiv) {
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${currentPost?.title || 'Post'}</title>
            <style>body{font-family:sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem;line-height:1.6}
            img,video{max-width:100%}.comment{border-left:2px solid #ccc;margin:1rem 0;padding-left:1rem}</style></head>
            <body>${contentDiv.innerHTML}</body></html>`;
        const blob = new Blob([html], { type: 'text/html' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (currentPost?.filename || 'post').replace('.md', '.html');
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function toggleTheme() {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        RedditViewer.Storage.saveState(state);
        RedditViewer.UI.applyTheme(state.theme);
        document.getElementById('themeToggle').textContent = state.theme === 'dark' ? '☀️ Light' : '🌙 Dark';
    }

    function toggleStats() {
        const section = document.getElementById('statsPanelSection');
        const panel = document.getElementById('statsPanel');
        const showing = section && !section.classList.contains('sidebar-panel-hidden');

        if (showing) {
            section.classList.add('sidebar-panel-hidden');
        } else {
            section.classList.remove('sidebar-panel-hidden');
            RedditViewer.UI.setPanelExpanded('stats', true, state);

            if (panel._stats && panel._callbacks) {
                RedditViewer.UI.showStatsPanel(panel._stats, panel._callbacks);
            } else if (allPosts.length) {
                RedditViewer.UI.showStatsPanel(RedditViewer.Stats.compute(allPosts), {
                    onSubreddit: (sub) => filterBySubreddit(sub),
                    onPost: (filename) => {
                        const idx = filteredPosts.findIndex((p) => p.filename === filename);
                        if (idx >= 0) selectPost(idx);
                    }
                });
            }
        }
    }

    function setFolderStatus(msg) {
        document.getElementById('folderStatus').textContent = msg;
    }

    return { init };
})();

document.addEventListener('DOMContentLoaded', () => RedditViewer.App.init());
