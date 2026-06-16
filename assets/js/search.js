/**
 * Search, highlighting, and filtering utilities.
 */
window.RedditViewer = window.RedditViewer || {};

RedditViewer.Search = (function () {
    function searchInComments(comments, term) {
        if (!term) return false;
        const lower = term.toLowerCase();
        for (const c of comments) {
            if ((c.author || '').toLowerCase().includes(lower)) return true;
            if ((c.body || '').toLowerCase().includes(lower)) return true;
            if (c.replies?.length && searchInComments(c.replies, term)) return true;
        }
        return false;
    }

    function postMatchesSearch(post, term) {
        if (!term) return true;
        const lower = term.toLowerCase();
        return (post.title || '').toLowerCase().includes(lower)
            || (post.body || '').toLowerCase().includes(lower)
            || (post.subreddit || '').toLowerCase().includes(lower)
            || (post.author || '').toLowerCase().includes(lower)
            || searchInComments(post.comments || [], lower);
    }

    function highlightText(text, term) {
        if (!term || !text) return escapeHtml(text || '');
        const escaped = escapeHtml(text);
        const regex = new RegExp(`(${escapeRegex(term)})`, 'gi');
        return escaped.replace(regex, '<mark class="search-highlight">$1</mark>');
    }

    function highlightHtml(html, term) {
        if (!term || !html) return html;
        const temp = document.createElement('div');
        temp.innerHTML = html;
        walkTextNodes(temp, term);
        return temp.innerHTML;
    }

    function walkTextNodes(node, term) {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent;
            if (text.toLowerCase().includes(term.toLowerCase())) {
                const span = document.createElement('span');
                span.innerHTML = highlightText(text, term);
                node.replaceWith(...span.childNodes);
            }
        } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE') {
            [...node.childNodes].forEach((child) => walkTextNodes(child, term));
        }
    }

    function sortPosts(posts, sortBy, sortDir, duplicateGroups) {
        const dir = sortDir === 'asc' ? 1 : -1;
        const sorted = [...posts];

        sorted.sort((a, b) => {
            let cmp = 0;
            switch (sortBy) {
                case 'title':
                    cmp = (a.title || a.filename).localeCompare(b.title || b.filename);
                    break;
                case 'comments':
                    cmp = (a.commentCount || 0) - (b.commentCount || 0);
                    break;
                case 'date':
                    cmp = (a.savedDate || '').localeCompare(b.savedDate || '');
                    break;
                case 'subreddit':
                    cmp = (a.subreddit || '').localeCompare(b.subreddit || '');
                    break;
                case 'vote':
                default:
                    cmp = (a.vote || 0) - (b.vote || 0);
                    break;
            }
            return cmp * dir;
        });

        return clusterDuplicateGroups(sorted, duplicateGroups);
    }

    function clusterDuplicateGroups(sorted, duplicateGroups) {
        if (!duplicateGroups?.size) return sorted;

        const emitted = new Set();
        const result = [];

        for (const post of sorted) {
            if (emitted.has(post)) continue;

            const key = RedditViewer.Parser.getDuplicateKey(post);
            if (key && duplicateGroups.has(key)) {
                const members = sorted.filter((p) => RedditViewer.Parser.getDuplicateKey(p) === key);
                for (const member of members) {
                    result.push(member);
                    emitted.add(member);
                }
            } else {
                result.push(post);
                emitted.add(post);
            }
        }

        return result;
    }

    function filterPosts(posts, filters, state, duplicates) {
        let result = [...posts];

        if (filters.subreddit) {
            result = result.filter((p) => p.subreddit === filters.subreddit);
        }

        if (filters.author) {
            result = result.filter((p) => p.author === filters.author);
        }

        if (filters.minVotes > 0) {
            result = result.filter((p) => (p.vote || 0) >= filters.minVotes);
        }

        if (filters.mediaFilter === 'media') {
            result = result.filter((p) => p.hasMedia);
        } else if (filters.mediaFilter === 'text') {
            result = result.filter((p) => !p.hasMedia);
        }

        if (filters.showFavoritesOnly) {
            result = result.filter((p) => RedditViewer.Storage.isFavorite(RedditViewer.Storage.getPostId(p), state));
        }

        if (filters.showUnreadOnly) {
            result = result.filter((p) => !RedditViewer.Storage.isRead(RedditViewer.Storage.getPostId(p), state));
        }

        if (filters.searchTerm) {
            result = result.filter((p) => postMatchesSearch(p, filters.searchTerm));
        }

        if (filters.tag) {
            result = result.filter((p) => {
                const tags = RedditViewer.Storage.getTags(RedditViewer.Storage.getPostId(p), state);
                return tags.includes(filters.tag);
            });
        }

        if (filters.hideDuplicates) {
            result = result.filter((p) => !RedditViewer.Parser.isDuplicatePost(p, duplicates));
        }

        return result;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function escapeRegex(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    return {
        postMatchesSearch,
        searchInComments,
        highlightText,
        highlightHtml,
        sortPosts,
        filterPosts
    };
})();
