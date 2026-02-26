// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// State
const state = {
    pdfs: {
        1: { file: null, doc: null, pages: [], name: '' },
        2: { file: null, doc: null, pages: [], name: '' }
    },
    outputQueue: [], // Array of { pdfId, pageNum, canvas }
    preview: {
        pages: [], // Array of { pdfId, pageNum } for current preview
        currentIndex: 0
    }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupDropZone(1);
    setupDropZone(2);
});

// Setup drop zone for a PDF slot
function setupDropZone(pdfId) {
    const dropZone = document.getElementById(`drop-zone-${pdfId}`);
    const fileInput = document.getElementById(`file-input-${pdfId}`);

    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, e => {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    // Highlight on drag
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'));
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'));
    });

    // Handle drop
    dropZone.addEventListener('drop', e => {
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'application/pdf') {
            loadPdf(pdfId, file);
        }
    });

    // Handle file input
    fileInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (file) {
            loadPdf(pdfId, file);
        }
    });

    // Only open file picker when clicking on the prompt area, not on page thumbnails
    dropZone.addEventListener('click', e => {
        if (!e.target.closest('.page-thumb')) {
            fileInput.click();
        }
    });
}

// Load a PDF file
async function loadPdf(pdfId, file) {
    const dropZone = document.getElementById(`drop-zone-${pdfId}`);
    const pageGrid = document.getElementById(`page-grid-${pdfId}`);
    const nameEl = document.getElementById(`pdf${pdfId}-name`);

    // Clear previous pages from output queue
    clearSelection(pdfId);

    // Update state
    state.pdfs[pdfId].file = file;
    state.pdfs[pdfId].name = file.name;
    state.pdfs[pdfId].pages = [];

    // Update UI
    nameEl.textContent = `PDF ${pdfId}: ${file.name}`;
    dropZone.classList.add('has-pages');
    pageGrid.innerHTML = '<div class="loading">Loading PDF</div>';

    try {
        // Load PDF with PDF.js
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        state.pdfs[pdfId].doc = pdf;

        // Clear loading
        pageGrid.innerHTML = '';

        // Render thumbnails
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const thumb = await renderPageThumbnail(page, pdfId, i);
            pageGrid.appendChild(thumb);
            state.pdfs[pdfId].pages.push({ pageNum: i, selected: false });
        }
    } catch (error) {
        console.error('Error loading PDF:', error);
        pageGrid.innerHTML = '<div class="loading" style="color: #cc0000;">Error loading PDF</div>';
    }
}

// Render a single page thumbnail
async function renderPageThumbnail(page, pdfId, pageNum) {
    const scale = 150 / page.getViewport({ scale: 1 }).width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const context = canvas.getContext('2d');
    await page.render({ canvasContext: context, viewport }).promise;

    // Create thumbnail container
    const thumb = document.createElement('div');
    thumb.className = 'page-thumb';
    thumb.dataset.pdfId = pdfId;
    thumb.dataset.pageNum = pageNum;

    thumb.innerHTML = `
        <div class="page-check">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"/>
            </svg>
        </div>
        <div class="page-number">Page ${pageNum}</div>
    `;
    thumb.insertBefore(canvas, thumb.firstChild);

    // Click handler - left click to select, double click to preview
    thumb.addEventListener('click', () => togglePageSelection(pdfId, pageNum, thumb, canvas));
    thumb.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        previewSinglePage(pdfId, pageNum);
    });

    return thumb;
}

// Toggle page selection
function togglePageSelection(pdfId, pageNum, thumbEl, canvas) {
    const pageState = state.pdfs[pdfId].pages.find(p => p.pageNum === pageNum);

    if (pageState.selected) {
        // Deselect
        pageState.selected = false;
        thumbEl.classList.remove('selected');
        removeFromQueue(pdfId, pageNum);
    } else {
        // Select
        pageState.selected = true;
        thumbEl.classList.add('selected');
        addToQueue(pdfId, pageNum, canvas);
    }

    updateDownloadButton();
}

