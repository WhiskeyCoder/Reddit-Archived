/**
 * Markdown parser — supports indented AND flat Reddit save formats.
 * Flat exports (all comments at column 0) are reconstructed with conversation heuristics.
 */
window.RedditViewer = window.RedditViewer || {};

RedditViewer.Parser = (function () {
    const PARSER_VERSION = 4;

    // User's Obsidian save format: - by [author](url) **&#x21C5; N**
    const HEADER_BY = /^(\s*)-\s+by\s+\[([^\]]+)\]/i;
    // Reddit Post Markdown extension: - [**author**](url) · N upvotes
    const HEADER_BOLD = /^(\s*)-\s+\[\*\*([^\]]+)\*\*\]/;
    // Generic nested bullet: - [author](url)
    const HEADER_LINK = /^(\s*)-\s+\[([^\]]+)\]\([^)]+\)/;

    const VOTE_PATTERN = /&#x21C5;\s*(-?\d+)|\u21C5\s*(-?\d+)|\*\*\s*(-?\d+)\s*\*\*|·\s*(-?\d+)\s*upvotes?/i;

    const FOLLOW_UP_RE = /^(i'?d also|me too|same|this|agreed?|yes|yeah|yep|exactly|seconded|\+1|same here|i agree)/i;
    const THANKS_RE = /^(thanks|thank you|ty|thx|cheers|appreciated)/i;
    const QUESTION_RE = /^(what|which|how|why|when|where|who|are|is|do|does|did|can|could|would|will|anyone|has|have|any)\b/i;

    function parseMarkdown(content, filename, dirHandle, fileHandle, relativePath) {
        const lines = content.split('\n');
        const post = {
            filename,
            relativePath: relativePath || filename,
            title: '',
            subreddit: '',
            author: '',
            vote: 0,
            url: '',
            body: '',
            comments: [],
            commentCount: 0,
            hasMedia: false,
            savedDate: null,
            directoryHandle: dirHandle,
            fileHandle: fileHandle || null,
            filePath: relativePath || filename
        };

        let inComments = false;
        const bodyLines = [];
        const commentLines = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (!inComments) {
                if (line.startsWith('#') && !line.startsWith('##')) {
                    post.title = line.replace(/^#+\s*/, '').trim();
                    const urlMatch = line.match(/\[Visit\]\((.*?)\)/);
                    if (urlMatch) {
                        post.url = urlMatch[1];
                        post.title = post.title.replace(/\[Visit\].*/, '').trim();
                    }
                } else if (line.includes('**Subreddit:**')) {
                    const match = line.match(/\[([^\]]+)\]/);
                    if (match) post.subreddit = match[1].replace(/^r\//, '');
                } else if (line.includes('**Author:**')) {
                    const match = line.match(/\[([^\]]+)\]/);
                    if (match) post.author = match[1];
                } else if (line.includes('**Vote:**')) {
                    const match = line.match(/Vote:\*\*\s*(-?\d+)/i) || line.match(/Vote:\s*(-?\d+)/i);
                    if (match) post.vote = parseInt(match[1], 10);
                } else if (line.startsWith('## Comments')) {
                    inComments = true;
                    post.body = bodyLines.join('\n').trim();
                } else if (trimmed(line) && !line.startsWith('###') && !line.startsWith('---')) {
                    bodyLines.push(line);
                }
            } else {
                commentLines.push(line);
            }
        }

        if (!inComments && bodyLines.length > 0) {
            post.body = bodyLines.join('\n').trim();
        }

        post.hasMedia = detectMedia(post.body);
        post.savedDate = extractDateFromFilename(filename);
        post.comments = parseCommentTree(commentLines, post.author);
        post.commentCount = countAllComments(post.comments);

        return post;
    }

    function trimmed(s) {
        return s.trim();
    }

    function detectMedia(text) {
        if (!text) return false;
        return /!\[.*?\]\(.*?\)|\.(jpg|jpeg|png|gif|webp|mp4|webm|gifv)/i.test(text)
            || /v\.redd\.it|i\.imgur\.com|redgifs|gfycat/i.test(text);
    }

    function extractDateFromFilename(filename) {
        const iso = filename.match(/(\d{4}-\d{2}-\d{2})/);
        if (iso) return iso[1];
        const us = filename.match(/(\d{2})-(\d{2})-(\d{4})/);
        if (us) return `${us[3]}-${us[1]}-${us[2]}`;
        return null;
    }

    function matchCommentHeader(line) {
        let m = line.match(HEADER_BY);
        if (m) return { indent: m[1], author: m[2], line };

        m = line.match(HEADER_BOLD);
        if (m) return { indent: m[1], author: m[2], line };

        m = line.match(HEADER_LINK);
        if (m && (line.includes('upvote') || line.includes('&#x21C5;') || line.includes('·'))) {
            return { indent: m[1], author: m[2], line };
        }

        return null;
    }

    function parseCommentTree(commentLines, opAuthor) {
        const entries = parseCommentEntries(commentLines);
        if (entries.length === 0) return [];

        const hasNesting = entries.some((e) => e.indent > 0);

        if (hasNesting) {
            return buildIndentedTree(entries);
        }

        return buildFlatHeuristicTree(entries, opAuthor);
    }

    function parseCommentEntries(commentLines) {
        const entries = [];
        let current = null;

        for (const line of commentLines) {
            const header = matchCommentHeader(line);

            if (header) {
                if (current) {
                    current.body = cleanCommentBody(current.bodyLines);
                    entries.push(current);
                }

                const voteMatch = header.line.match(VOTE_PATTERN);
                current = {
                    author: header.author,
                    vote: voteMatch ? parseInt(voteMatch[1] || voteMatch[2] || voteMatch[3] || voteMatch[4], 10) : 0,
                    indent: measureIndent(header.indent),
                    bodyLines: [],
                    id: `c-${entries.length}`
                };
                continue;
            }

            if (!current) continue;

            const t = line.trim();
            if (t === '<br/>' || t === '<br>') continue;

            let bodyLine = t;
            if (bodyLine.startsWith('<br/>')) bodyLine = bodyLine.slice(5).trim();
            if (bodyLine.startsWith('<br>')) bodyLine = bodyLine.slice(4).trim();

            if (bodyLine || (t === '' && current.bodyLines.length > 0)) {
                current.bodyLines.push(bodyLine);
            }
        }

        if (current) {
            current.body = cleanCommentBody(current.bodyLines);
            entries.push(current);
        }

        return entries;
    }

    function measureIndent(whitespace) {
        let count = 0;
        for (const ch of whitespace) {
            if (ch === '\t') count += 4;
            else if (ch === ' ') count += 1;
        }
        return count;
    }

    function cleanCommentBody(bodyLines) {
        return bodyLines.join('\n').trim();
    }

    /** Indented markdown bullets — 2 spaces per nesting level */
    function buildIndentedTree(entries) {
        const unit = detectIndentUnit(entries);
        const nodes = entries.map((e) => makeNode(e, Math.floor(e.indent / unit)));
        const roots = [];
        const stack = [];

        for (const node of nodes) {
            while (stack.length > 0 && stack[stack.length - 1].depth >= node.depth) {
                stack.pop();
            }

            if (stack.length === 0) {
                roots.push(node);
            } else {
                stack[stack.length - 1].replies.push(node);
            }

            stack.push(node);
        }

        return roots;
    }

    function detectIndentUnit(entries) {
        const indents = [...new Set(entries.map((e) => e.indent))].filter((n) => n > 0).sort((a, b) => a - b);
        if (indents.length === 0) return 2;

        let unit = indents[0];
        for (const indent of indents) {
            if (indent % 2 === 0) unit = Math.min(unit, 2);
            if (indent % 4 === 0) unit = Math.min(unit, 4);
        }
        return unit || 2;
    }

    /**
     * Flat export heuristic — reconstructs splintered threads from chronological order.
     * Used when every "- by [author]" line starts at column 0 (common Obsidian Reddit saves).
     */
    function buildFlatHeuristicTree(entries, opAuthor) {
        const n = entries.length;
        const parentIdx = new Array(n).fill(-1);

        for (let i = 1; i < n; i++) {
            parentIdx[i] = inferFlatParent(i, entries, opAuthor, parentIdx);
        }

        const nodes = entries.map((e) => makeNode(e, 0));
        const roots = [];

        for (let i = 0; i < n; i++) {
            if (parentIdx[i] === -1) {
                roots.push(nodes[i]);
            } else {
                nodes[parentIdx[i]].replies.push(nodes[i]);
            }
        }

        assignDepths(roots, 0);
        return roots;
    }

    function inferFlatParent(i, entries, opAuthor, parentIdx) {
        const cur = entries[i];
        const prev = entries[i - 1];
        const isOP = cur.author === opAuthor;
        const prevIsOP = prev.author === opAuthor;

        // OP replying to the comment above
        if (isOP && !prevIsOP) return i - 1;

        // Someone replying to OP
        if (!isOP && prevIsOP) return i - 1;

        // Consecutive OP posts — attach to the non-OP user in this exchange
        if (isOP && prevIsOP) {
            for (let j = i - 1; j >= 0; j--) {
                if (entries[j].author !== opAuthor) return j;
            }
            return i - 1;
        }

        // Thanks — link back to whoever provided the answer
        if (isThanks(cur.body)) {
            const target = findThankTarget(i, entries);
            if (target !== null) return target;
        }

        // Agreement then someone else answers → attach to thread root
        if (isFollowUp(prev.body) && !isQuestion(cur.body)) {
            return findThreadRoot(i - 1, parentIdx);
        }

        // Follow-up agreement — stays directly under previous
        if (isFollowUp(cur.body)) return i - 1;

        // Visual/similarity aside in an active thread (e.g. "looks like deodorant")
        if (isAside(cur.body)) {
            const threadParent = findThematicParent(i, entries, parentIdx);
            if (threadParent !== null) return threadParent;
        }

        // New top-level conversation branch
        if (isNewTopLevelThread(cur, prev, entries, i, opAuthor, parentIdx)) {
            return -1;
        }

        // Parallel answer to same root question (e.g. two people answering "what case?")
        if (isParallelAnswer(cur, prev, entries, i, parentIdx)) {
            return parentIdx[i - 1] === -1 ? i - 1 : parentIdx[i - 1];
        }

        // Clarification or joke in ongoing subthread
        if (isClarificationOrJoke(cur, prev)) return i - 1;

        // Default: continue the conversation under previous comment
        return i - 1;
    }

    function isQuestion(text) {
        const t = (text || '').trim();
        if (t.endsWith('?')) return true;
        if (/^wish\s+i\b/i.test(t)) return false;
        return QUESTION_RE.test(t);
    }

    function isThanks(text) {
        return THANKS_RE.test((text || '').trim());
    }

    function isFollowUp(text) {
        return FOLLOW_UP_RE.test((text || '').trim());
    }

    function isAside(text) {
        const t = (text || '').trim().toLowerCase();
        return /^(looks like|seems like|reminds me|same as|similar to|lol|lmao|😂)/.test(t)
            || (t.length < 60 && /\b(deodorant|unemployed|haha)\b/.test(t));
    }

    function isClarificationOrJoke(cur, prev) {
        const t = (cur.body || '').trim();
        return t.length < 80 || /\b(they mean|i think|just|only|nah|yep|nope)\b/i.test(t);
    }

    function topicOverlap(a, b) {
        const stop = new Set([
            'they', 'them', 'their', 'this', 'that', 'what', 'when', 'have', 'with',
            'from', 'just', 'like', 'also', 'know', 'think', 'mean', 'your', 'about'
        ]);
        const words = (text) => new Set(
            (text || '').toLowerCase()
                .replace(/https?:\/\/\S+/g, '')
                .replace(/[^a-z0-9\s]/g, ' ')
                .split(/\s+/)
                .filter((w) => w.length > 3 && !stop.has(w))
        );
        const A = words(a);
        const B = words(b);
        if (A.size === 0 || B.size === 0) return 0;
        let shared = 0;
        for (const w of A) if (B.has(w)) shared++;
        return shared / Math.max(A.size, B.size);
    }

    function findThreadRoot(i, parentIdx) {
        let current = i;
        while (parentIdx[current] !== -1) current = parentIdx[current];
        return current;
    }

    function isNewTopLevelThread(cur, prev, entries, i, opAuthor, parentIdx) {
        const curBody = cur.body || '';
        const prevBody = prev.body || '';

        // New question on a clearly different topic after an answer/statement
        if (isQuestion(curBody) && !isQuestion(prevBody)) {
            if (topicOverlap(curBody, prevBody) < 0.12) return true;
            const root = findThreadRoot(i - 1, parentIdx);
            if (root !== i - 1 && topicOverlap(curBody, entries[root].body) < 0.12) return true;
        }

        // Long new thought after a joke/punchline in a deep subthread
        if (i >= 3 && curBody.length > 30 && !isFollowUp(curBody) && !isThanks(curBody)) {
            const prevJoke = /\b(lol|lmao|unemployed|deodorant|haha|😂|10\/10)\b/i.test(prevBody);
            const lowOverlap = topicOverlap(curBody, prevBody) < 0.08;
            if (prevJoke && lowOverlap) return true;
            if (lowOverlap && prevBody.length < 45 && !isQuestion(prevBody) && isQuestion(curBody)) return true;
        }

        // "Wish I could..." style new tangent (not a question)
        if (/^wish\s+i\b/i.test(curBody) && topicOverlap(curBody, prevBody) < 0.15) return true;

        return false;
    }

    function isParallelAnswer(cur, prev, entries, i, parentIdx) {
        if (isQuestion(cur.body)) return false;
        if (isFollowUp(cur.body)) return false;

        const prevRoot = findThreadRoot(i - 1, parentIdx);
        const rootEntry = entries[prevRoot];

        if (!isQuestion(rootEntry.body)) return false;
        if (cur.author === prev.author) return false;

        const overlapsRoot = topicOverlap(cur.body, rootEntry.body) > 0.05;
        const lowOverlapPrev = topicOverlap(cur.body, prev.body) < 0.2;

        return overlapsRoot && lowOverlapPrev && !isThanks(cur.body);
    }

    function findThankTarget(i, entries) {
        const author = entries[i].author;

        for (let j = i - 1; j >= 0; j--) {
            const e = entries[j];
            if (e.author === author) continue;
            if (e.body.length < 12) continue;
            if (isQuestion(e.body) || isThanks(e.body)) continue;
            if (/\b(lol|lmao|unemployed|deodorant|haha|😂)\b/i.test(e.body) && e.body.length < 50) continue;
            return j;
        }
        return null;
    }

    function findThematicParent(i, entries, parentIdx) {
        const cur = entries[i];
        const threadRoot = findThreadRoot(i - 1, parentIdx);

        for (let j = i - 1; j > threadRoot; j--) {
            if (topicOverlap(cur.body, entries[j].body) > 0.2) return j;
        }

        if (topicOverlap(cur.body, entries[threadRoot].body) > 0.2) return threadRoot;
        return null;
    }

    function makeNode(entry, depth) {
        return {
            author: entry.author,
            vote: entry.vote,
            body: entry.body,
            depth,
            replies: [],
            id: entry.id
        };
    }

    function assignDepths(nodes, depth) {
        for (const node of nodes) {
            node.depth = depth;
            if (node.replies.length) assignDepths(node.replies, depth + 1);
        }
    }

    function countAllComments(comments) {
        let count = comments.length;
        for (const c of comments) {
            if (c.replies?.length) count += countAllComments(c.replies);
        }
        return count;
    }

    function findDuplicates(posts) {
        const byUrl = new Map();
        const duplicates = new Set();

        for (const post of posts) {
            if (!post.url) continue;
            if (byUrl.has(post.url)) {
                duplicates.add(post.url);
            } else {
                byUrl.set(post.url, post);
            }
        }
        return duplicates;
    }

    function serializePost(post) {
        const { directoryHandle, fileHandle, ...serializable } = post;
        return serializable;
    }

    function getCacheVersion() {
        return PARSER_VERSION;
    }

    return {
        parseMarkdown,
        countAllComments,
        findDuplicates,
        serializePost,
        detectMedia,
        getCacheVersion
    };
})();
