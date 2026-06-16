/**
 * UI rendering: sidebar, posts, virtual scroll, modals.
 */
window.RedditViewer = window.RedditViewer || {};

RedditViewer.UI = (function () {
    const ITEM_HEIGHT = 72;
    let virtualScrollState = { start: 0, visible: 20, posts: [] };

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function renderFileList(posts, state, duplicates, activeIndex, onSelect) {
        const fileList = document.getElementById('fileList');
        virtualScrollState.posts = posts;

        if (posts.length === 0) {
            fileList.innerHTML = '<li class="empty-state sidebar-empty">No posts found</li>';
            return;
        }

        if (posts.length > 100) {
            renderVirtualList(fileList, posts, state, duplicates, activeIndex, onSelect);
        } else {
            renderFullList(fileList, posts, state, duplicates, activeIndex, onSelect);
        }
    }

    function renderFullList(fileList, posts, state, duplicates, activeIndex, onSelect) {
        fileList.innerHTML = '';
        fileList.style.height = 'auto';
        fileList.onscroll = null;

        posts.forEach((post, index) => {
            fileList.appendChild(createFileItem(post, index, state, duplicates, index === activeIndex, onSelect));
        });
    }

    function renderVirtualList(fileList, posts, state, duplicates, activeIndex, onSelect) {
        const containerHeight = Math.min(posts.length * ITEM_HEIGHT, 600);
        fileList.style.height = containerHeight + 'px';
        fileList.style.overflowY = 'auto';
        fileList.style.position = 'relative';

        function update() {
            const scrollTop = fileList.scrollTop;
            const visibleCount = Math.ceil(containerHeight / ITEM_HEIGHT) + 4;
            const start = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - 2);
            const end = Math.min(posts.length, start + visibleCount);

            fileList.innerHTML = '';
            const spacerTop = document.createElement('li');
            spacerTop.style.height = start * ITEM_HEIGHT + 'px';
            spacerTop.style.border = 'none';
            spacerTop.style.background = 'transparent';
            spacerTop.style.padding = '0';
            fileList.appendChild(spacerTop);

            for (let i = start; i < end; i++) {
                fileList.appendChild(createFileItem(posts[i], i, state, duplicates, i === activeIndex, onSelect));
            }

            const spacerBottom = document.createElement('li');
            spacerBottom.style.height = (posts.length - end) * ITEM_HEIGHT + 'px';
            spacerBottom.style.border = 'none';
            spacerBottom.style.background = 'transparent';
            spacerBottom.style.padding = '0';
            fileList.appendChild(spacerBottom);
        }

        fileList.onscroll = update;
        update();
    }

    function createFileItem(post, index, state, duplicates, isActive, onSelect) {
        const li = document.createElement('li');
        const postId = RedditViewer.Storage.getPostId(post);
        const isRead = RedditViewer.Storage.isRead(postId, state);
        const isFav = RedditViewer.Storage.isFavorite(postId, state);
        const isDupe = post.url && duplicates.has(post.url);
        const tags = RedditViewer.Storage.getTags(postId, state);

        li.className = 'file-item' + (isActive ? ' active' : '') + (isRead ? ' read' : '') + (isDupe ? ' duplicate' : '');
        li.dataset.index = index;
        li.innerHTML = `
            <div class="file-item-row">
                <div class="file-item-title">${isFav ? '★ ' : ''}${escapeHtml(post.title || post.filename)}</div>
                ${isDupe ? '<span class="dupe-badge" title="Duplicate URL">dup</span>' : ''}
            </div>
            <div class="file-item-meta">
                r/${escapeHtml(post.subreddit || 'Unknown')} • ⬆ ${post.vote || 0} • 💬 ${post.commentCount || 0}
                ${post.hasMedia ? ' • 🖼' : ''}
            </div>
            ${tags.length ? `<div class="file-item-tags">${tags.map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        `;
        li.onclick = () => onSelect(index);
        return li;
    }

    function buildSubredditList(posts, activeSubreddit, onFilter, onClear) {
        const subredditCounts = {};
        posts.forEach((post) => {
            const sub = post.subreddit || 'Unknown';
            subredditCounts[sub] = (subredditCounts[sub] || 0) + 1;
        });

        const sorted = Object.entries(subredditCounts).sort((a, b) => b[1] - a[1]);
        const subredditList = document.getElementById('subredditList');
        subredditList.innerHTML = '';

        sorted.forEach(([subreddit, count]) => {
            const div = document.createElement('div');
            div.className = 'subreddit-item' + (activeSubreddit === subreddit ? ' active' : '');
            div.innerHTML = `<span>r/${escapeHtml(subreddit)}</span><span class="subreddit-count">${count}</span>`;
            div.onclick = () => onFilter(subreddit);
            subredditList.appendChild(div);
        });

        document.getElementById('subredditFilter').style.display = posts.length ? 'block' : 'none';
        document.getElementById('clearSubredditBtn').onclick = onClear;
    }

    function buildAuthorFilter(posts, activeAuthor, onFilter) {
        const select = document.getElementById('authorFilter');
        if (!select) return;

        const authors = [...new Set(posts.map((p) => p.author).filter(Boolean))].sort();
        select.innerHTML = '<option value="">All authors</option>';
        authors.forEach((author) => {
            const opt = document.createElement('option');
            opt.value = author;
            opt.textContent = `u/${author}`;
            if (author === activeAuthor) opt.selected = true;
            select.appendChild(opt);
        });
        select.onchange = () => onFilter(select.value || null);
    }

    async function renderPost(post, state, searchTerm) {
        document.getElementById('emptyState').style.display = 'none';
        const contentDiv = document.getElementById('postContent');
        const postId = RedditViewer.Storage.getPostId(post);
        const isFav = RedditViewer.Storage.isFavorite(postId, state);
        const tags = RedditViewer.Storage.getTags(postId, state);

        let processedBody = await RedditViewer.Media.processMediaInMarkdown(post.body, post.directoryHandle, post.filename);
        if (searchTerm) {
            processedBody = RedditViewer.Search.highlightHtml(processedBody, searchTerm);
        }

        const commentsHtml = RedditViewer.Comments.renderSection(post.comments, post.author, searchTerm);

        contentDiv.innerHTML = `
            <div class="post">
                <div class="post-header">
                    <div class="post-actions">
                        <button class="btn-ghost btn-sm" id="favBtn" title="Favorite">${isFav ? '★ Favorited' : '☆ Favorite'}</button>
                        <button class="btn-ghost btn-sm" id="galleryBtn" title="Gallery">🖼 Gallery</button>
                        <button class="btn-ghost btn-sm" id="exportBtn" title="Export">Export</button>
                        <button class="btn-ghost btn-sm" id="randomBtn" title="Random post">🎲 Random</button>
                        ${post.url ? `<a class="btn-ghost btn-sm" href="${escapeAttr(post.url)}" target="_blank" rel="noopener">↗ Reddit</a>` : ''}
                        <button class="btn-ghost btn-sm" id="obsidianBtn" title="Reveal file">📄 Source</button>
                    </div>
                    <div class="post-meta">
                        <span class="subreddit">r/${escapeHtml(post.subreddit || 'Unknown')}</span>
                        <span class="author">u/${escapeHtml(post.author || 'Unknown')}</span>
                        ${post.savedDate ? `<span class="saved-date">${post.savedDate}</span>` : ''}
                        <span class="vote">⬆ ${post.vote || 0}</span>
                    </div>
                    <h1 class="post-title">${searchTerm ? RedditViewer.Search.highlightText(post.title || post.filename, searchTerm) : escapeHtml(post.title || post.filename)}</h1>
                    <div class="tag-editor">
                        <input type="text" id="tagInput" placeholder="Add tags (comma-separated)" value="${escapeAttr(tags.join(', '))}" />
                        <button class="btn-ghost btn-sm" id="saveTagsBtn">Save tags</button>
                    </div>
                </div>
                <div class="post-body">${processedBody}</div>
                ${commentsHtml}
            </div>
        `;

        RedditViewer.Media.setupMediaViewers(contentDiv);
        RedditViewer.Comments.bindControls(contentDiv);

        return contentDiv;
    }

    function showLoadingProgress(current, total) {
        const status = document.getElementById('folderStatus');
        const pct = total ? Math.round((current / total) * 100) : 0;
        status.textContent = `Loading posts... ${current}/${total} (${pct}%)`;
    }

    function showStatsPanel(stats, callbacks) {
        const panel = document.getElementById('statsPanel');
        panel.innerHTML = RedditViewer.Stats.render(stats);
        panel.style.display = 'block';

        panel.querySelectorAll('.stats-chip').forEach((chip) => {
            chip.onclick = () => callbacks.onSubreddit(chip.dataset.subreddit);
        });
        panel.querySelectorAll('.stats-post-link').forEach((link) => {
            link.onclick = () => callbacks.onPost(link.dataset.filename);
        });
    }

    function toggleSidebar() {
        document.body.classList.toggle('sidebar-open');
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
    }

    function escapeAttr(text) {
        return String(text).replace(/"/g, '&quot;');
    }

    function scrollActiveItemIntoView() {
        const active = document.querySelector('.file-item.active');
        active?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    return {
        renderFileList,
        buildSubredditList,
        buildAuthorFilter,
        renderPost,
        showLoadingProgress,
        showStatsPanel,
        toggleSidebar,
        applyTheme,
        scrollActiveItemIntoView,
        escapeHtml
    };
})();