// Add page to output queue
function addToQueue(pdfId, pageNum, sourceCanvas) {
    const queue = document.getElementById('output-queue');

    // Remove empty message if present
    const emptyMsg = queue.querySelector('.queue-empty');
    if (emptyMsg) emptyMsg.remove();

    // Clone canvas for queue
    const canvas = document.createElement('canvas');
    canvas.width = sourceCanvas.width;
    canvas.height = sourceCanvas.height;
    canvas.getContext('2d').drawImage(sourceCanvas, 0, 0);

    // Create queue item
    const item = document.createElement('div');
    item.className = 'queue-item';
    item.draggable = true;
    item.dataset.pdfId = pdfId;
    item.dataset.pageNum = pageNum;

    item.innerHTML = `
        <button class="queue-item-remove" title="Remove">&times;</button>
        <div class="queue-item-label">${pdfId}:P${pageNum}</div>
    `;
    item.insertBefore(canvas, item.firstChild);

    // Remove button handler
    item.querySelector('.queue-item-remove').addEventListener('click', e => {
        e.stopPropagation();
        // Deselect in source grid
        const thumb = document.querySelector(`.page-thumb[data-pdf-id="${pdfId}"][data-page-num="${pageNum}"]`);
        if (thumb) {
            const pageState = state.pdfs[pdfId].pages.find(p => p.pageNum === pageNum);
            if (pageState) pageState.selected = false;
            thumb.classList.remove('selected');
        }
        removeFromQueue(pdfId, pageNum);
        updateDownloadButton();
    });

    // Double-click to preview
    item.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        previewSinglePage(pdfId, pageNum);
    });

    // Drag handlers
    item.addEventListener('dragstart', e => {
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });

    item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        updateQueueState();
    });

    item.addEventListener('dragover', e => {
        e.preventDefault();
        const dragging = queue.querySelector('.dragging');
        if (dragging && dragging !== item) {
            const rect = item.getBoundingClientRect();
            const midX = rect.left + rect.width / 2;
            if (e.clientX < midX) {
                queue.insertBefore(dragging, item);
            } else {
                queue.insertBefore(dragging, item.nextSibling);
            }
        }
    });

    queue.appendChild(item);
    state.outputQueue.push({ pdfId, pageNum });
}

// Remove page from output queue
function removeFromQueue(pdfId, pageNum) {
    const queue = document.getElementById('output-queue');
    const item = queue.querySelector(`.queue-item[data-pdf-id="${pdfId}"][data-page-num="${pageNum}"]`);
    if (item) item.remove();

    // Update state
    state.outputQueue = state.outputQueue.filter(
        p => !(p.pdfId === pdfId && p.pageNum === pageNum)
    );

    // Show empty message if queue is empty
    if (state.outputQueue.length === 0) {
        queue.innerHTML = '<div class="queue-empty">Selected pages will appear here</div>';
    }
}

// Update queue state after drag reorder
function updateQueueState() {
    const queue = document.getElementById('output-queue');
    const items = queue.querySelectorAll('.queue-item');
    state.outputQueue = Array.from(items).map(item => ({
        pdfId: parseInt(item.dataset.pdfId),
        pageNum: parseInt(item.dataset.pageNum)
    }));
}

// Select all pages for a PDF
function selectAll(pdfId) {
    const pages = state.pdfs[pdfId].pages;
    if (pages.length === 0) return;

    pages.forEach(page => {
        if (!page.selected) {
            const thumb = document.querySelector(`.page-thumb[data-pdf-id="${pdfId}"][data-page-num="${page.pageNum}"]`);
            if (thumb) {
                const canvas = thumb.querySelector('canvas');
                page.selected = true;
                thumb.classList.add('selected');
                addToQueue(pdfId, page.pageNum, canvas);
            }
        }
    });

    updateDownloadButton();
}

// Clear selection for a PDF
function clearSelection(pdfId) {
    const pages = state.pdfs[pdfId].pages;

    pages.forEach(page => {
        if (page.selected) {
            page.selected = false;
            const thumb = document.querySelector(`.page-thumb[data-pdf-id="${pdfId}"][data-page-num="${page.pageNum}"]`);
            if (thumb) thumb.classList.remove('selected');
            removeFromQueue(pdfId, page.pageNum);
        }
    });

    updateDownloadButton();
}

// Update download button state
function updateDownloadButton() {
    const downloadBtn = document.getElementById('download-btn');
    const previewBtn = document.getElementById('preview-btn');
    const isEmpty = state.outputQueue.length === 0;
    downloadBtn.disabled = isEmpty;
    previewBtn.disabled = isEmpty;
}

