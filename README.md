# PDF Toolbox

A local web app with tools for working with PDF files.

## Tools

### Page Merger
Select and merge pages from two PDFs into one document.

- **Drag & drop** or click to upload PDFs
- **Thumbnail previews** of each page
- **Click to select** pages (adds to output queue)
- **Select/deselect all** buttons per PDF
- **Reorder pages** by dragging in the output queue
- **Remove from queue** by clicking the × button
- **Preview** the merged document before downloading
- **Download** merged PDF with selected pages in your chosen order

### Page Overlay
Combine portions of two PDF pages into one by painting a mask.

- Upload two PDFs and select one page from each
- **Bottom layer** and **Top layer** controls
- **Paint to reveal** portions of either layer
- Adjustable **brush size**
- **Preview opacity** slider to help visualize while editing
- **Reset/Fill** buttons for quick mask changes
- **Preview** and **Download** the composited result

## Running Locally

### Option A: Python (built-in on Mac/Linux)

```bash
cd /path/to/pdf-toolbox
python3 -m http.server 8000
```

Then open http://localhost:8000 in your browser.

### Option B: Node.js

```bash
cd /path/to/pdf-toolbox
npx serve
```

Then open the URL shown in the terminal.

## Dependencies

All dependencies are loaded via CDN (no installation required):

- **[PDF.js](https://mozilla.github.io/pdf.js/)** - Renders PDF page thumbnails
- **[pdf-lib](https://pdf-lib.js.org/)** - Handles PDF creation and page extraction

## Browser Support

Works in all modern browsers (Chrome, Firefox, Safari, Edge).
