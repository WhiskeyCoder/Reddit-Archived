/**
 * UI rendering: sidebar, posts, virtual scroll, modals.
 */
window.RedditViewer = window.RedditViewer || {};

RedditViewer.UI = (function () {
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function renderFileList(posts, state, duplicates, activeIndex, onSelect, onDelete) {
        const fileList = document.getElementById('fileList');

        if (posts.length === 0) {
            fileList.innerHTML = '<li class="empty-state sidebar-empty">No posts found</li>';
            fileList.style.height = '';
            fileList.style.overflowY = '';
            fileList.style.position = '';
            fileList.onscroll = null;
            return;
        }

        renderFullList(fileList, posts, state, duplicates, activeIndex, onSelect, onDelete);
    }

    function renderFullList(fileList, posts, state, duplicates, activeIndex, onSelect, onDelete) {
        const savedScroll = fileList.scrollTop;
        fileList.innerHTML = '';
        fileList.style.height = '';
        fileList.style.overflowY = '';
        fileList.style.position = '';
        fileList.onscroll = null;

        const fragment = document.createDocumentFragment();
        posts.forEach((post, index) => {
            fragment.appendChild(createFileItem(post, index, state, duplicates, index === activeIndex, onSelect, onDelete));
        });
        fileList.appendChild(fragment);
        fileList.scrollTop = savedScroll;
    }

    function updateFileListActiveState(activeIndex, postId) {
        const fileList = document.getElementById('fileList');
        if (!fileList) return;

        fileList.querySelectorAll('.file-item').forEach((li) => {
            const idx = parseInt(li.dataset.index, 10);
            const isActive = idx === activeIndex;
            li.classList.toggle('active', isActive);
            if (isActive && postId) {
                li.classList.add('read');
            }
        });
    }

    function createFileItem(post, index, state, duplicates, isActive, onSelect, onDelete) {
        const li = document.createElement('li');
        const postId = RedditViewer.Storage.getPostId(post);
        const isRead = RedditViewer.Storage.isRead(postId, state);
        const isFav = RedditViewer.Storage.isFavorite(postId, state);
        const isDupe = RedditViewer.Parser.isDuplicatePost(post, duplicates);
        const tags = RedditViewer.Storage.getTags(postId, state);

        li.className = 'file-item' + (isActive ? ' active' : '') + (isRead ? ' read' : '') + (isDupe ? ' duplicate' : '');
        li.dataset.index = index;
        li.innerHTML = `
            <div class="file-item-row">
                <div class="file-item-title">${isFav ? '★ ' : ''}${escapeHtml(post.title || post.filename)}</div>
                <div class="file-item-badges">
                    ${isDupe ? '<span class="dupe-badge" title="Duplicate URL">dup</span>' : ''}
                    ${isDupe && onDelete ? '<button type="button" class="file-delete-btn" title="Delete this duplicate file" aria-label="Delete duplicate">🗑</button>' : ''}
                </div>
            </div>
            <div class="file-item-meta">
                r/${escapeHtml(post.subreddit || 'Unknown')} • ⬆ ${post.vote || 0} • 💬 ${post.commentCount || 0}
                ${post.hasMedia ? ' • 🖼' : ''}
            </div>
            ${tags.length ? `<div class="file-item-tags">${tags.map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        `;

        li.querySelector('.file-delete-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            onDelete(post);
        });

        li.addEventListener('click', () => onSelect(index));
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

        document.getElementById('subredditPanelSection')?.classList.toggle('sidebar-panel-hidden', !posts.length);
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

    async function renderPost(post, state, searchTerm, duplicateGroups) {
        document.getElementById('emptyState').style.display = 'none';
        const contentDiv = document.getElementById('postContent');
        const postId = RedditViewer.Storage.getPostId(post);
        const isFav = RedditViewer.Storage.isFavorite(postId, state);
        const tags = RedditViewer.Storage.getTags(postId, state);
        const isDupe = RedditViewer.Parser.isDuplicatePost(post, duplicateGroups);

        let processedBody = await RedditViewer.Media.processMediaInMarkdown(post.body, post.directoryHandle, post.filename);
        if (searchTerm) {
            processedBody = RedditViewer.Search.highlightHtml(processedBody, searchTerm);
        }

        const mediaContext = {
            directoryHandle: post.directoryHandle,
            filename: post.filename
        };

        const commentsHtml = await RedditViewer.Comments.renderSection(
            post.comments, post.author, searchTerm, mediaContext
        );

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
                        ${isDupe ? '<button type="button" class="btn-ghost btn-sm btn-delete-dupe" id="deleteDupBtn" title="Delete this duplicate markdown file from disk">Delete Dupe</button>' : ''}
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

        panel.querySelectorAll('.stats-chip').forEach((chip) => {
            chip.onclick = () => callbacks.onSubreddit(chip.dataset.subreddit);
        });
        panel.querySelectorAll('.stats-post-link').forEach((link) => {
            link.onclick = () => callbacks.onPost(link.dataset.filename);
        });

        const summary = document.getElementById('statsPanelSummary');
        if (summary && stats) {
            summary.textContent = `${stats.totalPosts} posts · ${stats.totalComments} comments`;
        }
    }

    const PANEL_IDS = ['folder', 'search', 'filters', 'stats', 'subreddits'];

    function setPanelExpanded(panelId, expanded, state, persist = true) {
        const panel = document.querySelector(`.sidebar-panel[data-panel="${panelId}"]`);
        if (!panel || panel.classList.contains('sidebar-panel-hidden')) return;

        panel.classList.toggle('is-collapsed', !expanded);
        const toggle = panel.querySelector('.sidebar-panel-toggle');
        toggle?.setAttribute('aria-expanded', expanded ? 'true' : 'false');

        if (persist && state?.sidebarPanels) {
            state.sidebarPanels[panelId] = expanded;
            RedditViewer.Storage.saveState(state);
        }
    }

    function initSidebarPanels(state) {
        const defaults = {
            folder: true,
            search: true,
            filters: false,
            stats: true,
            subreddits: false
        };
        state.sidebarPanels = { ...defaults, ...state.sidebarPanels };

        PANEL_IDS.forEach((id) => {
            setPanelExpanded(id, !!state.sidebarPanels[id], state, false);
        });

        document.querySelectorAll('.sidebar-panel-toggle').forEach((btn) => {
            btn.addEventListener('click', () => {
                const panel = btn.closest('.sidebar-panel');
                if (!panel) return;
                const willExpand = panel.classList.contains('is-collapsed');
                setPanelExpanded(panel.dataset.panel, willExpand, state);
            });
        });

        document.getElementById('collapseAllPanelsBtn')?.addEventListener('click', () => {
            PANEL_IDS.forEach((id) => setPanelExpanded(id, false, state));
        });

        document.getElementById('expandAllPanelsBtn')?.addEventListener('click', () => {
            PANEL_IDS.forEach((id) => {
                const panel = document.querySelector(`.sidebar-panel[data-panel="${id}"]`);
                if (panel && !panel.classList.contains('sidebar-panel-hidden')) {
                    setPanelExpanded(id, true, state);
                }
            });
        });
    }

    function updatePanelSummaries(meta) {
        const folderEl = document.getElementById('folderPanelSummary');
        if (folderEl) {
            if (meta.totalPosts) {
                const shown = meta.filteredCount ?? meta.totalPosts;
                folderEl.textContent = shown !== meta.totalPosts
                    ? `${shown}/${meta.totalPosts} posts`
                    : `${meta.totalPosts} posts`;
            } else {
                folderEl.textContent = '';
            }
        }

        const searchEl = document.getElementById('searchPanelSummary');
        if (searchEl) {
            searchEl.textContent = meta.searchTerm ? `"${meta.searchTerm}"` : '';
        }

        const filtersEl = document.getElementById('filtersPanelSummary');
        if (filtersEl) {
            const sortLabels = {
                vote: 'Votes',
                title: 'Title',
                comments: 'Comments',
                date: 'Date',
                subreddit: 'Subreddit'
            };
            const parts = [
                `${sortLabels[meta.sortBy] || meta.sortBy} ${meta.sortDir === 'asc' ? '↑' : '↓'}`
            ];
            if (meta.mediaFilter && meta.mediaFilter !== 'all') parts.push(meta.mediaFilter);
            if (meta.minVotes > 0) parts.push(`≥${meta.minVotes}`);
            if (meta.favoritesOnly) parts.push('★ only');
            if (meta.unreadOnly) parts.push('unread');
            if (meta.hideDuplicates) parts.push('no dupes');
            if (meta.activeAuthor) parts.push(`u/${meta.activeAuthor}`);
            filtersEl.textContent = parts.join(' · ');
        }

        const subEl = document.getElementById('subredditPanelSummary');
        if (subEl) {
            subEl.textContent = meta.activeSubreddit
                ? `r/${meta.activeSubreddit}`
                : (meta.subredditCount ? `${meta.subredditCount} subs` : '');
        }

        const countEl = document.getElementById('postCountLabel');
        if (countEl) {
            const shown = meta.filteredCount ?? meta.totalPosts;
            if (!shown) {
                countEl.textContent = '';
            } else if (meta.totalPosts && shown !== meta.totalPosts) {
                countEl.textContent = `${shown} of ${meta.totalPosts}`;
            } else {
                countEl.textContent = String(shown);
            }
        }
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
        const fileList = document.getElementById('fileList');
        const active = fileList?.querySelector('.file-item.active');
        if (!active || !fileList) return;

        const listTop = fileList.scrollTop;
        const listBottom = listTop + fileList.clientHeight;
        const itemTop = active.offsetTop;
        const itemBottom = itemTop + active.offsetHeight;
        const padding = 8;

        if (itemTop < listTop + padding) {
            fileList.scrollTop = Math.max(0, itemTop - padding);
        } else if (itemBottom > listBottom - padding) {
            fileList.scrollTop = itemBottom - fileList.clientHeight + padding;
        }
    }

    return {
        renderFileList,
        updateFileListActiveState,
        buildSubredditList,
        buildAuthorFilter,
        renderPost,
        showLoadingProgress,
        showStatsPanel,
        initSidebarPanels,
        updatePanelSummaries,
        setPanelExpanded,
        toggleSidebar,
        applyTheme,
        scrollActiveItemIntoView,
        escapeHtml
    };
})();
