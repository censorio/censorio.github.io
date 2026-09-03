import { history } from '../history.js';
import { t } from '../i18n.js';
import { showAlert } from '../dialog.js';
import {
  addBlocks, blocks, brushHardness, brushMode, brushRadius,
  bringToFront, createBlock, duplicateBlock,
  intensity, remapBlocksAfterCrop, removeBlock,
  selectBlock, selectedBlockIds,
  sendToBack,
  moveBlock as storeMoveBlock,
  styleMode
} from '../store.js';
import { copyCanvasToClipboard, readImageFromClipboard } from '../utils/clipboard.js';
import { createEffectRegion } from '../utils/effects.js';

/**
 * CanvasManager — orchestrates canvas rendering, mouse tools, and keyboard input.
 * @param {HTMLCanvasElement} canvasEl
 */
export function createCanvasManager(canvasEl) {
  const ctx = canvasEl.getContext('2d');

  let sourceImage = null;
  let cursorListener = null;

  const sourceCanvas = document.createElement('canvas');
  const sourceCtx = sourceCanvas.getContext('2d');

  // Effect layer cache: full-image (brush live) + region keys (block render)
  const effectLayerCache = new Map();
  const EFFECT_CACHE_MAX = 16;

  // Reusable temp canvas (downsample / misc)
  let tempCanvas = document.createElement('canvas');
  let tempCtx = tempCanvas.getContext('2d');

  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragBlockId = null;
  let dragToolData = null;
  let dragRectPreview = null;
  let brushPoints = [];
  let isBrushDrawing = false;

  const HANDLE_SIZE = 8;
  let resizeHandle = null;
  let resizeStartBbox = null;
  let resizeStartX = 0;
  let resizeStartY = 0;

  let contextMenuEl = null;

  function loadImage(img, { preserveBlocks = false } = {}) {
    sourceImage = img;
    if (!preserveBlocks) {
      blocks.value = [];
      selectedBlockIds.value = [];
      history.undoStack.length = 0;
      history.redoStack.length = 0;
    }
    fitToContainer();
  }

  function clearImage() {
    sourceImage = null;
    effectLayerCache.clear();
    blocks.value = [];
    selectedBlockIds.value = [];
    history.undoStack.length = 0;
    history.redoStack.length = 0;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    canvasEl.width = 0;
    canvasEl.height = 0;
    canvasEl.style.width = '';
    canvasEl.style.height = '';
  }

  function fitToContainer() {
    if (!sourceImage) return;
    const area = canvasEl.closest('.canvas-area') || canvasEl.parentElement;
    if (!area) return;
    const maxW = area.clientWidth - 40;
    const maxH = area.clientHeight - 40;
    const imgW = sourceImage.naturalWidth || sourceImage.width;
    const imgH = sourceImage.naturalHeight || sourceImage.height;

    let scale = 1;
    if (imgW > maxW || imgH > maxH) {
      scale = Math.min(maxW / imgW, maxH / imgH);
    }

    canvasEl.width = imgW;
    canvasEl.height = imgH;
    canvasEl.style.width = `${Math.round(imgW * scale)}px`;
    canvasEl.style.height = `${Math.round(imgH * scale)}px`;

    sourceCanvas.width = imgW;
    sourceCanvas.height = imgH;
    sourceCtx.drawImage(sourceImage, 0, 0, imgW, imgH);
    effectLayerCache.clear();
    ensureEffectLayer(styleMode.value, intensity.value);
    render();
  }

  /** Full-image effect cache — same createEffectRegion as rect (full res). */
  function ensureEffectLayer(style, intens) {
    if (!sourceImage) return null;
    const w = canvasEl.width;
    const h = canvasEl.height;
    if (w <= 0 || h <= 0) return null;
    const key = `full:${style}:${intens}:${w}x${h}`;
    const cached = effectLayerCache.get(key);
    if (cached) return cached;

    const layer = document.createElement('canvas');
    layer.width = w;
    layer.height = h;
    const layerCtx = layer.getContext('2d');
    const eff = createEffectRegion(sourceImage, { x: 0, y: 0, w, h }, style, intens);
    layerCtx.drawImage(eff, 0, 0);

    cacheEffect(key, layer);
    return layer;
  }

  /** Region effect — used for block render (avoids full-image blur on intensity change). */
  function ensureRegionEffect(style, intens, x, y, w, h) {
    if (!sourceImage || w <= 0 || h <= 0) return null;
    const ix = Math.max(0, Math.floor(x));
    const iy = Math.max(0, Math.floor(y));
    const iw = Math.max(1, Math.ceil(w));
    const ih = Math.max(1, Math.ceil(h));
    const key = `r:${style}:${intens}:${ix}:${iy}:${iw}x${ih}`;
    const cached = effectLayerCache.get(key);
    if (cached) return cached;

    const canvas = createEffectRegion(sourceImage, { x: ix, y: iy, w: iw, h: ih }, style, intens);
    const entry = { canvas, x: ix, y: iy };
    cacheEffect(key, entry);
    return entry;
  }

  function cacheEffect(key, value) {
    if (effectLayerCache.size >= EFFECT_CACHE_MAX) {
      const oldest = effectLayerCache.keys().next().value;
      effectLayerCache.delete(oldest);
    }
    effectLayerCache.set(key, value);
  }

  /** Blur kernel spill — pad region so edge blur matches full-image quality. */
  function blurPad(style) {
    if (style !== 'blur') return 0;
    return 40;
  }

  function render() {
    if (!sourceImage) return;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.drawImage(sourceImage, 0, 0);
    for (const block of blocks.value) {
      if (!block.visible) continue;
      renderBlock(block);
    }
    renderOverlays();
  }

  function renderBlock(block) {
    const { bbox, points, type } = block;
    const bRadius = block.brushRadius || brushRadius.value || 20;
    const erase = block.mode === 'erase';

    if (type === 'rect') {
      const [[x1, y1], [x2, y2]] = points;
      const x = Math.min(x1, x2), y = Math.min(y1, y2);
      const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
      if (w <= 0 || h <= 0) return;
      if (erase) {
        ctx.drawImage(sourceImage, x, y, w, h, x, y, w, h);
      } else {
        const pad = blurPad(block.style);
        const rx = Math.max(0, x - pad);
        const ry = Math.max(0, y - pad);
        const rw = Math.min(canvasEl.width - rx, w + (x - rx) + pad);
        const rh = Math.min(canvasEl.height - ry, h + (y - ry) + pad);
        const region = ensureRegionEffect(block.style, block.intensity, rx, ry, rw, rh);
        if (!region) return;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.drawImage(region.canvas, region.x, region.y);
        ctx.restore();
      }
    } else if (type === 'brush') {
      if (!points || points.length === 0) return;

      ctx.save();
      ctx.beginPath();
      for (const pt of points) {
        const [px, py] = Array.isArray(pt) ? pt : [pt.x, pt.y];
        ctx.moveTo(px + bRadius, py);
        ctx.arc(px, py, bRadius, 0, Math.PI * 2);
      }
      ctx.clip();

      if (erase) {
        ctx.drawImage(sourceImage, 0, 0);
      } else if (bbox && bbox.w > 0 && bbox.h > 0) {
        const pad = blurPad(block.style);
        const rx = Math.max(0, Math.floor(bbox.x - pad));
        const ry = Math.max(0, Math.floor(bbox.y - pad));
        const rw = Math.min(canvasEl.width - rx, Math.ceil(bbox.w + (bbox.x - rx) + pad));
        const rh = Math.min(canvasEl.height - ry, Math.ceil(bbox.h + (bbox.y - ry) + pad));
        const region = ensureRegionEffect(block.style, block.intensity, rx, ry, rw, rh);
        if (region) ctx.drawImage(region.canvas, region.x, region.y);
      } else {
        const layer = ensureEffectLayer(block.style, block.intensity);
        if (layer) ctx.drawImage(layer, 0, 0);
      }
      ctx.restore();
    } else if (type === 'lasso') {
      if (!points?.length) return;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
      ctx.closePath();
      ctx.clip();
      if (erase) {
        ctx.drawImage(sourceImage, 0, 0);
      } else if (bbox && bbox.w > 0 && bbox.h > 0) {
        const pad = blurPad(block.style);
        const rx = Math.max(0, Math.floor(bbox.x - pad));
        const ry = Math.max(0, Math.floor(bbox.y - pad));
        const rw = Math.min(canvasEl.width - rx, Math.ceil(bbox.w + (bbox.x - rx) + pad));
        const rh = Math.min(canvasEl.height - ry, Math.ceil(bbox.h + (bbox.y - ry) + pad));
        const region = ensureRegionEffect(block.style, block.intensity, rx, ry, rw, rh);
        if (region) ctx.drawImage(region.canvas, region.x, region.y);
      } else {
        const layer = ensureEffectLayer(block.style, block.intensity);
        if (layer) ctx.drawImage(layer, 0, 0);
      }
      ctx.restore();
    }
  }

  function ensureTempCanvas(w, h) {
    if (tempCanvas.width !== w || tempCanvas.height !== h) {
      tempCanvas.width = w;
      tempCanvas.height = h;
    }
  }

  function getResizeHandles(bbox) {
    const { x, y, w, h } = bbox;
    const hs = HANDLE_SIZE / 2;
    return {
      nw: { x: x - hs, y: y - hs, w: HANDLE_SIZE, h: HANDLE_SIZE },
      n: { x: x + w / 2 - hs, y: y - hs, w: HANDLE_SIZE, h: HANDLE_SIZE },
      ne: { x: x + w - hs, y: y - hs, w: HANDLE_SIZE, h: HANDLE_SIZE },
      e: { x: x + w - hs, y: y + h / 2 - hs, w: HANDLE_SIZE, h: HANDLE_SIZE },
      se: { x: x + w - hs, y: y + h - hs, w: HANDLE_SIZE, h: HANDLE_SIZE },
      s: { x: x + w / 2 - hs, y: y + h - hs, w: HANDLE_SIZE, h: HANDLE_SIZE },
      sw: { x: x - hs, y: y + h - hs, w: HANDLE_SIZE, h: HANDLE_SIZE },
      w: { x: x - hs, y: y + h / 2 - hs, w: HANDLE_SIZE, h: HANDLE_SIZE },
    };
  }

  function hitTestHandle(x, y, bbox) {
    const handles = getResizeHandles(bbox);
    for (const [name, h] of Object.entries(handles)) {
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return name;
    }
    return null;
  }

  function renderOverlays() {
    for (const id of selectedBlockIds.value) {
      const b = blocks.value.find(b2 => b2.id === id);
      if (!b) continue;
      ctx.save();
      ctx.strokeStyle = '#4a90d9';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(b.bbox.x - 2, b.bbox.y - 2, b.bbox.w + 4, b.bbox.h + 4);
      ctx.setLineDash([]);
      if (b.type === 'rect') {
        const handles = getResizeHandles(b.bbox);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#4a90d9';
        ctx.lineWidth = 1;
        for (const h of Object.values(handles)) {
          ctx.fillRect(h.x, h.y, h.w, h.h);
          ctx.strokeRect(h.x, h.y, h.w, h.h);
        }
      }
      ctx.restore();
    }
  }

  function pointInPolygon(px, py, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function hitTestBlock(x, y) {
    for (let i = blocks.value.length - 1; i >= 0; i--) {
      const b = blocks.value[i];
      if (!b.visible) continue;
      if (b.type === 'lasso') {
        if (pointInPolygon(x, y, b.points)) return b.id;
        continue;
      }
      if (b.type === 'brush') {
        const r = b.brushRadius || brushRadius.value || 20;
        for (const [px, py] of b.points) {
          const dx = x - px, dy = y - py;
          if (dx * dx + dy * dy <= r * r) return b.id;
        }
        continue;
      }
      if (x >= b.bbox.x && x <= b.bbox.x + b.bbox.w && y >= b.bbox.y && y <= b.bbox.y + b.bbox.h) return b.id;
    }
    return null;
  }

  function getPos(e) {
    const r = canvasEl.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    let px = (clientX - r.left) * (canvasEl.width / r.width);
    let py = (clientY - r.top) * (canvasEl.height / r.height);
    px = Math.max(0, Math.min(px, canvasEl.width));
    py = Math.max(0, Math.min(py, canvasEl.height));
    return { x: px, y: py };
  }

  function onDown(e) {
    if (!sourceImage) return;
    const p = getPos(e);
    const tool = window.__currentTool || 'rect';
    if (tool === 'select') {
      if (selectedBlockIds.value.length === 1) {
        const selBlock = blocks.value.find(b => b.id === selectedBlockIds.value[0]);
        if (selBlock && selBlock.type === 'rect') {
          const handle = hitTestHandle(p.x, p.y, selBlock.bbox);
          if (handle) {
            resizeHandle = handle; resizeStartX = p.x; resizeStartY = p.y;
            resizeStartBbox = { ...selBlock.bbox }; isDragging = true;
            return;
          }
        }
      }
      const hit = hitTestBlock(p.x, p.y);
      if (hit) {
        if (e.shiftKey) {
          const ids = selectedBlockIds.value;
          if (ids.includes(hit)) selectedBlockIds.value = ids.filter(x => x !== hit);
          else selectedBlockIds.value = [...ids, hit];
        } else if (!selectedBlockIds.value.includes(hit) || selectedBlockIds.value.length <= 1) {
          selectBlock(hit);
        }
        history.snapshot();
        if (e.altKey) {
          const dup = duplicateBlock(hit);
          if (dup) {
            selectBlock(dup.id);
            dragBlockId = dup.id;
          } else {
            dragBlockId = hit;
          }
        } else {
          dragBlockId = hit;
        }
        isDragging = true; dragStartX = p.x; dragStartY = p.y;
        render();
      } else { selectBlock(null); render(); }
    } else if (tool === 'rect') {
      if (selectedBlockIds.value.length === 1) {
        const selBlock = blocks.value.find(b => b.id === selectedBlockIds.value[0]);
        if (selBlock && selBlock.type === 'rect') {
          const handle = hitTestHandle(p.x, p.y, selBlock.bbox);
          if (handle) {
            history.snapshot();
            resizeHandle = handle; resizeStartX = p.x; resizeStartY = p.y;
            resizeStartBbox = { ...selBlock.bbox }; isDragging = true;
            dragBlockId = selectedBlockIds.value[0];
            return;
          }
        }
      }
      history.snapshot(); selectBlock(null);
      dragRectPreview = { x: Math.round(p.x), y: Math.round(p.y), w: 0, h: 0 };
      isDragging = true;
    } else if (tool === 'brush') {
      history.snapshot(); selectBlock(null);
      ensureEffectLayer(styleMode.value, intensity.value);
      render();
      brushPoints = [{ x: p.x, y: p.y }];
      isBrushDrawing = true; isDragging = true;
      stampBrushPoint(p.x, p.y);
    } else if (tool === 'lasso') {
      history.snapshot(); selectBlock(null);
      dragToolData = [[Math.round(p.x), Math.round(p.y)]];
      isDragging = true;
    }
  }

  function onMove(e) {
    if (!isDragging || !sourceImage) return;
    const p = getPos(e);
    const tool = window.__currentTool || 'rect';

    if (tool === 'select' && resizeHandle && resizeStartBbox) {
      const dx = p.x - resizeStartX, dy = p.y - resizeStartY;
      const bbox = { ...resizeStartBbox };
      const minSize = 10;
      switch (resizeHandle) {
        case 'nw': bbox.x = Math.min(bbox.x + dx, bbox.x + bbox.w - minSize); bbox.y = Math.min(bbox.y + dy, bbox.y + bbox.h - minSize); bbox.w = Math.max(minSize, bbox.w - dx); bbox.h = Math.max(minSize, bbox.h - dy); break;
        case 'n': bbox.y = Math.min(bbox.y + dy, bbox.y + bbox.h - minSize); bbox.h = Math.max(minSize, bbox.h - dy); break;
        case 'ne': bbox.y = Math.min(bbox.y + dy, bbox.y + bbox.h - minSize); bbox.w = Math.max(minSize, bbox.w + dx); bbox.h = Math.max(minSize, bbox.h - dy); break;
        case 'e': bbox.w = Math.max(minSize, bbox.w + dx); break;
        case 'se': bbox.w = Math.max(minSize, bbox.w + dx); bbox.h = Math.max(minSize, bbox.h + dy); break;
        case 's': bbox.h = Math.max(minSize, bbox.h + dy); break;
        case 'sw': bbox.x = Math.min(bbox.x + dx, bbox.x + bbox.w - minSize); bbox.w = Math.max(minSize, bbox.w - dx); bbox.h = Math.max(minSize, bbox.h + dy); break;
        case 'w': bbox.x = Math.min(bbox.x + dx, bbox.x + bbox.w - minSize); bbox.w = Math.max(minSize, bbox.w - dx); break;
      }
      const block = blocks.value.find(b => b.id === selectedBlockIds.value[0]);
      if (block) { block.bbox = bbox; if (block.type === 'rect') block.points = [[bbox.x, bbox.y], [bbox.x + bbox.w, bbox.y + bbox.h]]; render(); }
    } else if (tool === 'select' && dragBlockId) {
      const dx = p.x - dragStartX, dy = p.y - dragStartY;
      const ids = selectedBlockIds.value.includes(dragBlockId)
        ? selectedBlockIds.value
        : [dragBlockId];
      for (const id of ids) storeMoveBlock(id, dx, dy);
      dragStartX = p.x; dragStartY = p.y; render();
    } else if (tool === 'rect' && resizeHandle && resizeStartBbox) {
      const bbox = { ...resizeStartBbox };
      const dx = p.x - resizeStartX, dy = p.y - resizeStartY, minSize = 10;
      switch (resizeHandle) {
        case 'nw': bbox.x = Math.min(bbox.x + dx, bbox.x + bbox.w - minSize); bbox.y = Math.min(bbox.y + dy, bbox.y + bbox.h - minSize); bbox.w = Math.max(minSize, bbox.w - dx); bbox.h = Math.max(minSize, bbox.h - dy); break;
        case 'n': bbox.y = Math.min(bbox.y + dy, bbox.y + bbox.h - minSize); bbox.h = Math.max(minSize, bbox.h - dy); break;
        case 'ne': bbox.y = Math.min(bbox.y + dy, bbox.y + bbox.h - minSize); bbox.w = Math.max(minSize, bbox.w + dx); bbox.h = Math.max(minSize, bbox.h - dy); break;
        case 'e': bbox.w = Math.max(minSize, bbox.w + dx); break;
        case 'se': bbox.w = Math.max(minSize, bbox.w + dx); bbox.h = Math.max(minSize, bbox.h + dy); break;
        case 's': bbox.h = Math.max(minSize, bbox.h + dy); break;
        case 'sw': bbox.x = Math.min(bbox.x + dx, bbox.x + bbox.w - minSize); bbox.w = Math.max(minSize, bbox.w - dx); bbox.h = Math.max(minSize, bbox.h + dy); break;
        case 'w': bbox.x = Math.min(bbox.x + dx, bbox.x + bbox.w - minSize); bbox.w = Math.max(minSize, bbox.w - dx); break;
      }
      const block = blocks.value.find(b => b.id === dragBlockId);
      if (block) { block.bbox = bbox; if (block.type === 'rect') block.points = [[bbox.x, bbox.y], [bbox.x + bbox.w, bbox.y + bbox.h]]; render(); }
    } else if (tool === 'rect' && dragRectPreview) {
      let dx = p.x - dragRectPreview.x, dy = p.y - dragRectPreview.y;
      if (e.shiftKey) { const size = Math.max(Math.abs(dx), Math.abs(dy)); dx = (dx >= 0 ? 1 : -1) * size; dy = (dy >= 0 ? 1 : -1) * size; }
      dragRectPreview.w = dx; dragRectPreview.h = dy;
      ctx.drawImage(sourceImage, 0, 0);
      for (const block of blocks.value) { if (!block.visible) continue; renderBlock(block); }
      // Live erase preview: restore original inside pending rect
      if (brushMode.value === 'erase') {
        const rx = Math.min(dragRectPreview.x, dragRectPreview.x + dragRectPreview.w);
        const ry = Math.min(dragRectPreview.y, dragRectPreview.y + dragRectPreview.h);
        const rw = Math.abs(dragRectPreview.w);
        const rh = Math.abs(dragRectPreview.h);
        if (rw > 0 && rh > 0) ctx.drawImage(sourceImage, rx, ry, rw, rh, rx, ry, rw, rh);
      }
      drawToolPreview();
    } else if (tool === 'brush' && isBrushDrawing) {
      const prev = brushPoints[brushPoints.length - 1];
      const dist = Math.hypot(p.x - prev.x, p.y - prev.y);
      const step = Math.max(1, brushRadius.value * 0.35);
      if (dist >= step) {
        const n = Math.ceil(dist / step);
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          const x = prev.x + (p.x - prev.x) * t;
          const y = prev.y + (p.y - prev.y) * t;
          brushPoints.push({ x, y });
          stampBrushPoint(x, y);
        }
      } else {
        brushPoints.push({ x: p.x, y: p.y });
        stampBrushPoint(p.x, p.y);
      }
    } else if (tool === 'lasso' && dragToolData) {
      dragToolData.push([Math.round(p.x), Math.round(p.y)]);
      ctx.drawImage(sourceImage, 0, 0);
      for (const block of blocks.value) { if (!block.visible) continue; renderBlock(block); }
      if (brushMode.value === 'erase' && dragToolData.length > 2) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(dragToolData[0][0], dragToolData[0][1]);
        for (let i = 1; i < dragToolData.length; i++) ctx.lineTo(dragToolData[i][0], dragToolData[i][1]);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(sourceImage, 0, 0);
        ctx.restore();
      }
      drawToolPreview();
    }
  }

  function onUp() {
    if (!isDragging) return;
    isDragging = false;
    const tool = window.__currentTool || 'rect';

    if (tool === 'select' && resizeHandle) { resizeHandle = null; resizeStartBbox = null; }
    else if (tool === 'rect' && resizeHandle && dragBlockId) { resizeHandle = null; resizeStartBbox = null; dragBlockId = null; }
    else if (tool === 'rect' && dragRectPreview) {
      const { x, y, w, h } = dragRectPreview;
      if (Math.abs(w) > 2 && Math.abs(h) > 2) {
        const px = Math.round(Math.max(0, Math.min(x, x + w)));
        const py = Math.round(Math.max(0, Math.min(y, y + h)));
        const pw = Math.round(Math.min(Math.abs(w), canvasEl.width - px));
        const ph = Math.round(Math.min(Math.abs(h), canvasEl.height - py));
        if (pw > 0 && ph > 0) {
          addBlocks(createBlock('rect', [[px, py], [px + pw, py + ph]], { x: px, y: py, w: pw, h: ph }, { mode: brushMode.value }));
        }
      }
      dragRectPreview = null; render();
    } else if (tool === 'brush' && isBrushDrawing) {
      isBrushDrawing = false;
      if (brushPoints.length >= 1) {
        const r = brushRadius.value;
        const xs = brushPoints.map(pt => pt.x), ys = brushPoints.map(pt => pt.y);
        const x0 = Math.max(0, Math.min(...xs) - r);
        const y0 = Math.max(0, Math.min(...ys) - r);
        const x1 = Math.min(canvasEl.width, Math.max(...xs) + r);
        const y1 = Math.min(canvasEl.height, Math.max(...ys) + r);
        const bbox = { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
        const points = brushPoints.map(pt => [pt.x, pt.y]);
        addBlocks(createBlock('brush', points, bbox, { brushRadius: r, brushHardness: brushHardness.value, mode: brushMode.value }));
      }
      brushPoints = [];
      render();
    } else if (tool === 'lasso' && dragToolData && dragToolData.length >= 2) {
      const xs = dragToolData.map(p => p[0]), ys = dragToolData.map(p => p[1]);
      addBlocks(createBlock(tool, dragToolData, {
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
      }, { mode: brushMode.value }));
      dragToolData = null; render();
    }
    dragBlockId = null;
  }

  function drawToolPreview() {
    const erase = brushMode.value === 'erase';
    const stroke = erase ? '#dc3545' : '#4a90d9';
    ctx.save();
    if (dragRectPreview) {
      const { x, y, w, h } = dragRectPreview;
      ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
    }
    if (dragToolData && dragToolData.length > 1) {
      ctx.strokeStyle = stroke; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(dragToolData[0][0], dragToolData[0][1]);
      for (let i = 1; i < dragToolData.length; i++) ctx.lineTo(dragToolData[i][0], dragToolData[i][1]);
      if ((window.__currentTool || '') === 'lasso') ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Stamp one brush dab from precomputed effectLayer (fast clip + drawImage). */
  function stampBrushPoint(x, y) {
    const r = brushRadius.value;
    const erase = brushMode.value === 'erase';
    const layer = erase ? sourceImage : ensureEffectLayer(styleMode.value, intensity.value);
    if (!layer) return;

    const sx = Math.max(0, Math.floor(x - r));
    const sy = Math.max(0, Math.floor(y - r));
    const ex = Math.min(canvasEl.width, Math.ceil(x + r));
    const ey = Math.min(canvasEl.height, Math.ceil(y + r));
    const tw = ex - sx;
    const th = ey - sy;
    if (tw <= 0 || th <= 0) return;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(layer, sx, sy, tw, th, sx, sy, tw, th);
    ctx.restore();
  }

  function drawBrushLivePreview(x, y) {
    const r = brushRadius.value;
    const erase = brushMode.value === 'erase';
    const layer = erase ? sourceImage : ensureEffectLayer(styleMode.value, intensity.value);
    if (layer) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalAlpha = 0.75;
      const sx = Math.max(0, Math.floor(x - r));
      const sy = Math.max(0, Math.floor(y - r));
      const ex = Math.min(canvasEl.width, Math.ceil(x + r));
      const ey = Math.min(canvasEl.height, Math.ceil(y + r));
      const tw = ex - sx, th = ey - sy;
      if (tw > 0 && th > 0) ctx.drawImage(layer, sx, sy, tw, th, sx, sy, tw, th);
      ctx.restore();
    }
    const color = erase ? '#dc3545' : '#4a90d9';
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function onKeyDown(e) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      if (selectedBlockIds.value.length === 0) return;
      if (e.target !== document.body && e.target.tagName !== 'CANVAS') return;
      e.preventDefault(); history.snapshot();
      const step = e.shiftKey ? 10 : 1;
      let dx = 0, dy = 0;
      if (e.key === 'ArrowLeft') dx = -step;
      if (e.key === 'ArrowRight') dx = step;
      if (e.key === 'ArrowUp') dy = -step;
      if (e.key === 'ArrowDown') dy = step;
      for (const id of selectedBlockIds.value) storeMoveBlock(id, dx, dy);
      render(); return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBlockIds.value.length > 0) {
      history.snapshot();
      for (const id of [...selectedBlockIds.value]) removeBlock(id);
      selectedBlockIds.value = []; render();
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') { e.preventDefault(); if (history.canRedo()) { history.redo(); render(); } }
    else if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); if (history.canUndo()) { history.undo(); render(); } }
    else if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); if (history.canRedo()) { history.redo(); render(); } }
    else if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); if (selectedBlockIds.value.length > 0) { history.snapshot(); for (const id of [...selectedBlockIds.value]) { duplicateBlock(id); } render(); } }
  }

  function undo() { if (history.canUndo()) { history.undo(); render(); } }
  function redo() { if (history.canRedo()) { history.redo(); render(); } }

  function cropImage(left, top, right, bottom) {
    if (!sourceImage || !canvasEl) return Promise.resolve();
    const w = canvasEl.width, h = canvasEl.height;
    const newW = Math.max(1, w - left - right);
    const newH = Math.max(1, h - top - bottom);
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = newW; tmpCanvas.height = newH;
    const tmpCtx = tmpCanvas.getContext('2d');
    tmpCtx.drawImage(sourceImage, left, top, newW, newH, 0, 0, newW, newH);
    return new Promise((resolve, reject) => {
      const newImg = new Image();
      newImg.onload = () => {
        remapBlocksAfterCrop(left, top, newW, newH);
        loadImage(newImg, { preserveBlocks: true });
        resolve();
      };
      newImg.onerror = reject;
      newImg.src = tmpCanvas.toDataURL();
    });
  }

  function hideContextMenu() {
    if (contextMenuEl) contextMenuEl.style.display = 'none';
  }

  function showContextMenu(clientX, clientY) {
    if (!contextMenuEl) {
      contextMenuEl = document.createElement('div');
      contextMenuEl.className = 'context-menu';
      document.body.appendChild(contextMenuEl);
    }
    const ids = [...selectedBlockIds.value];
    contextMenuEl.innerHTML = '';
    const items = [
      {
        label: t('ctxDelete'),
        action: () => {
          if (ids.length === 0) return;
          history.snapshot();
          for (const id of ids) removeBlock(id);
          selectedBlockIds.value = [];
          render();
        },
      },
      {
        label: t('ctxDuplicate'),
        action: () => {
          if (ids.length === 0) return;
          history.snapshot();
          const newIds = [];
          for (const id of ids) {
            const dup = duplicateBlock(id);
            if (dup) newIds.push(dup.id);
          }
          selectedBlockIds.value = newIds;
          render();
        },
      },
      {
        label: t('ctxBringToFront'),
        action: () => {
          if (ids.length === 0) return;
          history.snapshot();
          for (const id of ids) bringToFront(id);
          render();
        },
      },
      {
        label: t('ctxSendToBack'),
        action: () => {
          if (ids.length === 0) return;
          history.snapshot();
          for (const id of ids) sendToBack(id);
          render();
        },
      },
    ];
    for (const item of items) {
      const el = document.createElement('div');
      el.className = 'context-menu-item';
      el.textContent = item.label;
      el.onclick = (ev) => { ev.stopPropagation(); item.action(); hideContextMenu(); };
      contextMenuEl.appendChild(el);
    }
    contextMenuEl.style.left = `${clientX}px`;
    contextMenuEl.style.top = `${clientY}px`;
    contextMenuEl.style.display = 'block';
  }

  function onContextMenu(e) {
    e.preventDefault();
    if (!sourceImage) return;
    const p = getPos(e);
    const hit = hitTestBlock(p.x, p.y);
    if (hit) {
      if (!selectedBlockIds.value.includes(hit)) selectBlock(hit);
      render();
      showContextMenu(e.clientX, e.clientY);
    } else {
      hideContextMenu();
    }
  }

  function reportCursor(e) {
    if (!cursorListener || !sourceImage) return;
    const p = getPos(e);
    cursorListener(Math.round(p.x), Math.round(p.y));
  }

  canvasEl.addEventListener('mousedown', onDown);
  canvasEl.addEventListener('mousemove', onMove);
  canvasEl.addEventListener('mouseup', onUp);
  canvasEl.addEventListener('mouseleave', onUp);

  canvasEl.addEventListener('touchstart', (e) => { e.preventDefault(); onDown(e); }, { passive: false });
  canvasEl.addEventListener('touchmove', (e) => { e.preventDefault(); onMove(e); }, { passive: false });
  canvasEl.addEventListener('touchend', (e) => { onUp(e); });

  canvasEl.addEventListener('mousemove', onCanvasMove);
  canvasEl.addEventListener('mousemove', reportCursor);
  canvasEl.addEventListener('mouseleave', onCanvasLeave);
  canvasEl.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('paste', onPaste);
  window.addEventListener('copy', onCopy);
  window.addEventListener('click', hideContextMenu);

  let brushCursorX = null;
  let brushCursorY = null;

  function onCanvasMove(e) {
    const tool = window.__currentTool || 'rect';
    if (tool !== 'brush') return;
    // Don't wipe the live stroke — onMove stamps onto the canvas
    if (isBrushDrawing) return;
    const p = getPos(e);
    brushCursorX = p.x; brushCursorY = p.y;
    ctx.drawImage(sourceImage, 0, 0);
    for (const block of blocks.value) { if (!block.visible) continue; renderBlock(block); }
    renderOverlays();
    drawBrushLivePreview(p.x, p.y);
  }

  function onCanvasLeave() {
    brushCursorX = null; brushCursorY = null;
    if (cursorListener) cursorListener(null, null);
  }

  async function onPaste(e) {
    if (!sourceImage) return;
    e.preventDefault();
    const img = await readImageFromClipboard();
    if (!img) { await showAlert(t('alertNoClipboardImage')); return; }
    window.__currentTool = window.__currentTool || 'rect';
    loadImage(img);
  }

  function onCopy(e) {
    if (!sourceImage) return;
    const activeEl = document.activeElement;
    const isCanvasFocused = activeEl === canvasEl || activeEl?.closest('.canvas-area');
    if (!isCanvasFocused) return;
    e.preventDefault();
    const savedRect = dragRectPreview; const savedLasso = dragToolData;
    const savedDrawing = isBrushDrawing;
    dragRectPreview = null; dragToolData = null; isBrushDrawing = false; brushPoints = [];

    // Clean copy without overlays — same effect layers as on-screen render
    sourceCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
    sourceCtx.drawImage(sourceImage, 0, 0);
    for (const block of blocks.value) {
      if (!block.visible) continue;
      const { bbox, points, type } = block;
      const bRadius = block.brushRadius || brushRadius.value || 20;
      const erase = block.mode === 'erase';
      const layer = erase ? null : ensureEffectLayer(block.style, block.intensity);

      sourceCtx.save();
      if (type === 'rect') {
        const r = bbox;
        sourceCtx.beginPath();
        sourceCtx.rect(r.x, r.y, r.w, r.h);
        sourceCtx.clip();
        if (erase) sourceCtx.drawImage(sourceImage, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
        else if (layer) sourceCtx.drawImage(layer, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
      } else if (type === 'brush') {
        sourceCtx.beginPath();
        for (const pt of points) {
          const [px, py] = Array.isArray(pt) ? pt : [pt.x, pt.y];
          sourceCtx.moveTo(px + bRadius, py);
          sourceCtx.arc(px, py, bRadius, 0, Math.PI * 2);
        }
        sourceCtx.clip();
        if (erase) sourceCtx.drawImage(sourceImage, 0, 0);
        else if (layer) sourceCtx.drawImage(layer, 0, 0);
      } else if (points?.length) {
        sourceCtx.beginPath();
        sourceCtx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) sourceCtx.lineTo(points[i][0], points[i][1]);
        sourceCtx.closePath();
        sourceCtx.clip();
        if (erase) sourceCtx.drawImage(sourceImage, 0, 0);
        else if (layer) sourceCtx.drawImage(layer, bbox.x, bbox.y, bbox.w, bbox.h, bbox.x, bbox.y, bbox.w, bbox.h);
      }
      sourceCtx.restore();
    }
    copyCanvasToClipboard(sourceCanvas);
    dragRectPreview = savedRect; dragToolData = savedLasso; isBrushDrawing = savedDrawing; brushPoints = [];
  }

  let resizeTimeout;
  const onResize = () => { clearTimeout(resizeTimeout); resizeTimeout = setTimeout(fitToContainer, 100); };
  window.addEventListener('resize', onResize);

  return {
    loadImage,
    clearImage,
    render,
    undo,
    redo,
    cropImage,
    getCanvas: () => canvasEl,
    getSourceImage: () => sourceImage,
    fitToContainer,
    setCursorListener: (fn) => { cursorListener = fn; },
    destroy: () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('click', hideContextMenu);
      hideContextMenu();
      if (contextMenuEl) contextMenuEl.remove();
    },
  };
}
