/**
 * Quick test for comment tree parsing — run: node assets/js/test-parser.js
 */
const fs = require('fs');
const path = require('path');

// Minimal inline copy of heuristic for node testing
const FOLLOW_UP_RE = /^(i'?d also|me too|same|this|agreed?|yes|yeah|yep|exactly|seconded|\+1|same here|i agree)/i;
const THANKS_RE = /^(thanks|thank you|ty|thx|cheers|appreciated)/i;
const QUESTION_RE = /^(what|which|how|why|when|where|who|are|is|do|does|did|can|could|would|will|wish|anyone|has|have|any)\b/i;
const HEADER_BY = /^(\s*)-\s+by\s+\[([^\]]+)\]/i;
const VOTE_PATTERN = /&#x21C5;\s*(-?\d+)/;

function isQuestion(t) { t = (t||'').trim(); return t.endsWith('?') || QUESTION_RE.test(t); }
function isThanks(t) { return THANKS_RE.test((t||'').trim()); }
function isFollowUp(t) { return FOLLOW_UP_RE.test((t||'').trim()); }
function isAside(t) {
    t = (t||'').trim().toLowerCase();
    return /^(looks like|seems like|reminds me|same as|similar to|lol|lmao)/.test(t)
        || (t.length < 60 && /\b(deodorant|unemployed|haha)\b/.test(t));
}
function topicOverlap(a, b) {
    const words = (text) => new Set((text||'').toLowerCase().replace(/https?:\/\/\S+/g,'').replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w.length>3));
    const A = words(a), B = words(b);
    if (!A.size || !B.size) return 0;
    let s = 0; for (const w of A) if (B.has(w)) s++;
    return s / Math.max(A.size, B.size);
}
function findThreadRoot(i, parentIdx) { let c = i; while (parentIdx[c] !== -1) c = parentIdx[c]; return c; }

function parseEntries(lines) {
    const entries = []; let cur = null;
    for (const line of lines) {
        const m = line.match(HEADER_BY);
        if (m) {
            if (cur) { cur.body = cur.bodyLines.join('\n').trim(); entries.push(cur); }
            const vm = line.match(VOTE_PATTERN);
            cur = { author: m[2], vote: vm ? parseInt(vm[1]) : 0, bodyLines: [] };
            continue;
        }
        if (!cur) continue;
        const t = line.trim();
        if (t === '<br/>') continue;
        let b = t.startsWith('<br/>') ? t.slice(5).trim() : t;
        if (b || (t==='' && cur.bodyLines.length)) cur.bodyLines.push(b);
    }
    if (cur) { cur.body = cur.bodyLines.join('\n').trim(); entries.push(cur); }
    return entries;
}

function inferFlatParent(i, entries, opAuthor, parentIdx) {
    const cur = entries[i], prev = entries[i-1];
    const isOP = cur.author === opAuthor, prevIsOP = prev.author === opAuthor;
    if (isOP && !prevIsOP) return i-1;
    if (!isOP && prevIsOP) return i-1;
    if (isOP && prevIsOP) { for (let j=i-1;j>=0;j--) if (entries[j].author!==opAuthor) return j; return i-1; }
    if (isThanks(cur.body)) { for (let j=i-1;j>=0;j--) { if (entries[j].author!==cur.author && entries[j].body.length>15 && !isQuestion(entries[j].body)) return j; } }
    if (isFollowUp(cur.body)) return i-1;
    if (isAside(cur.body)) { for (let j=i-1;j>=0;j--) { if (topicOverlap(cur.body,entries[j].body)>0.05) return j; } }
    if (isQuestion(cur.body) && !isQuestion(prev.body) && topicOverlap(cur.body,prev.body)<0.12) return -1;
    if (i>=3 && cur.body.length>30 && !isFollowUp(cur.body)) {
        if (/\b(lol|unemployed|deodorant|10\/10)\b/i.test(prev.body) && topicOverlap(cur.body,prev.body)<0.08) return -1;
    }
    if (/^wish\b/i.test(cur.body) && topicOverlap(cur.body,prev.body)<0.15) return -1;
    const prevRoot = findThreadRoot(i-1, parentIdx);
    if (isQuestion(entries[prevRoot].body) && !isQuestion(cur.body) && cur.author!==prev.author && topicOverlap(cur.body,entries[prevRoot].body)>0.05 && topicOverlap(cur.body,prev.body)<0.2) {
        return parentIdx[i-1]===-1 ? i-1 : parentIdx[i-1];
    }
    return i-1;
}

function buildTree(entries, opAuthor) {
    const n = entries.length;
    const parentIdx = new Array(n).fill(-1);
    for (let i=1;i<n;i++) parentIdx[i]=inferFlatParent(i,entries,opAuthor,parentIdx);
    const nodes = entries.map(e=>({author:e.author,body:e.body.slice(0,40),replies:[],depth:0}));
    const roots=[];
    for (let i=0;i<n;i++) {
        if (parentIdx[i]===-1) roots.push(nodes[i]);
        else nodes[parentIdx[i]].replies.push(nodes[i]);
    }
    function setD(ns,d){for(const x of ns){x.depth=d;x.replies.forEach(r=>{r.depth=d+1});setD(x.replies,d+1);}}
    setD(roots,0);
    return roots;
}

function printTree(nodes, indent=0) {
    for (const n of nodes) {
        console.log('  '.repeat(indent) + `${n.author} (d${n.depth}): ${n.body}...`);
        printTree(n.replies, indent+1);
    }
}

const file = process.argv[2] || 'Finally!.md';
const content = fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
const opAuthor = content.match(/\*\*Author:\*\*.*\[([^\]]+)\]/)?.[1] || 'cr1ys';
const lines = [];
let inC = false;
for (const l of content.split('\n')) {
    if (l.startsWith('## Comments')) inC = true;
    else if (inC) lines.push(l);
}
const entries = parseEntries(lines);
console.log(`\n=== ${file} (${entries.length} comments, OP: ${opAuthor}) ===\n`);
const tree = buildTree(entries, opAuthor);
printTree(tree);
console.log(`\nRoot threads: ${tree.length} (was ${entries.length} flat)`);
