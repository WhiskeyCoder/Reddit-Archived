/**
 * Reddit-style inline post gallery + fullscreen viewer with image tools.
 */
window.RedditViewer = window.RedditViewer || {};

RedditViewer.Gallery = (function () {
    let fullscreenEl = null;

    /**
     * Replace stacked post images with a swipeable inline gallery at the top of post-body.
     */
    function setupInlineGallery(container) {
        const postBody = container.querySelector('.post-body');
        if (!postBody) return null;

        const images = collectPostImages(postBody);
        if (images.length === 0) return null;

        images.forEach(({ element }) => {
            const wrap = element.closest('.media-container');
            if (wrap) wrap.remove();
            else element.remove();
        });

        const gallery = buildInlineGallery(images);
        postBody.insertBefore(gallery, postBody.firstChild);
        bindInlineGallery(gallery, images);
        return gallery;
    }

    function collectPostImages(postBody) {
        const seen = new Set();
        const result = [];

        postBody.querySelectorAll('img').forEach((img) => {
            if (!img.src || seen.has(img.src)) return;
            seen.add(img.src);
            result.push({
                src: img.src,
                alt: img.alt || '',
                element: img
            });
        });

        return result;
    }

    function buildInlineGallery(images) {
        const multi = images.length > 1;
        const thumbsHtml = images.map((img, i) =>
            `<button type="button" class="pig-thumb${i === 0 ? ' active' : ''}" data-index="${i}" aria-label="Image ${i + 1}">
                <img src="${escapeAttr(img.src)}" alt="" loading="lazy" />
            </button>`
        ).join('');

        const el = document.createElement('div');
        el.className = 'post-image-gallery';
        el.dataset.count = images.length;
        el.innerHTML = `
            <div class="pig-layout">
                <div class="pig-viewer" tabindex="0" aria-label="Image gallery, use arrow keys to navigate">
                    <button type="button" class="pig-nav pig-prev" aria-label="Previous image" ${multi ? '' : 'hidden'}>&#8249;</button>
                    <div class="pig-stage">
                        <img class="pig-main" src="${escapeAttr(images[0].src)}" alt="${escapeAttr(images[0].alt)}" />
                    </div>
                    <button type="button" class="pig-nav pig-next" aria-label="Next image" ${multi ? '' : 'hidden'}>&#8250;</button>
                    <span class="pig-counter">${multi ? `1 / ${images.length}` : ''}</span>
                    <button type="button" class="pig-expand" aria-label="Fullscreen" title="Fullscreen">⛶</button>
                </div>
                <aside class="pig-toolbar" aria-label="Image tools">
                    <h4 class="pig-toolbar-title">Image tools</h4>
                    <button type="button" class="pig-tool" data-action="download" title="Save image">
                        <span class="pig-tool-icon">↓</span><span>Save</span>
                    </button>
                    <button type="button" class="pig-tool" data-action="open" title="Open in new tab">
                        <span class="pig-tool-icon">↗</span><span>Open</span>
                    </button>
                    <button type="button" class="pig-tool" data-action="copy" title="Copy image">
                        <span class="pig-tool-icon">⎘</span><span>Copy</span>
                    </button>
                    <div class="pig-tool-divider"></div>
                    <button type="button" class="pig-tool" data-action="zoom-in" title="Zoom in">
                        <span class="pig-tool-icon">+</span><span>Zoom in</span>
                    </button>
                    <button type="button" class="pig-tool" data-action="zoom-out" title="Zoom out">
                        <span class="pig-tool-icon">−</span><span>Zoom out</span>
                    </button>
                    <button type="button" class="pig-tool" data-action="fit" title="Fit to view">
                        <span class="pig-tool-icon">⊡</span><span>Fit</span>
                    </button>
                    <button type="button" class="pig-tool" data-action="fullscreen" title="Fullscreen">
                        <span class="pig-tool-icon">⛶</span><span>Fullscreen</span>
                    </button>
                </aside>
            </div>
            ${multi ? `<div class="pig-thumbs" role="tablist">${thumbsHtml}</div>` : ''}
        `;
        return el;
    }

    function bindInlineGallery(gallery, images) {
        let index = 0;
        let scale = 1;

        const main = gallery.querySelector('.pig-main');
        const counter = gallery.querySelector('.pig-counter');
        const stage = gallery.querySelector('.pig-stage');
        const viewer = gallery.querySelector('.pig-viewer');
        const thumbs = gallery.querySelectorAll('.pig-thumb');

        function update() {
            const img = images[index];
            main.src = img.src;
            main.alt = img.alt;
            main.style.transform = `scale(${scale})`;
            if (counter) counter.textContent = `${index + 1} / ${images.length}`;
            thumbs.forEach((t, i) => t.classList.toggle('active', i === index));
            const activeThumb = gallery.querySelector('.pig-thumb.active');
            activeThumb?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }

        function prev() {
            if (images.length < 2) return;
            index = (index - 1 + images.length) % images.length;
            scale = 1;
            update();
        }

        function next() {
            if (images.length < 2) return;
            index = (index + 1) % images.length;
            scale = 1;
            update();
        }

        gallery.querySelector('.pig-prev')?.addEventListener('click', prev);
        gallery.querySelector('.pig-next')?.addEventListener('click', next);
        gallery.querySelector('.pig-expand')?.addEventListener('click', () => openFullscreen(images, index));

        thumbs.forEach((thumb) => {
            thumb.addEventListener('click', () => {
                index = parseInt(thumb.dataset.index, 10);
                scale = 1;
                update();
            });
        });

        gallery.querySelectorAll('.pig-tool').forEach((btn) => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                const current = images[index];
                if (action === 'download') downloadImage(current.src, filenameFromSrc(current.src, index));
                else if (action === 'open') window.open(current.src, '_blank');
                else if (action === 'copy') copyImage(current.src);
                else if (action === 'zoom-in') { scale = Math.min(scale + 0.25, 4); main.style.transform = `scale(${scale})`; }
                else if (action === 'zoom-out') { scale = Math.max(scale - 0.25, 0.5); main.style.transform = `scale(${scale})`; }
                else if (action === 'fit') { scale = 1; main.style.transform = 'scale(1)'; }
                else if (action === 'fullscreen') openFullscreen(images, index);
            });
        });

        main.addEventListener('click', () => openFullscreen(images, index));

        viewer.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
        });

        let touchX = 0;
        stage.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
        stage.addEventListener('touchend', (e) => {
            const dx = e.changedTouches[0].clientX - touchX;
            if (Math.abs(dx) > 48) {
                if (dx < 0) next();
                else prev();
            }
        }, { passive: true });

        gallery._galleryApi = { goTo: (i) => { index = i; scale = 1; update(); }, getIndex: () => index };
    }

    function openFullscreen(images, startIndex = 0) {
        closeFullscreen();

        let index = startIndex;
        let scale = 1;
        const multi = images.length > 1;

        fullscreenEl = document.createElement('div');
        fullscreenEl.className = 'gallery-fs-overlay';
        fullscreenEl.innerHTML = `
            <div class="gallery-fs-header">
                <span class="gallery-fs-title">${multi ? `${index + 1} / ${images.length}` : 'Image'}</span>
                <button type="button" class="gallery-fs-close" aria-label="Close">&times;</button>
            </div>
            <div class="gallery-fs-body">
                <div class="gallery-fs-main">
                    ${multi ? '<button type="button" class="gallery-fs-nav gallery-fs-prev">&#8249;</button>' : ''}
                    <div class="gallery-fs-stage">
                        <img class="gallery-fs-img" src="" alt="" />
                    </div>
                    ${multi ? '<button type="button" class="gallery-fs-nav gallery-fs-next">&#8250;</button>' : ''}
                </div>
                <aside class="gallery-fs-tools">
                    <button type="button" class="pig-tool" data-action="download"><span class="pig-tool-icon">↓</span> Save</button>
                    <button type="button" class="pig-tool" data-action="open"><span class="pig-tool-icon">↗</span> Open</button>
                    <button type="button" class="pig-tool" data-action="copy"><span class="pig-tool-icon">⎘</span> Copy</button>
                    <div class="pig-tool-divider"></div>
                    <button type="button" class="pig-tool" data-action="zoom-in"><span class="pig-tool-icon">+</span> Zoom in</button>
                    <button type="button" class="pig-tool" data-action="zoom-out"><span class="pig-tool-icon">−</span> Zoom out</button>
                    <button type="button" class="pig-tool" data-action="fit"><span class="pig-tool-icon">⊡</span> Fit</button>
                </aside>
            </div>
            ${multi ? '<div class="gallery-fs-thumbs"></div>' : ''}
        `;
        document.body.appendChild(fullscreenEl);

        const img = fullscreenEl.querySelector('.gallery-fs-img');
        const title = fullscreenEl.querySelector('.gallery-fs-title');
        const thumbsWrap = fullscreenEl.querySelector('.gallery-fs-thumbs');

        if (multi && thumbsWrap) {
            images.forEach((item, i) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'pig-thumb' + (i === index ? ' active' : '');
                b.innerHTML = `<img src="${escapeAttr(item.src)}" alt="" />`;
                b.onclick = () => { index = i; scale = 1; refresh(); };
                thumbsWrap.appendChild(b);
            });
        }

        function refresh() {
            img.src = images[index].src;
            img.alt = images[index].alt || '';
            img.style.transform = `scale(${scale})`;
            if (title && multi) title.textContent = `${index + 1} / ${images.length}`;
            fullscreenEl.querySelectorAll('.pig-thumb').forEach((t, i) => t.classList.toggle('active', i === index));
        }

        function close() {
            document.removeEventListener('keydown', onKey);
            fullscreenEl?.remove();
            fullscreenEl = null;
        }

        function onKey(e) {
            if (e.key === 'Escape') close();
            else if (e.key === 'ArrowLeft' && multi) { index = (index - 1 + images.length) % images.length; scale = 1; refresh(); }
            else if (e.key === 'ArrowRight' && multi) { index = (index + 1) % images.length; scale = 1; refresh(); }
        }

        fullscreenEl.querySelector('.gallery-fs-close').onclick = close;
        fullscreenEl.querySelector('.gallery-fs-prev')?.addEventListener('click', () => {
            index = (index - 1 + images.length) % images.length; scale = 1; refresh();
        });
        fullscreenEl.querySelector('.gallery-fs-next')?.addEventListener('click', () => {
            index = (index + 1) % images.length; scale = 1; refresh();
        });

        fullscreenEl.querySelectorAll('.pig-tool').forEach((btn) => {
            btn.addEventListener('click', () => {
                const cur = images[index];
                const action = btn.dataset.action;
                if (action === 'download') downloadImage(cur.src, filenameFromSrc(cur.src, index));
                else if (action === 'open') window.open(cur.src, '_blank');
                else if (action === 'copy') copyImage(cur.src);
                else if (action === 'zoom-in') { scale = Math.min(scale + 0.25, 4); img.style.transform = `scale(${scale})`; }
                else if (action === 'zoom-out') { scale = Math.max(scale - 0.25, 0.5); img.style.transform = `scale(${scale})`; }
                else if (action === 'fit') { scale = 1; img.style.transform = 'scale(1)'; }
            });
        });

        fullscreenEl.addEventListener('click', (e) => {
            if (e.target === fullscreenEl) close();
        });

        document.addEventListener('keydown', onKey);
        fullscreenEl._onKey = onKey;
        refresh();
    }

    function closeFullscreen() {
        if (fullscreenEl) {
            document.removeEventListener('keydown', fullscreenEl._onKey);
            fullscreenEl.remove();
            fullscreenEl = null;
        }
    }

    async function downloadImage(src, filename) {
        try {
            const response = await fetch(src);
            const blob = await response.blob();
            const ext = blob.type.split('/')[1] || 'jpg';
            const name = filename || `image.${ext}`;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch {
            const a = document.createElement('a');
            a.href = src;
            a.download = filename || 'image.jpg';
            a.target = '_blank';
            a.click();
        }
    }

    async function copyImage(src) {
        try {
            const response = await fetch(src);
            const blob = await response.blob();
            await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
            toast('Image copied to clipboard');
        } catch {
            try {
                await navigator.clipboard.writeText(src);
                toast('Image URL copied');
            } catch {
                toast('Copy not supported — use Save instead');
            }
        }
    }

    function filenameFromSrc(src, index) {
        try {
            const url = new URL(src);
            const parts = url.pathname.split('/').filter(Boolean);
            const last = parts[parts.length - 1];
            if (last && /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(last)) return last;
        } catch { /* blob urls */ }
        return `reddit-image-${index + 1}.jpg`;
    }

    function toast(msg) {
        const el = document.createElement('div');
        el.className = 'gallery-toast';
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => el.classList.add('show'), 10);
        setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2200);
    }

    function escapeAttr(text) {
        return String(text).replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    /** Legacy API — opens fullscreen from image list */
    function open(images, startIndex = 0) {
        openFullscreen(images, startIndex);
    }

    function collectImagesFromPost(container) {
        const gallery = container.querySelector('.post-image-gallery');
        if (!gallery) return [];

        const thumbs = gallery.querySelectorAll('.pig-thumb img');
        if (thumbs.length) {
            return Array.from(thumbs).map((img) => ({ src: img.src, alt: img.alt || '' }));
        }

        const main = gallery.querySelector('.pig-main');
        return main ? [{ src: main.src, alt: main.alt || '' }] : [];
    }

    return {
        setupInlineGallery,
        open,
        openFullscreen,
        closeFullscreen,
        collectImagesFromPost,
        downloadImage
    };
})();
