/**
 * Build Markdown output compatible with Reddit Archive Viewer parser.
 * @param {import('../content/extractor.js').RedditPostData} post
 * @param {import('./settings.js').ExtensionSettings} settings
 */
export function buildMarkdown(post, settings) {
  const subName = post.subreddit.replace(/^r\//, '');
  const subUrl = post.subreddit.startsWith('r/')
    ? `https://www.reddit.com/${post.subreddit}`
    : `https://www.reddit.com/r/${subName}`;

  let md = `# ${post.title} [Visit](${post.postUrl})
### **Subreddit:** [${post.subreddit}](${subUrl})
### **Author:** [${post.author}](https://www.reddit.com/user/${post.author}/)
### **Vote:** ${post.vote}
---
`;

  if (post.content?.trim()) {
    md += `${post.content.trim()}\n---\n`;
  }

  const contentUrls = collectMediaUrls(post.content || '');
  const emitted = new Set(contentUrls);

  if (settings.includeImages || settings.includeVideos) {
    for (const item of post.media) {
      if (item.type === 'image' && !settings.includeImages) continue;
      if (item.type === 'video' && !settings.includeVideos) continue;
      if (item.type === 'embed' && !settings.includeVideos) continue;

      const normalized = normalizeUrl(item.url);
      if (!normalized || emitted.has(normalized)) continue;
      emitted.add(normalized);

      if (item.type === 'video') {
        md += `\n![${escapeAlt(item.alt || post.title)}](${item.url})\n---\n`;
      } else if (item.type === 'embed') {
        // Keep embed hosts in image markdown form so the viewer media pipeline
        // can convert them into iframe/video containers consistently.
        md += `\n![${escapeAlt(item.alt || 'Embedded media')}](${item.url})\n---\n`;
      } else {
        md += `\n![${escapeAlt(item.alt || post.title)}](${item.url})\n---\n`;
      }
    }
  }

  if (settings.includeComments && post.commentsMarkdown) {
    md += `\n${post.commentsMarkdown}`;
  }

  return md.trim() + '\n';
}

function escapeAlt(text) {
  return text.replace(/[\[\]]/g, '');
}

function collectMediaUrls(markdown) {
  const out = new Set();
  if (!markdown) return out;

  const imgRe = /!\[[^\]]*]\(([^)]+)\)/g;
  const linkRe = /\[[^\]]*]\(([^)]+)\)/g;

  for (const re of [imgRe, linkRe]) {
    let match;
    while ((match = re.exec(markdown)) !== null) {
      const normalized = normalizeUrl(match[1]);
      if (normalized) out.add(normalized);
    }
  }

  return out;
}

function normalizeUrl(url) {
  if (!url) return null;
  try {
    const normalized = new URL(url, 'https://www.reddit.com');
    normalized.hash = '';
    if (normalized.hostname.includes('preview.redd.it')) {
      normalized.search = '';
    }
    return normalized.toString();
  } catch {
    return url.trim();
  }
}
