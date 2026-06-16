# Reddit Viewer + Reddit Saver Extension

A local-first toolkit for archiving Reddit posts in structured Markdown and browsing them later like a Reddit-style archive.

**Developer:** [WhiskeyCoder](https://github.com/WhiskeyCoder)

This repository contains two parts:

- `Reddit Viewer` (web app): Reads Markdown archives from a folder and renders posts, comments, and media.
- `chrome-extension` (`Reddit Saver`): A custom Chrome extension that captures Reddit posts and exports Markdown in the exact format the viewer expects.

---

## Why this exists

The goal is to help users archive their favorite Reddit posts with structure preserved (title, post body, media, comment tree), so content remains available if:

- A post is edited or deleted later
- A subreddit is restricted or removed
- Moderation actions hide or unlist content
- Users want to keep a personal offline knowledge base

---

## Key Features

### Reddit Saver (Chrome Extension)
![image](https://github.com/WhiskeyCoder/Reddit-Archived/blob/main/images/extension.png)
- Captures:
  - Post title, author, subreddit, score, URL
  - Body text and links
  - Images, GIF/GIFV, videos, and common embeds
  - Nested comments in Markdown structure
- Export modes:
  - Save directly to a chosen folder (File System Access API)
  - Browser download (`.md`)
  - Copy Markdown to clipboard
- Settings:
  - Output folder selection
  - Filename pattern
  - Optional date prefix
  - Optional subreddit subfolder split
  - Include/exclude images, videos, comments

### Reddit Viewer (Web App)
![image](https://github.com/WhiskeyCoder/Reddit-Archived/blob/main/images/Dashboard.png)
- Opens a folder of Markdown files
- Parses post metadata and nested comments
- Supports media rendering for:
  - `v.redd.it`
  - direct `.mp4/.webm/...` links
  - `i.imgur.com/*.gifv` (converted to mp4)
  - `redgifs` / `gfycat` (iframe embeds)
- Search, filters, sort, stats, favorites, unread state, and local persistence

---

## Repository Structure

- `index.html` - Reddit Viewer entry point
- `assets/js/` - Viewer parser/UI/media/search/storage logic
- `assets/css/` - Viewer styling
- `chrome-extension/` - Full Chrome extension source (MV3)
- `chrome-extension/content/extractor.js` - Reddit page extractor
- `chrome-extension/lib/markdown-builder.js` - Markdown output builder

---

## Quick Start

### 1) Run Reddit Viewer

Open `index.html` in Chrome/Edge and select your archive folder when prompted.

### 2) Load Chrome Extension (Unpacked)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select:
   - `./chrome-extension`

### 3) Configure Extension

1. Open extension popup on a Reddit post page
2. Click the settings icon (`options.html`)
3. Choose output folder (recommended: your archive folder used by viewer)
4. Set filename and include preferences

---

## Markdown Format (Compatibility Contract)

The extension writes files in a format consumed by the viewer parser:

- Header:
  - `# <Title> [Visit](<url>)`
  - `### **Subreddit:** [...]`
  - `### **Author:** [...]`
  - `### **Vote:** <n>`
- Body markdown
- Media blocks as markdown image syntax (`![alt](url)`) for consistent media pipeline conversion
- Comments as nested list items:
  - `- by [author](url) **&#x21C5; score**`
  - reply indentation preserved

---

## Does it capture everything?

It captures the core targets reliably for standard Reddit post pages:

- Pictures ✅
- GIF/GIFV ✅
- Videos (`v.redd.it`, direct mp4/webm) ✅
- Common embed hosts (`redgifs`, `gfycat`) ✅
- Links in post body ✅
- Nested comments with structure ✅

### Practical caveats

No scraper can guarantee 100% for every edge case forever because Reddit’s DOM can change. Cases that may require follow-up patches:

- Brand-new Reddit UI component names/selectors
- Age-gated or region-gated external media
- Third-party embeds that block iframes/CORS
- Posts requiring login/session state not available to the extension context

---

## Legal & Ethical Notes

- This project is independent and not affiliated with Reddit.
- Users are responsible for complying with Reddit Terms and content policies.
- Intended for personal archiving and research workflows.
- Respect copyright and creator rights when redistributing archived content.

---

## Development Notes

- Extension: Manifest V3, modular JavaScript, no build step required
- Viewer: static web app, uses `marked` for Markdown rendering
- Storage:
  - Viewer: IndexedDB + localStorage for app state/cache
  - Extension: `chrome.storage.sync` for settings + IndexedDB for directory handle

---

## Roadmap Ideas

- Add export debug report (what media/comments were found)
- Add retry/fallback selectors for future Reddit UI changes
- Optional JSON sidecar metadata export
- Optional asset mirroring/local media download mode
- Batch capture queue from subreddit/user pages

---

## Contributing

1. Fork and create feature branch
2. Keep Markdown format compatibility intact
3. Test with multiple post types:
   - text-only
   - gallery
   - video
   - heavy comment threads
4. Open PR with before/after examples

---

## Project Status

Active. Built for resilient personal Reddit archiving workflows.

