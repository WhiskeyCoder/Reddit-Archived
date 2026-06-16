/**
 * Injected into Reddit post pages. Returns structured post data for Markdown export.
 * Compatible with Reddit Archive Viewer media patterns (v.redd.it, redgifs, imgur gifv).
 */

/**
 * @typedef {{ type: 'image' | 'video' | 'embed'; url: string; alt?: string }} MediaItem
 * @typedef {{
 *   title: string;
 *   postUrl: string;
 *   vote: string;
 *   author: string;
 *   subreddit: string;
 *   content: string | null;
 *   media: MediaItem[];
 *   commentsMarkdown: string;
 *   totalComments: string;
 * }} RedditPostData
 */

function extractRedditPost() {
  const POST_URL_RE = /^https:\/\/(www\.)?reddit\.com\/r\/[^/]+\/comments\/[a-z0-9]+/i;

  if (!POST_URL_RE.test(window.location.href)) {
    return { error: 'not_post', message: 'Open a Reddit post page (comments URL).' };
  }

  const shredditPost = document.querySelector('shreddit-post');
  if (!shredditPost) {
    return { error: 'no_post', message: 'Could not find post on this page. Try refreshing.' };
  }

  const titleEl = document.querySelector('h1[id^="post-title-"]') || document.querySelector('h1');
  const title = titleEl?.innerText?.trim() || 'Untitled';

  const author =
    document.querySelector('.author-name')?.innerText?.trim() ||
    shredditPost.getAttribute('author') ||
    'Unknown';

  let subreddit =
    document.querySelector('.subreddit-name')?.innerText?.trim() ||
    shredditPost.getAttribute('subreddit-prefixed-name') ||
    'Unknown';

  if (!subreddit.startsWith('r/') && subreddit !== 'Unknown') {
    subreddit = `r/${subreddit.replace(/^r\//, '')}`;
  }

  const vote = shredditPost.getAttribute('score') || '0';
  const totalComments = shredditPost.getAttribute('comment-count') || '0';

  const postId = titleEl?.id?.split('-')?.[2] || shredditPost.getAttribute('id')?.replace(/^t3_/, '');
  const contentEl = postId
    ? document.querySelector(`#${postId}-post-rtjson-content`)
    : document.querySelector('[id$="-post-rtjson-content"]:not([id*="comment"])');

  const content = contentEl ? htmlToMarkdown(contentEl) : null;
  const media = collectMedia(shredditPost, contentEl, title);

  return {
    title,
    postUrl: window.location.href.split('?')[0],
    vote,
    author,
    subreddit,
    content,
    media: dedupeMedia(media),
    commentsMarkdown: buildCommentsMarkdown(totalComments),
    totalComments
  };
}

function collectMedia(shredditPost, contentEl, title) {
  /** @type {MediaItem[]} */
  const items = [];
  const seen = new Set();

  function add(type, url, alt) {
    const normalized = normalizeMediaUrl(url);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    items.push({ type, url: normalized, alt: alt || title });
  }

  // Single post image
  const postImage = document.querySelector('#post-image');
  if (postImage?.src) add('image', postImage.src, postImage.alt || title);

  // Gallery carousel
  document.querySelectorAll('gallery-carousel li figure img').forEach((img) => {
    const src = img.src || img.dataset?.lazySrc;
    if (src) add('image', src, img.alt || title);
  });

  // Native video elements (Reddit player, v.redd.it)
  document.querySelectorAll('video').forEach((video) => {
    const src = video.currentSrc || video.src || video.querySelector('source')?.src;
    if (src) {
      add(classifyUrl(src), resolveVideoUrl(src), title);
    }
  });

  // Reddit shreddit player hosts
  document.querySelectorAll('shreddit-player-2, shreddit-player').forEach((player) => {
    const src =
      player.getAttribute('src') ||
      player.getAttribute('poster') ||
      player.querySelector('source')?.getAttribute('src');
    if (src) add(classifyUrl(src), resolveVideoUrl(src), title);
  });

  // Links in post body
  if (contentEl) {
    contentEl.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href');
      if (!href) return;
      if (isVideoHost(href)) add(classifyUrl(href), resolveVideoUrl(href), a.innerText || title);
      else if (isImageUrl(href)) add('image', href, a.innerText || title);
    });
  }

  // Post-level outbound link (link posts)
  const contentHref = shredditPost.getAttribute('content-href');
  if (contentHref) {
    if (isVideoHost(contentHref)) add(classifyUrl(contentHref), resolveVideoUrl(contentHref), title);
    else if (isImageUrl(contentHref)) add('image', contentHref, title);
  }

  // Preview / thumbnail that points to video
  const previewImg = document.querySelector('img[src*="preview.redd.it"], img[src*="external-preview"]');
  if (previewImg?.src && items.every((i) => i.type === 'image' || !i.url.includes('v.redd.it'))) {
    const videoIdMatch = window.location.pathname.match(/\/comments\/([a-z0-9]+)/i);
    if (videoIdMatch) {
      const embedVideo = findVideoUrlNearPost();
      if (embedVideo) add('video', embedVideo, title);
    }
  }

  return items;
}

