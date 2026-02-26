// Overlay Tool Module
const Overlay = (function() {
    // Resolution settings
    const EDIT_MAX_SIZE = 1200;  // Lower res for smooth editing
    const OUTPUT_MAX_SIZE = 4800; // High res for final output

    // Pagination settings
    const PAGES_PER_VIEW = 4;

    // State
    const state = {
        layers: {
            1: { file: null, doc: null, selectedPage: null, canvas: null, pageOffset: 0, totalPages: 0 },
            2: { file: null, doc: null, selectedPage: null, canvas: null, pageOffset: 0, totalPages: 0 }
        },
        brushMode: 'bottom', // 'bottom' reveals bottom layer, 'top' reveals top layer
        brushSize: 30,
        previewOpacity: 50,
        isDrawing: false,
        canvasWidth: 0,
        canvasHeight: 0
    };

    // Initialize on DOM ready
    document.addEventListener('DOMContentLoaded', init);

    function init() {
        setupOverlayDropZone(1);
        setupOverlayDropZone(2);
        setupControls();
        setupDrawing();
    }

    function setupOverlayDropZone(layerId) {
        const dropZone = document.getElementById(`overlay-drop-${layerId}`);
        const fileInput = document.getElementById(`overlay-file-${layerId}`);

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, e => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'));
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'));
        });

        dropZone.addEventListener('drop', e => {
            const file = e.dataTransfer.files[0];
            if (file && file.type === 'application/pdf') {
                loadOverlayPdf(layerId, file);
            }
        });

        fileInput.addEventListener('change', e => {
            const file = e.target.files[0];
            if (file) {
                loadOverlayPdf(layerId, file);
            }
        });

        dropZone.addEventListener('click', e => {
            if (!e.target.closest('.overlay-page-thumb') &&
                !e.target.closest('.overlay-page-select') &&
                !e.target.closest('.overlay-pagination')) {
                fileInput.click();
            }
        });
    }

    async function loadOverlayPdf(layerId, file) {
        const dropZone = document.getElementById(`overlay-drop-${layerId}`);
        const pagesContainer = document.getElementById(`overlay-pages-${layerId}`);

        state.layers[layerId].file = file;
        state.layers[layerId].selectedPage = null;
        state.layers[layerId].pageOffset = 0;

        dropZone.classList.add('has-pages');
        pagesContainer.innerHTML = '<div class="loading">Loading</div>';

        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            state.layers[layerId].doc = pdf;
            state.layers[layerId].totalPages = pdf.numPages;

            await renderPageThumbnails(layerId);
        } catch (error) {
            console.error('Error loading PDF:', error);
            pagesContainer.innerHTML = '<span style="color: #cc0000;">Error loading PDF</span>';
        }
    }

    async function renderPageThumbnails(layerId) {
        const pagesContainer = document.getElementById(`overlay-pages-${layerId}`);
        const layer = state.layers[layerId];
        const { doc, pageOffset, totalPages, selectedPage } = layer;

        // Build new content in a fragment first
        const fragment = document.createDocumentFragment();

        // Create wrapper for thumbnails
        const thumbsWrapper = document.createElement('div');
        thumbsWrapper.className = 'overlay-thumbs-wrapper';

        // Render visible pages
        const startPage = pageOffset + 1;
        const endPage = Math.min(pageOffset + PAGES_PER_VIEW, totalPages);

        for (let i = startPage; i <= endPage; i++) {
            const page = await doc.getPage(i);
            const thumb = await renderOverlayThumb(page, layerId, i);
            if (selectedPage === i) {
                thumb.classList.add('selected');
            }
            thumbsWrapper.appendChild(thumb);
        }

        fragment.appendChild(thumbsWrapper);

        // Add pagination if needed
        if (totalPages > PAGES_PER_VIEW) {
            const pagination = document.createElement('div');
            pagination.className = 'overlay-pagination';

            const prevBtn = document.createElement('button');
            prevBtn.className = 'btn btn-small btn-secondary';
            prevBtn.innerHTML = '&larr;';
            prevBtn.disabled = pageOffset === 0;
            prevBtn.onclick = (e) => {
                e.stopPropagation();
                navigatePages(layerId, -PAGES_PER_VIEW);
            };

            const pageInfo = document.createElement('span');
            pageInfo.className = 'page-info';
            pageInfo.textContent = `${startPage}-${endPage} of ${totalPages}`;

            const nextBtn = document.createElement('button');
            nextBtn.className = 'btn btn-small btn-secondary';
            nextBtn.innerHTML = '&rarr;';
            nextBtn.disabled = pageOffset + PAGES_PER_VIEW >= totalPages;
            nextBtn.onclick = (e) => {
                e.stopPropagation();
                navigatePages(layerId, PAGES_PER_VIEW);
            };

            pagination.appendChild(prevBtn);
            pagination.appendChild(pageInfo);
            pagination.appendChild(nextBtn);
            fragment.appendChild(pagination);
        }

        // Swap content all at once
        pagesContainer.innerHTML = '';
        pagesContainer.appendChild(fragment);
    }

    function navigatePages(layerId, delta) {
        const layer = state.layers[layerId];
        const newOffset = layer.pageOffset + delta;
        layer.pageOffset = Math.max(0, Math.min(newOffset, layer.totalPages - 1));
        renderPageThumbnails(layerId);
    }

    async function renderOverlayThumb(page, layerId, pageNum) {
        const scale = 80 / page.getViewport({ scale: 1 }).width;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const context = canvas.getContext('2d');
        await page.render({ canvasContext: context, viewport }).promise;

        const thumb = document.createElement('div');
        thumb.className = 'overlay-page-thumb';
        thumb.dataset.layerId = layerId;
        thumb.dataset.pageNum = pageNum;

        thumb.innerHTML = `<div class="page-number">P${pageNum}</div>`;
        thumb.insertBefore(canvas, thumb.firstChild);

        thumb.addEventListener('click', (e) => {
            e.stopPropagation();
            selectOverlayPage(layerId, pageNum, thumb);
        });

        return thumb;
    }

    async function selectOverlayPage(layerId, pageNum, thumbEl) {
        // Deselect previous
        const container = document.getElementById(`overlay-pages-${layerId}`);
        container.querySelectorAll('.overlay-page-thumb').forEach(t => t.classList.remove('selected'));

        // Select new
        thumbEl.classList.add('selected');
        state.layers[layerId].selectedPage = pageNum;

        // Render full page to hidden canvas (at edit resolution)
        await renderLayerCanvasForEdit(layerId);

        // Check if both pages selected
        if (state.layers[1].selectedPage && state.layers[2].selectedPage) {
            await initializeComposite();
        }
    }

    async function renderLayerCanvas(layerId, maxSize = EDIT_MAX_SIZE) {
        const layer = state.layers[layerId];
        const page = await layer.doc.getPage(layer.selectedPage);

        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(maxSize / baseViewport.width, maxSize / baseViewport.height, maxSize / 200);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const context = canvas.getContext('2d');
        await page.render({ canvasContext: context, viewport }).promise;

        return canvas;
    }

    async function renderLayerCanvasForEdit(layerId) {
        const canvas = await renderLayerCanvas(layerId, EDIT_MAX_SIZE);
        state.layers[layerId].canvas = canvas;
    }

    async function renderHighResLayers() {
        const bottom = await renderLayerCanvas(1, OUTPUT_MAX_SIZE);
        const top = await renderLayerCanvas(2, OUTPUT_MAX_SIZE);
        return { bottom, top };
    }

    async function initializeComposite() {
        const container = document.getElementById('overlay-canvas-container');
        const placeholder = document.querySelector('.overlay-placeholder');
        const controls = document.getElementById('overlay-controls');

        // Get dimensions (use bottom layer as base)
        const bottomCanvas = state.layers[1].canvas;
        const topCanvas = state.layers[2].canvas;

        // Use the larger dimensions
        state.canvasWidth = Math.max(bottomCanvas.width, topCanvas.width);
        state.canvasHeight = Math.max(bottomCanvas.height, topCanvas.height);

        // Setup canvases
        const compositeCanvas = document.getElementById('composite-canvas');
        const maskCanvas = document.getElementById('mask-canvas');
        const bottomCanvasEl = document.getElementById('bottom-canvas');
        const topCanvasEl = document.getElementById('top-canvas');

        [compositeCanvas, maskCanvas, bottomCanvasEl, topCanvasEl].forEach(c => {
            c.width = state.canvasWidth;
            c.height = state.canvasHeight;
        });

        // Draw source layers
        const bottomCtx = bottomCanvasEl.getContext('2d');
        const topCtx = topCanvasEl.getContext('2d');

        bottomCtx.fillStyle = 'white';
        bottomCtx.fillRect(0, 0, state.canvasWidth, state.canvasHeight);
        bottomCtx.drawImage(bottomCanvas, 0, 0);

        topCtx.fillStyle = 'white';
        topCtx.fillRect(0, 0, state.canvasWidth, state.canvasHeight);
        topCtx.drawImage(topCanvas, 0, 0);

        // Initialize mask (black = show bottom, white = show top)
        // Start with all top (white)
        const maskCtx = maskCanvas.getContext('2d');
        maskCtx.fillStyle = 'white';
        maskCtx.fillRect(0, 0, state.canvasWidth, state.canvasHeight);

        // Show workspace
        placeholder.style.display = 'none';
        container.classList.add('active');
        container.style.width = state.canvasWidth + 'px';
        container.style.height = state.canvasHeight + 'px';

        // Render composite
        renderComposite();

        // Enable buttons
        document.getElementById('overlay-preview-btn').disabled = false;
        document.getElementById('overlay-download-btn').disabled = false;
    }

    function renderComposite() {
        const compositeCanvas = document.getElementById('composite-canvas');
        const maskCanvas = document.getElementById('mask-canvas');
        const bottomCanvasEl = document.getElementById('bottom-canvas');
        const topCanvasEl = document.getElementById('top-canvas');

        const ctx = compositeCanvas.getContext('2d');
        const maskCtx = maskCanvas.getContext('2d');

        const bottomData = bottomCanvasEl.getContext('2d').getImageData(0, 0, state.canvasWidth, state.canvasHeight);
        const topData = topCanvasEl.getContext('2d').getImageData(0, 0, state.canvasWidth, state.canvasHeight);
        const maskData = maskCtx.getImageData(0, 0, state.canvasWidth, state.canvasHeight);
        const outputData = ctx.createImageData(state.canvasWidth, state.canvasHeight);

        const opacity = state.previewOpacity / 100;

        for (let i = 0; i < maskData.data.length; i += 4) {
            const maskValue = maskData.data[i] / 255; // 0 = bottom, 1 = top

            // Blend based on mask and preview opacity
            // In edit mode, show a blend to help visualize
            // maskValue of 0 means show bottom, 1 means show top
            const showTop = maskValue;
            const showBottom = 1 - maskValue;

            // Apply preview opacity to make the blending visible while editing
            const topWeight = showTop * (0.5 + opacity * 0.5);
            const bottomWeight = showBottom * (0.5 + (1 - opacity) * 0.5);
            const total = topWeight + bottomWeight;

            outputData.data[i] = (bottomData.data[i] * bottomWeight + topData.data[i] * topWeight) / total;
            outputData.data[i + 1] = (bottomData.data[i + 1] * bottomWeight + topData.data[i + 1] * topWeight) / total;
            outputData.data[i + 2] = (bottomData.data[i + 2] * bottomWeight + topData.data[i + 2] * topWeight) / total;
            outputData.data[i + 3] = 255;
        }

        ctx.putImageData(outputData, 0, 0);
    }

    function setupControls() {
        const brushSizeInput = document.getElementById('brush-size');
        const brushSizeValue = document.getElementById('brush-size-value');
        const opacityInput = document.getElementById('preview-opacity');
        const opacityValue = document.getElementById('preview-opacity-value');

        brushSizeInput.addEventListener('input', e => {
            state.brushSize = parseInt(e.target.value);
            brushSizeValue.textContent = state.brushSize + 'px';
        });

        opacityInput.addEventListener('input', e => {
            state.previewOpacity = parseInt(e.target.value);
            opacityValue.textContent = state.previewOpacity + '%';
            if (state.layers[1].selectedPage && state.layers[2].selectedPage) {
                renderComposite();
            }
        });
    }

    function setupDrawing() {
        const compositeCanvas = document.getElementById('composite-canvas');

        compositeCanvas.addEventListener('mousedown', startDrawing);
        compositeCanvas.addEventListener('mousemove', draw);
        compositeCanvas.addEventListener('mouseup', stopDrawing);
        compositeCanvas.addEventListener('mouseleave', stopDrawing);

        // Touch support
        compositeCanvas.addEventListener('touchstart', e => {
            e.preventDefault();
            startDrawing(e.touches[0]);
        });
        compositeCanvas.addEventListener('touchmove', e => {
            e.preventDefault();
            draw(e.touches[0]);
        });
        compositeCanvas.addEventListener('touchend', stopDrawing);
    }

    function startDrawing(e) {
        state.isDrawing = true;
        draw(e);
    }

    function draw(e) {
        if (!state.isDrawing) return;

        const canvas = document.getElementById('composite-canvas');
        const maskCanvas = document.getElementById('mask-canvas');
        const rect = canvas.getBoundingClientRect();

        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        // Scale brush size to match canvas resolution
        const scaledBrushSize = state.brushSize * Math.max(scaleX, scaleY);

        const maskCtx = maskCanvas.getContext('2d');
        maskCtx.beginPath();
        maskCtx.arc(x, y, scaledBrushSize, 0, Math.PI * 2);
        maskCtx.fillStyle = state.brushMode === 'bottom' ? 'black' : 'white';
        maskCtx.fill();

        renderComposite();
    }

    function stopDrawing() {
        state.isDrawing = false;
    }

    function setBrushMode(mode) {
        state.brushMode = mode;
        document.getElementById('mode-bottom').classList.toggle('active', mode === 'bottom');
        document.getElementById('mode-top').classList.toggle('active', mode === 'top');
    }

    function resetMask() {
        const maskCanvas = document.getElementById('mask-canvas');
        const ctx = maskCanvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, state.canvasWidth, state.canvasHeight);
        renderComposite();
    }

    function fillBottom() {
        const maskCanvas = document.getElementById('mask-canvas');
        const ctx = maskCanvas.getContext('2d');
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, state.canvasWidth, state.canvasHeight);
        renderComposite();
    }

    function fillTop() {
        const maskCanvas = document.getElementById('mask-canvas');
        const ctx = maskCanvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, state.canvasWidth, state.canvasHeight);
        renderComposite();
    }

    function getFinalComposite() {
        const maskCanvas = document.getElementById('mask-canvas');
        const bottomCanvasEl = document.getElementById('bottom-canvas');
        const topCanvasEl = document.getElementById('top-canvas');

        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = state.canvasWidth;
        outputCanvas.height = state.canvasHeight;
        const ctx = outputCanvas.getContext('2d');

        const bottomData = bottomCanvasEl.getContext('2d').getImageData(0, 0, state.canvasWidth, state.canvasHeight);
        const topData = topCanvasEl.getContext('2d').getImageData(0, 0, state.canvasWidth, state.canvasHeight);
        const maskData = maskCanvas.getContext('2d').getImageData(0, 0, state.canvasWidth, state.canvasHeight);
        const outputData = ctx.createImageData(state.canvasWidth, state.canvasHeight);

        for (let i = 0; i < maskData.data.length; i += 4) {
            const maskValue = maskData.data[i] / 255; // 0 = bottom, 1 = top

            // Hard cut: use bottom where mask is black, top where white
            if (maskValue < 0.5) {
                outputData.data[i] = bottomData.data[i];
                outputData.data[i + 1] = bottomData.data[i + 1];
                outputData.data[i + 2] = bottomData.data[i + 2];
            } else {
                outputData.data[i] = topData.data[i];
                outputData.data[i + 1] = topData.data[i + 1];
                outputData.data[i + 2] = topData.data[i + 2];
            }
            outputData.data[i + 3] = 255;
        }

        ctx.putImageData(outputData, 0, 0);
        return outputCanvas;
    }

    async function preview() {
        const modal = document.getElementById('preview-modal');
        const modalTitle = document.getElementById('modal-title');
        const previewCanvas = document.getElementById('preview-canvas');
        const nav = document.querySelector('.modal-nav');

        modalTitle.textContent = 'Overlay Result Preview (generating high-res...)';
        nav.style.display = 'none';
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';

        // Use low-res preview initially for speed
        const lowResCanvas = getFinalComposite();
        previewCanvas.width = lowResCanvas.width;
        previewCanvas.height = lowResCanvas.height;
        previewCanvas.getContext('2d').drawImage(lowResCanvas, 0, 0);

        // Then render high-res in background
        setTimeout(async () => {
            const { bottom: hiResBottom, top: hiResTop } = await renderHighResLayers();

            const maskCanvas = document.getElementById('mask-canvas');
            const hiResMask = document.createElement('canvas');
            hiResMask.width = hiResBottom.width;
            hiResMask.height = hiResBottom.height;
            const hiResMaskCtx = hiResMask.getContext('2d');
            hiResMaskCtx.imageSmoothingEnabled = false;
            hiResMaskCtx.drawImage(maskCanvas, 0, 0, hiResMask.width, hiResMask.height);

            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = hiResBottom.width;
            finalCanvas.height = hiResBottom.height;
            const ctx = finalCanvas.getContext('2d');

            const bottomData = hiResBottom.getContext('2d').getImageData(0, 0, finalCanvas.width, finalCanvas.height);
            const topData = hiResTop.getContext('2d').getImageData(0, 0, finalCanvas.width, finalCanvas.height);
            const maskData = hiResMaskCtx.getImageData(0, 0, finalCanvas.width, finalCanvas.height);
            const outputData = ctx.createImageData(finalCanvas.width, finalCanvas.height);

            for (let i = 0; i < maskData.data.length; i += 4) {
                const maskValue = maskData.data[i] / 255;
                if (maskValue < 0.5) {
                    outputData.data[i] = bottomData.data[i];
                    outputData.data[i + 1] = bottomData.data[i + 1];
                    outputData.data[i + 2] = bottomData.data[i + 2];
                } else {
                    outputData.data[i] = topData.data[i];
                    outputData.data[i + 1] = topData.data[i + 1];
                    outputData.data[i + 2] = topData.data[i + 2];
                }
                outputData.data[i + 3] = 255;
            }
            ctx.putImageData(outputData, 0, 0);

            previewCanvas.width = finalCanvas.width;
            previewCanvas.height = finalCanvas.height;
            previewCanvas.getContext('2d').drawImage(finalCanvas, 0, 0);
            modalTitle.textContent = 'Overlay Result Preview';
        }, 50);
    }

    async function download() {
        const btn = document.getElementById('overlay-download-btn');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span>Creating PDF...</span>';

        try {
            // Render layers at high resolution
            const { bottom: hiResBottom, top: hiResTop } = await renderHighResLayers();

            // Scale up the mask to match high-res dimensions
            const maskCanvas = document.getElementById('mask-canvas');
            const hiResMask = document.createElement('canvas');
            hiResMask.width = hiResBottom.width;
            hiResMask.height = hiResBottom.height;
            const hiResMaskCtx = hiResMask.getContext('2d');
            hiResMaskCtx.imageSmoothingEnabled = false; // Keep hard edges
            hiResMaskCtx.drawImage(maskCanvas, 0, 0, hiResMask.width, hiResMask.height);

            // Composite at high resolution
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = hiResBottom.width;
            finalCanvas.height = hiResBottom.height;
            const ctx = finalCanvas.getContext('2d');

            const bottomData = hiResBottom.getContext('2d').getImageData(0, 0, finalCanvas.width, finalCanvas.height);
            const topData = hiResTop.getContext('2d').getImageData(0, 0, finalCanvas.width, finalCanvas.height);
            const maskData = hiResMaskCtx.getImageData(0, 0, finalCanvas.width, finalCanvas.height);
            const outputData = ctx.createImageData(finalCanvas.width, finalCanvas.height);

            for (let i = 0; i < maskData.data.length; i += 4) {
                const maskValue = maskData.data[i] / 255;
                if (maskValue < 0.5) {
                    outputData.data[i] = bottomData.data[i];
                    outputData.data[i + 1] = bottomData.data[i + 1];
                    outputData.data[i + 2] = bottomData.data[i + 2];
                } else {
                    outputData.data[i] = topData.data[i];
                    outputData.data[i + 1] = topData.data[i + 1];
                    outputData.data[i + 2] = topData.data[i + 2];
                }
                outputData.data[i + 3] = 255;
            }
            ctx.putImageData(outputData, 0, 0);

            // Create PDF with the composite image
            const pdfDoc = await PDFLib.PDFDocument.create();

            // Convert canvas to PNG
            const pngDataUrl = finalCanvas.toDataURL('image/png');
            const pngData = await fetch(pngDataUrl).then(r => r.arrayBuffer());
            const pngImage = await pdfDoc.embedPng(pngData);

            // Get original page dimensions from bottom layer (in PDF points)
            const bottomPage = await state.layers[1].doc.getPage(state.layers[1].selectedPage);
            const viewport = bottomPage.getViewport({ scale: 1 });
            const pageWidth = viewport.width;
            const pageHeight = viewport.height;

            // Create page with original dimensions, embed high-res image scaled to fit
            const page = pdfDoc.addPage([pageWidth, pageHeight]);
            page.drawImage(pngImage, {
                x: 0,
                y: 0,
                width: pageWidth,
                height: pageHeight
            });

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = 'overlay-result.pdf';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch (error) {
            console.error('Error creating PDF:', error);
            alert('Error creating PDF. Please try again.');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }

    // Public API
    return {
        setBrushMode,
        resetMask,
        fillBottom,
        fillTop,
        preview,
        download
    };
})();
