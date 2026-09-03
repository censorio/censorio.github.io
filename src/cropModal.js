/**
 * Crop Modal — visual crop frame with 8 resize handles.
 */
import { html } from 'htm/preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from './i18n.js';

const HANDLE_SIZE = 24;
const PADDING = 40;
const MIN_SIZE = 20;

const CURSOR_MAP = {
  nw: 'nwse-resize',
  ne: 'nesw-resize',
  se: 'nwse-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  crop: 'move',
};

function clampCrop(c, imgW, imgH) {
  let { x, y, w, h } = c;
  w = Math.max(MIN_SIZE, Math.min(w, imgW));
  h = Math.max(MIN_SIZE, Math.min(h, imgH));
  x = Math.max(0, Math.min(x, imgW - w));
  y = Math.max(0, Math.min(y, imgH - h));
  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h),
  };
}

export function CropModal({ width, height, onConfirm, onCancel }) {
  const canvasRef = useRef(null);
  const [crop, setCrop] = useState(() => clampCrop({
    x: 0,
    y: 0,
    w: width,
    h: height,
  }, width, height));

  // Drag state lives in refs so mouseup never races React re-render
  const dragRef = useRef(null); // { handle, startX, startY, cropStart } | null
  const cropRef = useRef(crop);
  cropRef.current = crop;

  const canvasWidth = width + PADDING * 2;
  const canvasHeight = height + PADDING * 2;

  function getHandles(c) {
    return {
      nw: { x: c.x + PADDING, y: c.y + PADDING },
      n: { x: c.x + c.w / 2 + PADDING, y: c.y + PADDING },
      ne: { x: c.x + c.w + PADDING, y: c.y + PADDING },
      e: { x: c.x + c.w + PADDING, y: c.y + c.h / 2 + PADDING },
      se: { x: c.x + c.w + PADDING, y: c.y + c.h + PADDING },
      s: { x: c.x + c.w / 2 + PADDING, y: c.y + c.h + PADDING },
      sw: { x: c.x + PADDING, y: c.y + c.h + PADDING },
      w: { x: c.x + PADDING, y: c.y + c.h / 2 + PADDING },
    };
  }

  function canvasPos(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function getHandleAt(x, y, c = cropRef.current) {
    const handles = getHandles(c);
    for (const [name, h] of Object.entries(handles)) {
      if (
        x >= h.x - HANDLE_SIZE / 2 &&
        x <= h.x + HANDLE_SIZE / 2 &&
        y >= h.y - HANDLE_SIZE / 2 &&
        y <= h.y + HANDLE_SIZE / 2
      ) {
        return name;
      }
    }
    return null;
  }

  function hitCropBody(x, y, c = cropRef.current) {
    const cx = c.x + PADDING;
    const cy = c.y + PADDING;
    return x >= cx && x <= cx + c.w && y >= cy && y <= cy + c.h;
  }

  function applyDrag(x, y) {
    const drag = dragRef.current;
    if (!drag) return;

    const { handle, startX, startY, cropStart } = drag;
    const dx = x - startX;
    const dy = y - startY;
    let next = { ...cropStart };

    if (handle === 'crop') {
      next.x = cropStart.x + dx;
      next.y = cropStart.y + dy;
    } else {
      switch (handle) {
        case 'nw':
          next.x = cropStart.x + dx;
          next.y = cropStart.y + dy;
          next.w = cropStart.w - dx;
          next.h = cropStart.h - dy;
          break;
        case 'n':
          next.y = cropStart.y + dy;
          next.h = cropStart.h - dy;
          break;
        case 'ne':
          next.y = cropStart.y + dy;
          next.w = cropStart.w + dx;
          next.h = cropStart.h - dy;
          break;
        case 'e':
          next.w = cropStart.w + dx;
          break;
        case 'se':
          next.w = cropStart.w + dx;
          next.h = cropStart.h + dy;
          break;
        case 's':
          next.h = cropStart.h + dy;
          break;
        case 'sw':
          next.x = cropStart.x + dx;
          next.w = cropStart.w - dx;
          next.h = cropStart.h + dy;
          break;
        case 'w':
          next.x = cropStart.x + dx;
          next.w = cropStart.w - dx;
          break;
        default:
          break;
      }

      // Keep opposite edge fixed when shrinking past min
      if (next.w < MIN_SIZE) {
        if (handle.includes('w')) next.x = cropStart.x + cropStart.w - MIN_SIZE;
        next.w = MIN_SIZE;
      }
      if (next.h < MIN_SIZE) {
        if (handle.includes('n')) next.y = cropStart.y + cropStart.h - MIN_SIZE;
        next.h = MIN_SIZE;
      }
    }

    setCrop(clampCrop(next, width, height));
  }

  function endDrag() {
    if (!dragRef.current) return;
    dragRef.current = null;
    window.removeEventListener('mousemove', onWinMove);
    window.removeEventListener('mouseup', onWinUp);
    window.removeEventListener('touchmove', onWinMove);
    window.removeEventListener('touchend', onWinUp);
    window.removeEventListener('touchcancel', onWinUp);
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = 'default';
  }

  function onWinMove(e) {
    if (!dragRef.current) return;
    e.preventDefault();
    const { x, y } = canvasPos(e);
    applyDrag(x, y);
  }

  function onWinUp(e) {
    if (e) e.preventDefault();
    endDrag();
  }

  function startDrag(handle, x, y) {
    endDrag(); // ensure clean state
    dragRef.current = {
      handle,
      startX: x,
      startY: y,
      cropStart: { ...cropRef.current },
    };
    window.addEventListener('mousemove', onWinMove);
    window.addEventListener('mouseup', onWinUp);
    window.addEventListener('touchmove', onWinMove, { passive: false });
    window.addEventListener('touchend', onWinUp);
    window.addEventListener('touchcancel', onWinUp);
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = CURSOR_MAP[handle] || 'default';
  }

  function onPointerDown(e) {
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = canvasPos(e);
    const handle = getHandleAt(x, y);
    if (handle) {
      startDrag(handle, x, y);
      return;
    }
    if (hitCropBody(x, y)) {
      startDrag('crop', x, y);
    }
  }

  function onPointerMoveHover(e) {
    if (dragRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = canvasPos(e);
    const handle = getHandleAt(x, y);
    if (handle) canvas.style.cursor = CURSOR_MAP[handle];
    else if (hitCropBody(x, y)) canvas.style.cursor = 'move';
    else canvas.style.cursor = 'default';
  }

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const sourceImg = window.__canvasManager?.getSourceImage();

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    if (sourceImg) {
      ctx.drawImage(sourceImg, PADDING, PADDING, width, height);
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(PADDING, PADDING, width, crop.y);
    ctx.fillRect(PADDING, crop.y + crop.h + PADDING, width, height - crop.y - crop.h);
    ctx.fillRect(PADDING, crop.y + PADDING, crop.x, crop.h);
    ctx.fillRect(crop.x + crop.w + PADDING, crop.y + PADDING, width - crop.x - crop.w, crop.h);

    ctx.strokeStyle = '#4a90d9';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(crop.x + PADDING, crop.y + PADDING, crop.w, crop.h);
    ctx.setLineDash([]);

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#4a90d9';
    ctx.lineWidth = 1;
    for (const h of Object.values(getHandles(crop))) {
      ctx.fillRect(h.x - HANDLE_SIZE / 2, h.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
      ctx.strokeRect(h.x - HANDLE_SIZE / 2, h.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
    }
  }, [crop, width, height, canvasWidth, canvasHeight]);

  // Cleanup listeners if modal unmounts mid-drag
  useEffect(() => () => endDrag(), []);

  const top = crop.y;
  const bottom = height - crop.y - crop.h;
  const left = crop.x;
  const right = width - crop.x - crop.w;

  return html`
    <div
      class="modal-backdrop"
      onMouseDown=${e => {
        // Only close when press starts on the dimmed area — not on mouseup after a drag
        if (e.target === e.currentTarget && !dragRef.current) onCancel();
      }}
    >
      <div class="modal crop-modal" onMouseDown=${e => e.stopPropagation()} onClick=${e => e.stopPropagation()}>
        <h2>${t('cropTitle')}</h2>
        <p class="modal-info">${t('cropOriginal')}: ${width} x ${height} px | ${t('cropNew')}: ${Math.round(crop.w)} x ${Math.round(crop.h)} px</p>

        <div class="crop-canvas-container">
          <canvas
            ref=${canvasRef}
            onMouseDown=${onPointerDown}
            onMouseMove=${onPointerMoveHover}
            onTouchStart=${onPointerDown}
          />
        </div>

        <div class="crop-inputs">
          <label>
            <span>${t('cropTop')}</span>
            <input type="number" min="0" max=${height - 1} value=${top}
              onInput=${e => {
                const val = Math.max(0, Math.min(+e.target.value || 0, height - bottom - MIN_SIZE));
                setCrop(c => clampCrop({ ...c, y: val, h: height - val - bottom }, width, height));
              }} />
          </label>
          <label>
            <span>${t('cropBottom')}</span>
            <input type="number" min="0" max=${height - 1} value=${bottom}
              onInput=${e => {
                const val = Math.max(0, Math.min(+e.target.value || 0, height - top - MIN_SIZE));
                setCrop(c => clampCrop({ ...c, h: height - top - val }, width, height));
              }} />
          </label>
          <label>
            <span>${t('cropLeft')}</span>
            <input type="number" min="0" max=${width - 1} value=${left}
              onInput=${e => {
                const val = Math.max(0, Math.min(+e.target.value || 0, width - right - MIN_SIZE));
                setCrop(c => clampCrop({ ...c, x: val, w: width - val - right }, width, height));
              }} />
          </label>
          <label>
            <span>${t('cropRight')}</span>
            <input type="number" min="0" max=${width - 1} value=${right}
              onInput=${e => {
                const val = Math.max(0, Math.min(+e.target.value || 0, width - left - MIN_SIZE));
                setCrop(c => clampCrop({ ...c, w: width - left - val }, width, height));
              }} />
          </label>
        </div>

        <div class="modal-actions">
          <button type="button" onClick=${() => { endDrag(); onCancel(); }}>${t('cancel')}</button>
          <button type="button" class="accent" onClick=${() => {
            endDrag();
            onConfirm({ top, bottom, left, right });
          }}>${t('apply')}</button>
        </div>
      </div>
    </div>
  `;
}
