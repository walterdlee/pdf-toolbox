# PDF Toolbox

A local web app that lets you select pages from two PDFs and merge them into a single downloadable PDF.

## Features

- **Drag & drop** or click to upload PDFs
- **Thumbnail previews** of each page
- **Click to select** pages (adds to output queue)
- **Select/deselect all** buttons per PDF
- **Reorder pages** by dragging in the output queue
- **Remove from queue** by clicking the × button
- **Download** merged PDF with selected pages in your chosen order

## Running Locally

### Option A: Python (built-in on Mac/Linux)

```bash
cd /path/to/PdfMaker
python3 -m http.server 8000
```

Then open http://localhost:8000 in your browser.

### Option B: Node.js

```bash
cd /path/to/PdfMaker
npx serve
```

Then open the URL shown in the terminal.

## Usage

1. Open the app in your browser
2. Drop or click to upload up to two PDFs
3. Click on page thumbnails to select them (they'll appear in the output queue)
4. Drag pages in the output queue to reorder them
5. Click the × on queue items to remove them
6. Click "Download Merged PDF" to get your combined document

## Dependencies

All dependencies are loaded via CDN (no installation required):

- **[PDF.js](https://mozilla.github.io/pdf.js/)** - Renders PDF page thumbnails
- **[pdf-lib](https://pdf-lib.js.org/)** - Handles PDF merging and page extraction

## Browser Support

Works in all modern browsers (Chrome, Firefox, Safari, Edge).
