/**
 * Comment thread rendering — Reddit-style nested staggered layout.
 */
window.RedditViewer = window.RedditViewer || {};

RedditViewer.Comments = (function () {
    function renderSection(comments, opAuthor, searchTerm) {
        if (!comments?.length) return '';

        const total = RedditViewer.Parser.countAllComments(comments);
        const threads = comments.map((c) => renderThread(c, opAuthor, searchTerm, 0)).join('');

        return `
            <div class="comments-section">
                <div class="comments-header">
                    <span>Comments ${total}</span>
                    <div class="comments-controls">
                        <button class="btn-ghost btn-sm" id="collapseAllBtn" type="button">Collapse all</button>
                        <button class="btn-ghost btn-sm" id="expandAllBtn" type="button">Expand all</button>
                    </div>
                </div>
                <div class="comment-thread" id="commentThread">${threads}</div>
            </div>
        `;
    }

    function renderThread(comment, opAuthor, searchTerm, visualDepth) {
        const isOP = comment.author === opAuthor;
        const depth = comment.depth ?? visualDepth;
        const replyCount = countDirectAndNestedReplies(comment);
        const depthClass = depth > 0 ? `depth-${Math.min(depth, 12)}` : 'depth-0';
        const hasReplies = comment.replies?.length > 0;

        let bodyHtml = marked.parse(comment.body || '');
        if (searchTerm) {
            bodyHtml = RedditViewer.Search.highlightHtml(bodyHtml, searchTerm);
        }

        const opBadge = isOP ? '<span class="op-badge">OP</span>' : '';
        const collapseBtn = hasReplies
            ? `<button class="collapse-btn" type="button" aria-label="Toggle thread" title="Collapse thread">[−]</button>`
            : '';

        const repliesHtml = hasReplies
            ? `<div class="comment-replies">${comment.replies.map((r) =>
                renderThread(r, opAuthor, searchTerm, depth + 1)
            ).join('')}</div>`
            : '';

        const collapsedHint = hasReplies
            ? `<div class="comment-collapsed-hint" hidden>
                <button class="btn-ghost btn-sm expand-thread-btn" type="button">${replyCount} repl${replyCount === 1 ? 'y' : 'ies'}</button>
               </div>`
            : '';

        return `
            <div class="comment ${depthClass}" data-depth="${depth}">
                <div class="comment-meta">
                    ${collapseBtn}
                    <span class="comment-author ${isOP ? 'op' : ''}">${escapeHtml(comment.author)}</span>
                    ${opBadge}
                    <span class="comment-vote">↕ ${comment.vote || 0}</span>
                </div>
                <div class="comment-body">${bodyHtml}</div>
                ${repliesHtml}
                ${collapsedHint}
            </div>
        `;
    }

    function countDirectAndNestedReplies(comment) {
        let count = comment.replies?.length || 0;
        for (const r of comment.replies || []) {
            count += countDirectAndNestedReplies(r);
        }
        return count;
    }

    function bindControls(container) {
        const thread = container.querySelector('#commentThread');
        if (!thread) return;

        container.querySelector('#collapseAllBtn')?.addEventListener('click', () => {
            thread.querySelectorAll('.comment').forEach((el) => {
                if (el.querySelector(':scope > .comment-replies')) {
                    setCommentCollapsed(el, true);
                }
            });
        });

        container.querySelector('#expandAllBtn')?.addEventListener('click', () => {
            thread.querySelectorAll('.comment').forEach((el) => setCommentCollapsed(el, false));
        });

        thread.addEventListener('click', (e) => {
            const collapseBtn = e.target.closest('.collapse-btn');
            if (collapseBtn) {
                const commentEl = collapseBtn.closest('.comment');
                setCommentCollapsed(commentEl, !commentEl.classList.contains('is-collapsed'));
                return;
            }

            const expandBtn = e.target.closest('.expand-thread-btn');
            if (expandBtn) {
                setCommentCollapsed(expandBtn.closest('.comment'), false);
            }
        });
    }

    function setCommentCollapsed(commentEl, collapsed) {
        const replies = commentEl.querySelector(':scope > .comment-replies');
        const hint = commentEl.querySelector(':scope > .comment-collapsed-hint');
        const btn = commentEl.querySelector(':scope > .comment-meta .collapse-btn');
        if (!replies) return;

        commentEl.classList.toggle('is-collapsed', collapsed);
        replies.hidden = collapsed;
        if (hint) hint.hidden = !collapsed;
        if (btn) btn.textContent = collapsed ? '[+]' : '[−]';
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    return { renderSection, bindControls, countDirectAndNestedReplies };
})();
