/**
 * Media resolution: local files, Reddit videos, embeds, lightbox.
 */
window.RedditViewer = window.RedditViewer || {};

RedditViewer.Media = (function () {
    async function processMediaInMarkdown(markdown, dirHandle, filename) {
        if (!markdown) return '';

        if (dirHandle) {
            const mdImgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
            const mediaPromises = [];
            const mediaReplacements = new Map();
            let mdImgMatch;

            while ((mdImgMatch = mdImgRegex.exec(markdown)) !== null) {
                const src = mdImgMatch[2];
                const alt = mdImgMatch[1];
                if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) continue;

                const promise = getLocalMediaUrl(src, dirHandle, filename).then((url) => {
                    const originalPattern = `![${alt}](${src})`;
                    const imageExt = /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(src);
                    const videoExt = /\.(mp4|webm|ogg|mov|avi|mkv)$/i.test(src);
                    if (imageExt) {
                        mediaReplacements.set(originalPattern,
                            `<div class="media-container"><img src="${url}" alt="${escapeAttr(alt)}" class="post-media-img" loading="lazy" /></div>`);
                    } else if (videoExt) {
                        mediaReplacements.set(originalPattern,
                            `<div class="media-container"><video src="${url}" controls class="post-media-video"></video></div>`);
                    }
                }).catch((err) => console.error('Error loading media:', src, err));
                mediaPromises.push(promise);
            }

            await Promise.all(mediaPromises);
            mediaReplacements.forEach((replacement, original) => {
                markdown = markdown.replace(new RegExp(escapeRegex(original), 'g'), replacement);
            });
        }

        let html = marked.parse(markdown);
        html = processVideoAndGifUrls(html);
        html = wrapMediaInContainers(html);

        if (dirHandle) {
            const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
            const videoRegex = /<video[^>]+src=["']([^"']+)["'][^>]*>/gi;
            const mediaPromises = [];
            const mediaMap = new Map();

            let imgMatch;
            while ((imgMatch = imgRegex.exec(html)) !== null) {
                const src = imgMatch[1];
                if (isRemoteOrBlob(src)) continue;
                mediaPromises.push(
                    getLocalMediaUrl(src, dirHandle, filename).then((url) => mediaMap.set(src, url))
                        .catch((err) => console.error('Error loading image:', src, err))
                );
            }

            let videoMatch;
            while ((videoMatch = videoRegex.exec(html)) !== null) {
                const src = videoMatch[1];
                if (isRemoteOrBlob(src)) continue;
                mediaPromises.push(
                    getLocalMediaUrl(src, dirHandle, filename).then((url) => mediaMap.set(src, url))
                        .catch((err) => console.error('Error loading video:', src, err))
                );
            }

            await Promise.all(mediaPromises);
            mediaMap.forEach((url, originalSrc) => {
                html = html.replace(new RegExp(escapeRegex(originalSrc), 'g'), url);
            });
        }

        return html;
    }

    function isRemoteOrBlob(src) {
        return src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('blob:');
    }

    function processVideoAndGifUrls(html) {
        html = html.replace(/!\[([^\]]*)\]\((https?:\/\/v\.redd\.it\/[^)]+)\)/gi, (_, alt, url) =>
            `<div class="media-container"><video controls class="post-media-video"><source src="${url}" type="video/mp4"></video></div>`);

        html = html.replace(/!\[([^\]]*)\]\((https?:\/\/(?:www\.)?(?:gfycat|redgifs)\.com\/[^)]+)\)/gi, (_, alt, url) => {
            const gfyId = url.match(/\/([^/]+)(?:\/|$)/);
            if (!gfyId) return _;
            const embedUrl = url.includes('redgifs')
                ? `https://www.redgifs.com/ifr/${gfyId[1]}`
                : `https://gfycat.com/ifr/${gfyId[1]}`;
            return `<div class="media-container"><iframe src="${embedUrl}" class="post-media-iframe" allowfullscreen></iframe></div>`;
        });

        html = html.replace(/!\[([^\]]*)\]\((https?:\/\/i\.imgur\.com\/[^)]+\.gifv?)\)/gi, (_, alt, url) => {
            const videoUrl = url.replace(/\.gifv?$/, '.mp4');
            return `<div class="media-container"><video controls loop class="post-media-video"><source src="${videoUrl}" type="video/mp4"></video></div>`;
        });

        html = html.replace(/!\[([^\]]*)\]\((https?:\/\/[^)]+\.(mp4|webm|ogg|mov|avi|mkv))\)/gi, (_, alt, url) =>
            `<div class="media-container"><video controls class="post-media-video"><source src="${url}"></video></div>`);

        html = html.replace(/<img[^>]+src=["'](https?:\/\/v\.redd\.it\/[^"']+)["'][^>]*>/gi, (_, url) =>
            `<div class="media-container"><video controls class="post-media-video"><source src="${url}" type="video/mp4"></video></div>`);

        html = html.replace(/<img[^>]+src=["'](https?:\/\/i\.imgur\.com\/[^"']+\.gifv?)["'][^>]*>/gi, (_, url) => {
            const videoUrl = url.replace(/\.gifv?$/, '.mp4');
            return `<div class="media-container"><video controls loop class="post-media-video"><source src="${videoUrl}" type="video/mp4"></video></div>`;
        });

        html = html.replace(/<img[^>]+src=["'](https?:\/\/[^"']+\.(mp4|webm|ogg|mov|avi|mkv))["'][^>]*>/gi, (_, url) =>
            `<div class="media-container"><video controls class="post-media-video"><source src="${url}"></video></div>`);

        // Also support plain markdown links for embedded media:
        // [Embedded media](https://redgifs.com/...)
        html = html.replace(/<a[^>]+href=["'](https?:\/\/(?:www\.)?(?:gfycat|redgifs)\.com\/[^"']+)["'][^>]*>[\s\S]*?<\/a>/gi, (_, url) => {
            const gfyId = url.match(/\/([^/]+)(?:\/|$)/);
            if (!gfyId) return _;
            const embedUrl = url.includes('redgifs')
                ? `https://www.redgifs.com/ifr/${gfyId[1]}`
                : `https://gfycat.com/ifr/${gfyId[1]}`;
            return `<div class="media-container"><iframe src="${embedUrl}" class="post-media-iframe" allowfullscreen></iframe></div>`;
        });

        html = html.replace(/<a[^>]+href=["'](https?:\/\/v\.redd\.it\/[^"']+)["'][^>]*>[\s\S]*?<\/a>/gi, (_, url) =>
            `<div class="media-container"><video controls class="post-media-video"><source src="${url}" type="video/mp4"></video></div>`);

        html = html.replace(/<a[^>]+href=["'](https?:\/\/[^"']+\.(mp4|webm|ogg|mov|avi|mkv))["'][^>]*>[\s\S]*?<\/a>/gi, (_, url) =>
            `<div class="media-container"><video controls class="post-media-video"><source src="${url}"></video></div>`);

        return html;
    }

    function wrapMediaInContainers(html) {
        const parts = html.split(/(<div class="media-container">[\s\S]*?<\/div>)/);
        let result = '';
        for (const part of parts) {
            if (part.includes('class="media-container"')) {
                result += part;
                continue;
            }
            let p = part;
            p = p.replace(/(<img[^>]+>)/g, '<div class="media-container">$1</div>');
            p = p.replace(/(<video[^>]+>[\s\S]*?<\/video>)/g, '<div class="media-container">$1</div>');
            p = p.replace(/(<iframe[^>]+>[\s\S]*?<\/iframe>)/g, '<div class="media-container">$1</div>');
            result += p;
        }
        return result;
    }

    async function getLocalMediaUrl(mediaPath, dirHandle) {
        if (!dirHandle) return mediaPath;
        let cleanPath = mediaPath.trim().replace(/^\.[/\\]/, '').replace(/\\/g, '/');
        const pathParts = cleanPath.split('/').filter((p) => p && p !== '.');
        if (pathParts.length === 0) throw new Error('Invalid media path');
        const fileName = pathParts[pathParts.length - 1];

        try {
            let currentHandle = dirHandle;
            for (let i = 0; i < pathParts.length - 1; i++) {
                currentHandle = await currentHandle.getDirectoryHandle(pathParts[i]);
            }
            const fileHandle = await currentHandle.getFileHandle(fileName);
            const file = await fileHandle.getFile();
            return URL.createObjectURL(file);
        } catch {
            try {
                const fileHandle = await dirHandle.getFileHandle(fileName);
                const file = await fileHandle.getFile();
                return URL.createObjectURL(file);
            } catch {
                const fileHandle = await findFileRecursively(dirHandle, fileName);
                if (fileHandle) {
                    const file = await fileHandle.getFile();
                    return URL.createObjectURL(file);
                }
                return mediaPath;
            }
        }
    }

    async function findFileRecursively(dirHandle, fileName) {
        try {
            return await dirHandle.getFileHandle(fileName);
        } catch {
            for await (const entry of dirHandle.values()) {
                if (entry.kind === 'directory') {
                    try {
                        return await findFileRecursively(entry, fileName);
                    } catch { /* continue */ }
                }
            }
            throw new Error('File not found');
        }
    }

    function setupMediaViewers(container) {
        RedditViewer.Gallery.setupInlineGallery(container);

        container.querySelectorAll('.post-body video, .post-media-video').forEach((video) => {
            video.controls = true;
        });

        container.querySelectorAll('.comment-body video, .comment-media-video').forEach((video) => {
            video.controls = true;
        });
    }

    function escapeRegex(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function escapeAttr(s) {
        return s.replace(/"/g, '&quot;');
    }

    return {
        processMediaInMarkdown,
        processVideoAndGifUrls,
        setupMediaViewers
    };
})();
