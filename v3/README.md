# Censorio v3 — icon UI proposal

Variant with icon toolbar and reworked sidebar. Based on v2 features.

## UI changes vs v2

1. **Top bar** — icon buttons; Undo/Redo on the left; Clear All as red trash
2. **Tools** — 2×2 icon grid with short captions
3. **Mode → Style** — mode first (draw/erase), then style+intensity only in draw mode
4. **Brush params** — shown only when Brush tool is active
5. **Blocks** — tool icon + chevron/x actions

## Run

```bash
python3 -m http.server 8080
# open http://localhost:8080/v3/
# icons preview: http://localhost:8080/v3/preview-icons.html
```