function findVideoUrlNearPost() {
  for (const source of document.querySelectorAll('source[src*="v.redd.it"], source[src*=".mp4"]')) {
    const src = source.getAttribute('src');
    if (src) return resolveVideoUrl(src);
  }
  for (const a of document.querySelectorAll('a[href*="v.redd.it"]')) {
    const href = a.getAttribute('href');
    if (href) return resolveVideoUrl(href);
  }
  return null;
}

function classifyUrl(url) {
  if (/v\.redd\.it|\.mp4|\.webm|\.gifv|redgifs|gfycat|youtube\.com|youtu\.be/i.test(url)) {
    return /redgifs|gfycat|youtube|youtu\.be/i.test(url) ? 'embed' : 'video';
  }
  return 'image';
}

function isVideoHost(url) {
  return /v\.redd\.it|\.mp4|\.webm|\.gifv|redgifs\.com|gfycat\.com|youtube\.com|youtu\.be/i.test(url);
}

function isImageUrl(url) {
  return /\.(jpg|jpeg|png|gif|webp)(\?|$)|preview\.redd\.it|i\.redd\.it/i.test(url);
}

function normalizeMediaUrl(url) {
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return null;
  try {
    return new URL(url, window.location.origin).href;
  } catch {
    return null;
  }
}

