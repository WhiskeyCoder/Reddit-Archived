# Reddit Saver Chrome Extension

A new from-scratch Chrome extension to export Reddit post pages into markdown that is compatible with this repo's Reddit Archive Viewer.

**Developer:** [WhiskeyCoder](https://github.com/WhiskeyCoder)

## Features

- Extract Reddit post title, body, votes, author, subreddit, comments.
- Capture media links (images + videos + embeds).
- Supports video hosts used by the viewer: v.redd.it, imgur gifv, redgifs, gfycat, direct mp4/webm.
- Export modes:
  - Save directly to selected folder (File System Access API)
  - Download markdown
  - Copy markdown to clipboard
- Settings page:
  - Select output folder
  - Filename pattern
  - Date prefix
  - Optional subreddit subfolder
  - Include toggles (images, videos, comments)

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder:
   - `./chrome-extension`

## Notes

- `Save to folder` uses browser folder permission and may prompt again if permissions are reset.
- If extraction fails on a post page, refresh the Reddit tab and open the extension again.
