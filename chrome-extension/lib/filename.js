/**
 * Build safe filenames compatible with Obsidian / Reddit Archive Viewer.
 * @param {string} title
 * @param {string} subreddit
 * @param {{ addDatePrefix?: boolean; filenamePattern?: string }} options
 */
export function buildFilename(title, subreddit, options = {}) {
  const { addDatePrefix = true, filenamePattern = '{title}' } = options;
  const date = new Date().toISOString().slice(0, 10);
  const safeTitle = sanitize(title);
  const safeSub = sanitize(subreddit.replace(/^r\//, ''));

  let base = filenamePattern
    .replace(/\{title\}/g, safeTitle)
    .replace(/\{subreddit\}/g, safeSub)
    .replace(/\{date\}/g, date);

  if (!base || base.length < 2) base = safeTitle || 'reddit_post';
  if (addDatePrefix && !base.startsWith(date)) {
    base = `${date}_${base}`;
  }

  return `${base.slice(0, 180)}.md`;
}

function sanitize(value) {
  return (value || 'untitled')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 120) || 'untitled';
}
