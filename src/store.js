// Simple reactive store using Preact hooks + manual subscribe pattern.

export const _listeners = new Set();
const _styleListeners = new Set();

function reactive(initial) {
  let val = initial;
  const obj = {
    get value() { return val; },
    set value(v) {
      if (v === val) return;
      val = v;
      _listeners.forEach(l => l());
    },
  };
  return obj;
}

// Subscribe to style changes for selected block
export function subscribeStyle(fn) {
  _styleListeners.add(fn);
  return () => _styleListeners.delete(fn);
}

function notifyStyleChange() {
  _styleListeners.forEach(fn => fn());
}

// Core state
export const currentTool = reactive('rect');
export const blocks = reactive([]);
export const selectedBlockIds = reactive([]);
export const styleMode = reactive('blur');
export const styleIntensity = reactive(3);
export const intensity = styleIntensity;
export const brushRadius = reactive(20);
export const brushHardness = reactive(80);
export const brushMode = reactive('draw'); // 'draw' | 'erase'
export const hasImage = reactive(false);

// Track subscribers (Preact components use this)
export function subscribe(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

// Track getter that re-renders on signal change
export function track(fn) {
  if (typeof window !== 'undefined' && window.__scheduler) return fn();
  return fn();
}

// ID counter
let idCounter = 0;
function generateId() {
  return 'block_' + Date.now() + '_' + idCounter++;
}

export function createBlock(type, points, bbox, extra = {}) {
  return {
    id: generateId(),
    type,
    points: points.map(p => [p[0], p[1]]),
    bbox: { x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h },
    style: styleMode.value,
    intensity: styleIntensity.value,
    brushRadius: extra.brushRadius || brushRadius.value,
    brushHardness: extra.brushHardness ?? brushHardness.value,
    mode: extra.mode ?? brushMode.value,
    visible: true,
  };
}

export function addBlocks(newBlocks) {
  const arr = Array.isArray(newBlocks) ? newBlocks : [newBlocks];
  blocks.value = [...blocks.value, ...arr];
}

export function removeBlock(id) {
  blocks.value = blocks.value.filter(b => b.id !== id);
  selectedBlockIds.value = selectedBlockIds.value.filter(x => x !== id);
}

export function clearAllBlocks() {
  blocks.value = [];
  selectedBlockIds.value = [];
}

/**
 * After image crop: translate blocks by (-left, -top), clip to new size,
 * drop blocks that no longer intersect the image.
 */
export function remapBlocksAfterCrop(left, top, newW, newH) {
  const next = [];
  for (const block of blocks.value) {
    const points = (block.points || []).map(p => {
      const x = Array.isArray(p) ? p[0] : p.x;
      const y = Array.isArray(p) ? p[1] : p.y;
      return [x - left, y - top];
    });

    if (block.type === 'rect') {
      if (points.length < 2) continue;
      const [[x1, y1], [x2, y2]] = points;
      let x = Math.min(x1, x2);
      let y = Math.min(y1, y2);
      let w = Math.abs(x2 - x1);
      let h = Math.abs(y2 - y1);
      const xMax = Math.min(x + w, newW);
      const yMax = Math.min(y + h, newH);
      x = Math.max(0, x);
      y = Math.max(0, y);
      w = xMax - x;
      h = yMax - y;
      if (w < 1 || h < 1) continue;
      next.push({
        ...block,
        points: [[x, y], [x + w, y + h]],
        bbox: { x, y, w, h },
      });
      continue;
    }

    const radius = block.type === 'brush' ? (block.brushRadius || 0) : 0;
    const kept = points.filter(([px, py]) =>
      px >= -radius && py >= -radius && px <= newW + radius && py <= newH + radius
    );
    if (block.type === 'brush' && kept.length === 0) continue;
    if (block.type === 'lasso' && kept.length < 3) continue;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [px, py] of kept) {
      minX = Math.min(minX, px - radius);
      minY = Math.min(minY, py - radius);
      maxX = Math.max(maxX, px + radius);
      maxY = Math.max(maxY, py + radius);
    }
    const bx = Math.max(0, minX);
    const by = Math.max(0, minY);
    const bx2 = Math.min(newW, maxX);
    const by2 = Math.min(newH, maxY);
    if (bx2 - bx < 1 || by2 - by < 1) continue;

    next.push({
      ...block,
      points: kept,
      bbox: { x: bx, y: by, w: bx2 - bx, h: by2 - by },
    });
  }

  blocks.value = next;
  const keep = new Set(next.map(b => b.id));
  selectedBlockIds.value = selectedBlockIds.value.filter(id => keep.has(id));
}

export function updateBlock(id, updates) {
  const block = blocks.value.find(b => b.id === id);
  blocks.value = blocks.value.map(b => (b.id === id ? { ...b, ...updates } : b));
  if (block && (updates.style || updates.intensity)) {
    notifyStyleChange();
  }
}

export function moveBlock(id, dx, dy) {
  blocks.value = blocks.value.map(b => {
    if (b.id !== id) return b;
    return {
      ...b,
      points: b.points.map(([px, py]) => [px + dx, py + dy]),
      bbox: { ...b.bbox, x: b.bbox.x + dx, y: b.bbox.y + dy },
    };
  });
}

export function duplicateBlock(id) {
  const block = blocks.value.find(b => b.id === id);
  if (!block) return null;
  const offset = 10;
  const newBlock = {
    ...block,
    id: generateId(),
    points: block.points.map(([px, py]) => [px + offset, py + offset]),
    bbox: { ...block.bbox, x: block.bbox.x + offset, y: block.bbox.y + offset },
  };
  blocks.value = [...blocks.value, newBlock];
  selectedBlockIds.value = [...selectedBlockIds.value, newBlock.id];
  return newBlock;
}

export function selectBlock(id) {
  selectedBlockIds.value = id ? [id] : [];
  notifyStyleChange();
}

export function toggleBlockSelection(id) {
  const arr = selectedBlockIds.value;
  if (arr.includes(id)) {
    selectedBlockIds.value = arr.filter(x => x !== id);
  } else {
    selectedBlockIds.value = [...arr, id];
  }
  notifyStyleChange();
}

// Z-order management
export function bringToFront(id) {
  const arr = [...blocks.value];
  const idx = arr.findIndex(b => b.id === id);
  if (idx === -1) return;
  const [block] = arr.splice(idx, 1);
  arr.push(block);
  blocks.value = arr;
}

export function sendToBack(id) {
  const arr = [...blocks.value];
  const idx = arr.findIndex(b => b.id === id);
  if (idx === -1) return;
  const [block] = arr.splice(idx, 1);
  arr.unshift(block);
  blocks.value = arr;
}

export function moveUp(id) {
  const arr = [...blocks.value];
  const idx = arr.findIndex(b => b.id === id);
  if (idx <= 0) return;
  [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
  blocks.value = arr;
}

export function moveDown(id) {
  const arr = [...blocks.value];
  const idx = arr.findIndex(b => b.id === id);
  if (idx < 0 || idx >= arr.length - 1) return;
  [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
  blocks.value = arr;
}

export function serializeBlocks() {
  return JSON.stringify(blocks.value);
}

export function restoreSnapshot(json) {
  try {
    blocks.value = JSON.parse(json);
    selectedBlockIds.value = [];
  } catch (e) {
    console.error('restoreSnapshot failed', e);
  }
}
