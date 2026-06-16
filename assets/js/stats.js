/**
 * Archive statistics dashboard.
 */
window.RedditViewer = window.RedditViewer || {};

RedditViewer.Stats = (function () {
    function compute(posts) {
        const subredditCounts = {};
        const authorCounts = {};
        let totalVotes = 0;
        let totalComments = 0;
        let mediaPosts = 0;

        for (const post of posts) {
            const sub = post.subreddit || 'Unknown';
            subredditCounts[sub] = (subredditCounts[sub] || 0) + 1;
            const author = post.author || 'Unknown';
            authorCounts[author] = (authorCounts[author] || 0) + 1;
            totalVotes += post.vote || 0;
            totalComments += post.commentCount || 0;
            if (post.hasMedia) mediaPosts++;
        }

        const topSubreddits = Object.entries(subredditCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        const topAuthors = Object.entries(authorCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        const topPosts = [...posts]
            .sort((a, b) => (b.vote || 0) - (a.vote || 0))
            .slice(0, 5);

        const mostCommented = [...posts]
            .sort((a, b) => (b.commentCount || 0) - (a.commentCount || 0))
            .slice(0, 5);

        return {
            totalPosts: posts.length,
            uniqueSubreddits: Object.keys(subredditCounts).length,
            uniqueAuthors: Object.keys(authorCounts).length,
            totalVotes,
            avgVotes: posts.length ? Math.round(totalVotes / posts.length) : 0,
            totalComments,
            avgComments: posts.length ? Math.round(totalComments / posts.length) : 0,
            mediaPosts,
            topSubreddits,
            topAuthors,
            topPosts,
            mostCommented
        };
    }

    function render(stats, onSubredditClick, onPostClick) {
        const subList = stats.topSubreddits.map(([name, count]) =>
            `<button class="stats-chip" data-subreddit="${escapeAttr(name)}">r/${escapeHtml(name)} <span>${count}</span></button>`
        ).join('');

        const authorList = stats.topAuthors.map(([name, count]) =>
            `<span class="stats-row">u/${escapeHtml(name)} <strong>${count}</strong></span>`
        ).join('');

        const topPostsList = stats.topPosts.map((p, i) =>
            `<button class="stats-post-link" data-index="${i}" data-filename="${escapeAttr(p.filename)}">
                <span class="stats-post-title">${escapeHtml(p.title || p.filename)}</span>
                <span class="stats-post-meta">⬆ ${p.vote || 0}</span>
            </button>`
        ).join('');

        return `
            <div class="stats-panel">
                <h3 class="panel-title">Archive Stats</h3>
                <div class="stats-grid">
                    <div class="stat-card"><span class="stat-value">${stats.totalPosts}</span><span class="stat-label">Posts</span></div>
                    <div class="stat-card"><span class="stat-value">${stats.uniqueSubreddits}</span><span class="stat-label">Subreddits</span></div>
                    <div class="stat-card"><span class="stat-value">${stats.totalComments}</span><span class="stat-label">Comments</span></div>
                    <div class="stat-card"><span class="stat-value">${stats.mediaPosts}</span><span class="stat-label">With Media</span></div>
                </div>
                <div class="stats-section">
                    <h4>Top Subreddits</h4>
                    <div class="stats-chips">${subList || '<span class="muted">None</span>'}</div>
                </div>
                <div class="stats-section">
                    <h4>Top Authors Saved</h4>
                    <div class="stats-list">${authorList || '<span class="muted">None</span>'}</div>
                </div>
                <div class="stats-section">
                    <h4>Highest Voted</h4>
                    <div class="stats-posts">${topPostsList || '<span class="muted">None</span>'}</div>
                </div>
            </div>
        `;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function escapeAttr(text) {
        return text.replace(/"/g, '&quot;');
    }

    return { compute, render };
})();