// Download merged PDF
async function downloadMergedPdf() {
    if (state.outputQueue.length === 0) return;

    const btn = document.getElementById('download-btn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span>Creating PDF...</span>';

    try {
        // Create new PDF document
        const mergedPdf = await PDFLib.PDFDocument.create();

        // Load source PDFs with pdf-lib
        const pdfDocs = {};
        for (const pdfId of [1, 2]) {
            if (state.pdfs[pdfId].file) {
                const arrayBuffer = await state.pdfs[pdfId].file.arrayBuffer();
                pdfDocs[pdfId] = await PDFLib.PDFDocument.load(arrayBuffer);
            }
        }

        // Copy pages in queue order
        for (const { pdfId, pageNum } of state.outputQueue) {
            const srcDoc = pdfDocs[pdfId];
            if (srcDoc) {
                const [copiedPage] = await mergedPdf.copyPages(srcDoc, [pageNum - 1]);
                mergedPdf.addPage(copiedPage);
            }
        }

        // Save and download
        const pdfBytes = await mergedPdf.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'merged.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

    } catch (error) {
        console.error('Error creating merged PDF:', error);
        alert('Error creating merged PDF. Please try again.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
        updateDownloadButton();
    }
}

// Preview a single page (double-click on thumbnail)
async function previewSinglePage(pdfId, pageNum) {
    state.preview.pages = [{ pdfId, pageNum }];
    state.preview.currentIndex = 0;
    await openPreview(`PDF ${pdfId} - Page ${pageNum}`);
}

// Preview the entire merged document
async function previewMergedPdf() {
    if (state.outputQueue.length === 0) return;
    state.preview.pages = [...state.outputQueue];
    state.preview.currentIndex = 0;
    await openPreview('Merged PDF Preview');
}

// Open preview modal and render current page
async function openPreview(title) {
    const modal = document.getElementById('preview-modal');
    const modalTitle = document.getElementById('modal-title');

    modalTitle.textContent = title;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    await renderPreviewPage();
    updatePreviewNav();
}

// Close preview modal
function closePreview() {
    const modal = document.getElementById('preview-modal');
    modal.classList.remove('open');
    document.body.style.overflow = '';
}

// Render the current preview page at full size
async function renderPreviewPage() {
    const { pdfId, pageNum } = state.preview.pages[state.preview.currentIndex];
    const canvas = document.getElementById('preview-canvas');
    const context = canvas.getContext('2d');

    const pdfDoc = state.pdfs[pdfId].doc;
    if (!pdfDoc) return;

    const page = await pdfDoc.getPage(pageNum);

    // Calculate scale to fit in viewport while maintaining quality
    const viewport = page.getViewport({ scale: 1 });
    const maxWidth = window.innerWidth * 0.85 - 48;
    const maxHeight = window.innerHeight * 0.85 - 100;

    const scaleX = maxWidth / viewport.width;
    const scaleY = maxHeight / viewport.height;
    const scale = Math.min(scaleX, scaleY, 2); // Cap at 2x for quality

    const scaledViewport = page.getViewport({ scale });

    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;

    await page.render({
        canvasContext: context,
        viewport: scaledViewport
    }).promise;
}

// Update navigation buttons and indicator
function updatePreviewNav() {
    const prevBtn = document.getElementById('prev-page-btn');
    const nextBtn = document.getElementById('next-page-btn');
    const indicator = document.getElementById('page-indicator');

    const current = state.preview.currentIndex + 1;
    const total = state.preview.pages.length;

    indicator.textContent = `${current} / ${total}`;
    prevBtn.disabled = current === 1;
    nextBtn.disabled = current === total;

    // Hide nav for single page
    const nav = document.querySelector('.modal-nav');
    nav.style.display = total === 1 ? 'none' : 'flex';
}

// Navigate to previous page
async function prevPreviewPage() {
    if (state.preview.currentIndex > 0) {
        state.preview.currentIndex--;
        await renderPreviewPage();
        updatePreviewNav();
    }
}

// Navigate to next page
async function nextPreviewPage() {
    if (state.preview.currentIndex < state.preview.pages.length - 1) {
        state.preview.currentIndex++;
        await renderPreviewPage();
        updatePreviewNav();
    }
}

// Keyboard navigation for preview
document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('preview-modal');
    if (!modal.classList.contains('open')) return;

    switch (e.key) {
        case 'Escape':
            closePreview();
            break;
        case 'ArrowLeft':
            prevPreviewPage();
            break;
        case 'ArrowRight':
            nextPreviewPage();
            break;
    }
});
