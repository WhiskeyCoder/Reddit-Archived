/**
 * Comment thread rendering — capped indent, readable deep threads.
 */
window.RedditViewer = window.RedditViewer || {};

RedditViewer.Comments = (function () {
    const MAX_VISUAL_DEPTH = 4;
    const INDENT_PX = 14;

    function visualReplyPadding(parentDepth) {
        if (parentDepth >= MAX_VISUAL_DEPTH) return 0;
        return INDENT_PX;
    }

    async function renderSection(comments, opAuthor, searchTerm, mediaContext) {
        if (!comments?.length) return '';

        const total = RedditViewer.Parser.countAllComments(comments);
        const threads = await Promise.all(
            comments.map((c) => renderThread(c, opAuthor, searchTerm, 0, mediaContext))
        );

        return `
            <div class="comments-section">
                <div class="comments-header">
                    <span>Comments ${total}</span>
                    <div class="comments-controls">
                        <button class="btn-ghost btn-sm" id="collapseAllBtn" type="button">Collapse all</button>
                        <button class="btn-ghost btn-sm" id="expandAllBtn" type="button">Expand all</button>
                    </div>
                </div>
                <div class="comment-thread" id="commentThread">${threads.join('')}</div>
            </div>
        `;
    }

    async function renderThread(comment, opAuthor, searchTerm, visualDepth, mediaContext) {
        const isOP = comment.author === opAuthor;
        const depth = comment.depth ?? visualDepth;
        const replyCount = countDirectAndNestedReplies(comment);
        const depthClass = depth > 0 ? `depth-${Math.min(depth, 12)}` : 'depth-0';
        const hasReplies = comment.replies?.length > 0;
        const isCapped = depth >= MAX_VISUAL_DEPTH;

        let bodyHtml = await renderCommentBody(comment.body, searchTerm, mediaContext);

        const opBadge = isOP ? '<span class="op-badge">OP</span>' : '';
        const collapseBtn = hasReplies
            ? `<button class="collapse-btn" type="button" aria-label="Toggle thread" title="Collapse thread">[−]</button>`
            : '';
        const depthLabel = depth > MAX_VISUAL_DEPTH
            ? `<span class="comment-depth-label" title="Nested reply level ${depth + 1}">↳ deep</span>`
            : '';

        let repliesHtml = '';
        if (hasReplies) {
            const pad = visualReplyPadding(depth);
            const borderStyle = pad > 0 ? '' : ' style="border-left-width:1px;opacity:0.6"';
            const rendered = await Promise.all(
                comment.replies.map((r) => renderThread(r, opAuthor, searchTerm, depth + 1, mediaContext))
            );
            repliesHtml = `<div class="comment-replies"${pad ? ` style="padding-left:${pad}px"` : borderStyle}>${rendered.join('')}</div>`;
        }

        const collapsedHint = hasReplies
            ? `<div class="comment-collapsed-hint" hidden>
                <button class="btn-ghost btn-sm expand-thread-btn" type="button">${replyCount} repl${replyCount === 1 ? 'y' : 'ies'}</button>
               </div>`
            : '';

        return `
            <div class="comment ${depthClass}${isCapped ? ' depth-capped' : ''}" data-depth="${depth}">
                <div class="comment-meta">
                    ${collapseBtn}
                    <span class="comment-author ${isOP ? 'op' : ''}">${escapeHtml(comment.author)}</span>
                    ${opBadge}
                    ${depthLabel}
                    <span class="comment-vote">⬆ ${comment.vote || 0}</span>
                </div>
                <div class="comment-body">${bodyHtml}</div>
                ${repliesHtml}
                ${collapsedHint}
            </div>
        `;
    }

    async function renderCommentBody(body, searchTerm, mediaContext) {
        if (!body?.trim()) return '';

        let html;
        if (mediaContext?.directoryHandle) {
            html = await RedditViewer.Media.processMediaInMarkdown(
                body,
                mediaContext.directoryHandle,
                mediaContext.filename
            );
        } else {
            html = marked.parse(body);
            html = RedditViewer.Media.processVideoAndGifUrls(html);
        }

        if (searchTerm) {
            html = RedditViewer.Search.highlightHtml(html, searchTerm);
        }

        return html;
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

            const commentImg = e.target.closest('.comment-body img');
            if (commentImg) {
                e.preventDefault();
                const imgs = Array.from(thread.querySelectorAll('.comment-body img'));
                const idx = imgs.indexOf(commentImg);
                const items = imgs.map((img) => ({ src: img.src, alt: img.alt || '' }));
                RedditViewer.Gallery.openFullscreen(items, Math.max(0, idx));
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

    return { renderSection, bindControls, countDirectAndNestedReplies, MAX_VISUAL_DEPTH };
})();
