# Censorio — Redact Sensitive Information on Images

A client-side web app for redacting sensitive areas of images. No build step required, no frameworks beyond Preact + HTM (loaded from CDN via import maps). All processing happens locally — no data is ever uploaded.

## Features

- **Load images** from file, paste from clipboard, or drag & drop onto the canvas
- **Four tools**: Rect, Brush, Lasso, and Select (move/resize blocks)
- **Two redaction styles**: Blur and Pixelate, with intensity control (1–5)
- **Draw / Erase mode**: apply or remove redaction with any tool
- **Each stroke / box is a separate block** — drag to move, click to select, press Del to delete
- **Resize handles** for rectangular blocks (8-point control)
- **Block z-order** management — move blocks up/down, bring to front, send to back
- **Context menu** (right-click) — duplicate, delete, reorder selected blocks
- **Undo / Redo** with full history of all actions
- **Crop** image with visual frame and 8 resize handles
- **Download as PNG** or **Copy to clipboard** (Ctrl+C on canvas)
- **Session restore** — image and blocks are persisted in localStorage
- **Dark / Light theme** toggle
- **EN / RU** interface language switch
- **About modal** with app intro on first visit
- **Keyboard block nudging** with arrow keys (Shift = 10px step)

## Run Locally

Open `index.html` directly in a browser, or serve the directory:

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy to GitHub Pages

Push to `main` branch and enable GitHub Pages → root. Done.

## Project Structure

```
├── index.html                # Entry point with import map + inline theme/lang bootstrap
├── styles/main.css           # All styles (light + dark via CSS custom properties)
├── assets/
│   ├── preview.png           # Preview for About modal
│   ├── favicon.ico           # Favicon
│   └── icons/                # SVG toolbar icons
├── src/
│   ├── app.js                # Root Preact component (toolbar, sidebar, canvas host)
│   ├── store.js              # Reactive state via simple signals + block CRUD + z-order
│   ├── history.js            # Undo/Redo manager (JSON snapshots of blocks array)
│   ├── hooks.js              # useStoreVersion — re-render Preact components on state change
│   ├── i18n.js               # EN/RU translations, localStorage persistence
│   ├── aboutModal.js         # About / intro modal ("don't show again" preference)
│   ├── cropModal.js          # Visual crop modal with 8 resize handles
│   ├── dialog.js             # Alert / Confirm dialog host (promise-based API)
│   ├── canvas/
│   │   └── CanvasManager.js   # Canvas rendering, mouse/touch tools, keyboard, clipboard, context menu
│   └── utils/
│       ├── effects.js        # Blur (multi-pass) & pixelate (downscale) implementation
│       ├── fileLoader.js     # Load image from File object
│       ├── clipboard.js      # Read/write clipboard images (async Clipboard API)
│       └── download.js       # Save canvas as PNG via Blob
```

## Keyboard Shortcuts

| Shortcut                                | Action                           |
| --------------------------------------- | -------------------------------- |
| **Ctrl+Z** / **Cmd+Z**                  | Undo                             |
| **Ctrl+Shift+Z** / **Cmd+Shift+Z**      | Redo                             |
| **Ctrl+Y** / **Cmd+Y**                  | Redo (alternative)               |
| **Ctrl+D** / **Cmd+D**                  | Duplicate selected block(s)      |
| **Ctrl+C** / **Cmd+C** (canvas focused) | Copy redacted image to clipboard |
| **Delete** / **Backspace**              | Remove selected block(s)         |
| **← ↑ → ↓**                             | Nudge selected block(s) by 1px   |
| **Shift + ← ↑ → ↓**                     | Nudge selected block(s) by 10px  |
| **Escape**                              | Close dialog / deselect          |

## Dependencies (loaded via CDN, no install needed)

- Preact 10.24
- HTM 3.1
- Preact Hooks

## How It Works

The app maintains a reactive list of block objects (`blocks`), each with a path (points), bounding box, style, intensity, brush radius/hardness, and mode (draw/erase). The [`CanvasManager`](src/canvas/CanvasManager.js) renders the source image to a full-resolution canvas, then iterates over all blocks top-to-bottom, applying blur or pixelate effects using clip regions. Erase-mode blocks restore the original image pixels within their clip area.

Undo/Redo is handled by [`history.js`](src/history.js), which stores JSON snapshots of the entire blocks array before each mutation. Effect results are cached per region to avoid recomputation on every render.

Interface language (EN/RU) and theme (dark/light) preferences are persisted in `localStorage`. The current session (image + blocks) is also saved to `localStorage` and restored automatically on page reload.
