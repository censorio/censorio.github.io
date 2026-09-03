# Censorio — Redact Sensitive Information on Images

A simple client-side web app for redacting sensitive areas of images. No build step required, no frameworks beyond Preact + HTM (loaded from CDN via import maps).

## Features

- **Load images** from file or paste from clipboard
- **Three redaction tools**: Rect, Brush, Lasso
- **Two styles**: Blur and Pixelate, with intensity control
- **Each stroke / box is a separate block** — drag to move, click to select, press Del to delete
- **Undo / Redo** with full history of all actions
- **Crop** from any side (top / bottom / left / right)
- **Download as PNG** or **Copy to clipboard**
- Clean, spacious UI

## Run

Open `index.html` in a browser, or serve the directory:

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy to GitHub Pages

Push to `main` branch and enable GitHub Pages → root. Done.

## Project Structure

```
blur/
├── index.html              # Entry point with import map
├── styles/main.css         # All styles
├── src/
│   ├── app.js              # Root Preact component
│   ├── store.js            # Reactive state (simple signals)
│   ├── history.js          # Undo/Redo manager
│   ├── hooks.js            # useStoreVersion hook
│   ├── cropModal.js        # Crop dialog component
│   ├── canvas/
│   │   └── CanvasManager.js  # Canvas rendering + mouse/keyboard handling
│   └── utils/
│       ├── effects.js      # Blur & pixelate implementation
│       ├── fileLoader.js   # Load image from File
│       ├── clipboard.js    # Read/write clipboard images
│       └── download.js     # Save canvas as PNG
└── plans/plan.md           # Architecture documentation
```

## Keyboard Shortcuts

- **Ctrl+Z** / **Cmd+Z** — Undo
- **Ctrl+Y** / **Cmd+Y** — Redo
- **Delete** / **Backspace** — Remove selected block

## Dependencies (loaded via CDN, no install needed)

- Preact 10
- HTM 3
- Preact Hooks

## How It Works

The app maintains a list of `RedactionBlock` objects, each with a path (points), bounding box, style, and intensity. The CanvasManager renders the source image, then iterates over all blocks, applying blur or pixelate effects in clip regions.

Undo/Redo stores JSON snapshots of the blocks array on each change.