/** Prefer direct MP4 for v.redd.it so Reddit Archive Viewer can play inline. */
function resolveVideoUrl(url) {
  if (!url) return url;
  if (/i\.imgur\.com\/.*\.gifv/i.test(url)) {
    return url.replace(/\.gifv$/i, '.mp4');
  }
  if (/v\.redd\.it\/[^/?#]+$/i.test(url)) {
    return `${url.replace(/\/$/, '')}/DASH_720.mp4`;
  }
  return url;
}

function dedupeMedia(items) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const key = item.url.replace(/\/DASH_\d+\.mp4$/i, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function htmlToMarkdown(root) {
  const processNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();

    switch (tag) {
      case 'p':
        return `${processChildren(node).trim()}\n\n`;
      case 'br':
        return '\n';
      case 'a': {
        const href = node.getAttribute('href') || '';
        const text = processChildren(node).trim() || href;
        return `[${text}](${href})`;
      }
      case 'strong':
      case 'b':
        return `**${processChildren(node)}**`;
      case 'em':
      case 'i':
        return `*${processChildren(node)}*`;
      case 'code':
        return `\`${node.textContent}\``;
      case 'pre':
        return `\n\`\`\`\n${node.textContent.trim()}\n\`\`\`\n\n`;
      case 'blockquote':
        return processChildren(node)
          .split('\n')
          .filter(Boolean)
          .map((l) => `> ${l}`)
          .join('\n') + '\n\n';
      case 'ul':
        return `${Array.from(node.children).map(processNode).join('')}\n`;
      case 'ol':
        return Array.from(node.children)
          .map((child, i) => processNode(child).replace(/^- /, `${i + 1}. `))
          .join('');
      case 'li': {
        const content = node.querySelector('p')
          ? processChildren(node.querySelector('p')).trim()
          : processChildren(node).trim();
        return `- ${content}\n`;
      }
      case 'img': {
        const src = node.getAttribute('src') || '';
        const alt = node.getAttribute('alt') || '';
        if (!src) return '';
        return `![${alt}](${src})\n\n`;
      }
      case 'video': {
        const src =
          node.currentSrc ||
          node.getAttribute('src') ||
          node.querySelector('source')?.getAttribute('src') ||
          '';
        if (!src) return processChildren(node);
        const resolved = resolveVideoUrl(src);
        return `![video](${resolved})\n\n`;
      }
      case 'iframe': {
        const src = node.getAttribute('src') || '';
        if (!src) return '';
        return `[Embedded media](${src})\n\n`;
      }
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
        return `${'#'.repeat(Number(tag[1]))} ${processChildren(node).trim()}\n\n`;
      default:
        return processChildren(node);
    }
  };

  const processChildren = (parent) =>
    Array.from(parent.childNodes).map(processNode).join('');

  return processChildren(root)
    .replace(/^\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildCommentsMarkdown(totalComments) {
  const allComments = Array.from(document.querySelectorAll("div[id$='-comment-rtjson-content']"));
  if (allComments.length === 0) return '';

  const getDepth = (div) => {
    const input = div.closest('shreddit-comment-composer-host')?.querySelector('input[name="commentDepth"]');
    return input ? parseInt(input.value, 10) : 1;
  };

  const topLevel = allComments.filter((div) => getDepth(div) === 1);

  const parseCommentRecursively = (div, indent) => {
    const contentDiv = div.querySelector('[id$="post-rtjson-content"]') || div;
    const markdown = htmlToMarkdown(contentDiv);
    const wrapper = div.closest('shreddit-comment');
    const authorAnchor = wrapper?.querySelector("a[href*='/user/']");
    const authorUrl = authorAnchor?.href || '#';
    const author = authorUrl.split('/').filter(Boolean).pop() || 'unknown';
    const vote = extractCommentScore(wrapper, div);
    const pad = '  '.repeat(indent);

    let md = `${pad}- by [${author}](${authorUrl}) **&#x21C5; ${vote}**\n${pad}  <br/> ${markdown}\n`;

    const commentId = div.id.split('-')[0];
    const replies = Array.from(document.querySelectorAll(`[name="parentId"][value="${commentId}"]`))
      .map((input) => input.closest("div[id$='-comment-rtjson-content']"))
      .filter(Boolean);

    for (const reply of replies) {
      md += parseCommentRecursively(reply, indent +  1);
    }
    return md;
  };

  const body = topLevel.map((div) => parseCommentRecursively(div, 0)).join('\n');
  return `## Comments ${totalComments}\n\n${body}`.trim();
}

function extractCommentScore(wrapper, commentRoot) {
  const candidates = [];

  if (wrapper) {
    candidates.push(
      wrapper.getAttribute('score'),
      wrapper.getAttribute('data-score'),
      wrapper.getAttribute('comment-score'),
      wrapper.getAttribute('vote-count')
    );
  }

  // Text fallbacks for UI variants where score is rendered as text.
  const scoreNodes = [
    ...(wrapper ? Array.from(wrapper.querySelectorAll('[aria-label*="upvote" i], [aria-label*="point" i], [id*="score" i], [class*="score" i]')) : []),
    ...Array.from(commentRoot.querySelectorAll('[aria-label*="upvote" i], [aria-label*="point" i], [id*="score" i], [class*="score" i]'))
  ];

  for (const node of scoreNodes) {
    if (node?.textContent) candidates.push(node.textContent);
    const aria = node?.getAttribute?.('aria-label');
    if (aria) candidates.push(aria);
  }

  // Last fallback: parse entire comment wrapper text for "123 points"/"1.2k".
  if (wrapper?.textContent) candidates.push(wrapper.textContent);

  for (const raw of candidates) {
    const parsed = parseScoreValue(raw);
    if (parsed !== null) return String(parsed);
  }

  return '0';
}

function parseScoreValue(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().toLowerCase();
  if (!text) return null;

  if (/^[-+]?\d+$/.test(text)) return parseInt(text, 10);

  const compact = text.match(/([-+]?\d+(?:\.\d+)?)\s*([kmb])\b/);
  if (compact) {
    const num = parseFloat(compact[1]);
    const unit = compact[2];
    const mult = unit === 'k' ? 1_000 : unit === 'm' ? 1_000_000 : 1_000_000_000;
    return Math.round(num * mult);
  }

  const points = text.match(/([-+]?\d[\d,]*)\s*(?:points?|upvotes?)/);
  if (points) return parseInt(points[1].replace(/,/g, ''), 10);

  const plain = text.match(/[-+]?\d[\d,]*/);
  if (plain) return parseInt(plain[0].replace(/,/g, ''), 10);

  return null;
}

// Expose for chrome.scripting.executeScript
if (typeof globalThis !== 'undefined') {
  globalThis.extractRedditPost = extractRedditPost;
}
