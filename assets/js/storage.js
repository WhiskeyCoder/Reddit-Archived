/**
 * IndexedDB + localStorage persistence for folder handles, post cache, and user state.
 */
window.RedditViewer = window.RedditViewer || {};

RedditViewer.Storage = (function () {
    const DB_NAME = 'reddit-viewer-db';
    const DB_VERSION = 1;
    const HANDLE_STORE = 'directory-handles';
    const CACHE_STORE = 'post-cache';
    const STATE_KEY = 'reddit-viewer-state';

    let db = null;

    async function openDB() {
        if (db) return db;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                db = request.result;
                resolve(db);
            };
            request.onupgradeneeded = (e) => {
                const database = e.target.result;
                if (!database.objectStoreNames.contains(HANDLE_STORE)) {
                    database.createObjectStore(HANDLE_STORE);
                }
                if (!database.objectStoreNames.contains(CACHE_STORE)) {
                    database.createObjectStore(CACHE_STORE);
                }
            };
        });
    }

    async function saveDirectoryHandle(handle) {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(HANDLE_STORE, 'readwrite');
            tx.objectStore(HANDLE_STORE).put(handle, 'main');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async function loadDirectoryHandle() {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(HANDLE_STORE, 'readonly');
            const req = tx.objectStore(HANDLE_STORE).get('main');
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    async function cachePost(key, data) {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(CACHE_STORE, 'readwrite');
            tx.objectStore(CACHE_STORE).put(data, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async function getCachedPost(key) {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(CACHE_STORE, 'readonly');
            const req = tx.objectStore(CACHE_STORE).get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    async function clearCache() {
        const database = await openDB();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(CACHE_STORE, 'readwrite');
            tx.objectStore(CACHE_STORE).clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    function loadState() {
        try {
            const raw = localStorage.getItem(STATE_KEY);
            return raw ? JSON.parse(raw) : getDefaultState();
        } catch {
            return getDefaultState();
        }
    }

    function saveState(state) {
        localStorage.setItem(STATE_KEY, JSON.stringify(state));
    }

    function getDefaultState() {
        return {
            readPosts: {},
            favorites: {},
            tags: {},
            lastPostId: null,
            sortBy: 'vote',
            sortDir: 'desc',
            theme: 'dark',
            minVotes: 0,
            mediaFilter: 'all',
            authorFilter: null,
            showFavoritesOnly: false,
            showUnreadOnly: false,
            collapseAllComments: false
        };
    }

    function getPostId(post) {
        return post.url || post.filename;
    }

    function isRead(postId, state) {
        return !!state.readPosts[postId];
    }

    function isFavorite(postId, state) {
        return !!state.favorites[postId];
    }

    function toggleFavorite(postId, state) {
        if (state.favorites[postId]) {
            delete state.favorites[postId];
        } else {
            state.favorites[postId] = Date.now();
        }
        saveState(state);
        return state.favorites[postId];
    }

    function markRead(postId, state) {
        state.readPosts[postId] = Date.now();
        state.lastPostId = postId;
        saveState(state);
    }

    function getTags(postId, state) {
        return state.tags[postId] || [];
    }

    function setTags(postId, tags, state) {
        if (tags.length === 0) {
            delete state.tags[postId];
        } else {
            state.tags[postId] = tags;
        }
        saveState(state);
    }

    function cacheKey(fileHandle, file) {
        return `${fileHandle.name}:${file.lastModified}`;
    }

    return {
        openDB,
        saveDirectoryHandle,
        loadDirectoryHandle,
        cachePost,
        getCachedPost,
        clearCache,
        loadState,
        saveState,
        getPostId,
        isRead,
        isFavorite,
        toggleFavorite,
        markRead,
        getTags,
        setTags,
        cacheKey
    };
})();
