/**
 * Apply blur or pixelate effect to a region of the source image.
 *
 * Intensity 1–5; level 3 is the comfortable default for redaction.
 *
 * Transparent PNGs need special handling: CSS blur / downscale treat
 * fully transparent pixels as black (0,0,0,0), which creates dark fringes.
 * We bleed opaque colors into transparent neighbors, run the effect on an
 * opaque buffer, then reapply alpha processed with the same effect so edges
 * are actually redacted (not left as a sharp unblurred silhouette).
 *
 * @param {HTMLCanvasElement|HTMLImageElement} source - source canvas or image
 * @param {{x:number,y:number,w:number,h:number}} region - bounding box to effect
 * @param {'blur'|'pixelate'} style
 * @param {number} intensity - 1-5 (higher = stronger effect)
 * @returns {HTMLCanvasElement}
 */

/** @type {Record<number, { passes: number, px: number }>} */
const BLUR_STEPS = {
  1: { passes: 1, px: 5 },
  2: { passes: 1, px: 8 },
  3: { passes: 2, px: 6 },  // default — comfortable redact
  4: { passes: 2, px: 9 },
  5: { passes: 2, px: 12 },
};

/** @type {Record<number, number>} pixelate downscale factor */
const PIXEL_STEPS = {
  1: 8,
  2: 12,
  3: 18,  // default — clearly redacted
  4: 26,
  5: 36,
};

function clampIntensity(intensity) {
  const n = intensity | 0;
  return Math.max(1, Math.min(5, n || 3));
}

/**
 * Save alpha, spread opaque RGB into transparent pixels, force opaque.
 * @returns {Uint8ClampedArray|null} per-pixel alpha, or null if fully opaque
 */
function prepareTransparentForFilter(ctx, w, h, bleedRadius) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const pixelCount = w * h;
  const alpha = new Uint8ClampedArray(pixelCount);
  let hasTransparency = false;

  for (let p = 0, i = 0; p < pixelCount; p++, i += 4) {
    const a = data[i + 3];
    alpha[p] = a;
    if (a < 255) hasTransparency = true;
  }
  if (!hasTransparency) return null;

  const radius = Math.max(1, Math.min(48, bleedRadius | 0));

  // Snapshot used as the source for offset fills (destination-over).
  const snap = document.createElement('canvas');
  snap.width = w;
  snap.height = h;
  snap.getContext('2d').putImageData(imageData, 0, 0);

  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  for (let r = 1; r <= radius; r++) {
    // 8-connected ring; colors propagate outward with each radius step.
    const offsets = [
      [r, 0], [-r, 0], [0, r], [0, -r],
      [r, r], [r, -r], [-r, r], [-r, -r],
    ];
    for (const [dx, dy] of offsets) {
      ctx.drawImage(snap, dx, dy);
    }
  }
  ctx.restore();

  // Force opaque so the filter cannot reintroduce black-from-zero-alpha.
  const opaque = ctx.getImageData(0, 0, w, h);
  const od = opaque.data;
  for (let i = 3; i < od.length; i += 4) od[i] = 255;
  ctx.putImageData(opaque, 0, 0);

  return alpha;
}

/** Grayscale canvas from saved alpha (R=G=B=alpha, A=255). */
function alphaToCanvas(alpha, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let p = 0, i = 0; p < alpha.length; p++, i += 4) {
    const a = alpha[p];
    d[i] = a;
    d[i + 1] = a;
    d[i + 2] = a;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function applyAlphaFromGrayscale(ctx, w, h, grayCanvas) {
  const rgb = ctx.getImageData(0, 0, w, h);
  const aData = grayCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  for (let i = 0; i < rgb.data.length; i += 4) {
    rgb.data[i + 3] = aData[i];
  }
  ctx.putImageData(rgb, 0, 0);
}

/** Blur alpha with the same kernel as RGB so silhouette edges are redacted too. */
function restoreBlurredAlpha(ctx, w, h, alpha, blurAmount, passes) {
  if (!alpha) return;

  const aCanvas = alphaToCanvas(alpha, w, h);
  const buf = document.createElement('canvas');
  buf.width = w;
  buf.height = h;
  const aCtx = aCanvas.getContext('2d');
  const bufCtx = buf.getContext('2d');
  let src = aCanvas;
  let dst = buf;

  for (let i = 0; i < passes; i++) {
    const dstCtx = dst === buf ? bufCtx : aCtx;
    dstCtx.clearRect(0, 0, w, h);
    dstCtx.filter = `blur(${blurAmount}px)`;
    dstCtx.drawImage(src, 0, 0);
    dstCtx.filter = 'none';
    const tmp = src;
    src = dst;
    dst = tmp;
  }

  if (src !== aCanvas) {
    aCtx.clearRect(0, 0, w, h);
    aCtx.drawImage(src, 0, 0);
  }

  applyAlphaFromGrayscale(ctx, w, h, aCanvas);
}

/**
 * Pixelate alpha on the same grid as RGB.
 * Uses max-alpha per cell so edge blocks stay visible (average would
 * fade mostly-transparent edge cells back to "unaffected").
 */
function restorePixelatedAlpha(ctx, w, h, alpha, factor) {
  if (!alpha) return;

  const smallW = Math.max(1, Math.floor(w / factor));
  const smallH = Math.max(1, Math.floor(h / factor));
  const cellW = w / smallW;
  const cellH = h / smallH;
  const cellMax = new Uint8Array(smallW * smallH);

  for (let y = 0; y < h; y++) {
    const cy = Math.min(smallH - 1, (y / cellH) | 0);
    for (let x = 0; x < w; x++) {
      const cx = Math.min(smallW - 1, (x / cellW) | 0);
      const a = alpha[y * w + x];
      const ci = cy * smallW + cx;
      if (a > cellMax[ci]) cellMax[ci] = a;
    }
  }

  const rgb = ctx.getImageData(0, 0, w, h);
  const data = rgb.data;
  for (let y = 0; y < h; y++) {
    const cy = Math.min(smallH - 1, (y / cellH) | 0);
    for (let x = 0; x < w; x++) {
      const cx = Math.min(smallW - 1, (x / cellW) | 0);
      data[((y * w + x) * 4) + 3] = cellMax[cy * smallW + cx];
    }
  }
  ctx.putImageData(rgb, 0, 0);
}

export function createEffectRegion(source, region, style, intensity) {
  const w = Math.max(1, Math.ceil(region.w));
  const h = Math.max(1, Math.ceil(region.h));
  const offCanvas = document.createElement('canvas');
  offCanvas.width = w;
  offCanvas.height = h;
  const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });

  offCtx.drawImage(
    source,
    region.x, region.y, region.w, region.h,
    0, 0, w, h
  );

  const level = clampIntensity(intensity);

  if (style === 'blur') {
    const { passes, px: blurAmount } = BLUR_STEPS[level];
    // Cover CSS blur kernel support so edges don't sample unfilled black.
    const bleedRadius = Math.ceil(blurAmount * 2) + passes;
    const savedAlpha = prepareTransparentForFilter(offCtx, w, h, bleedRadius);

    // Never draw a canvas onto itself with filter — use a ping-pong buffer
    const buf = document.createElement('canvas');
    buf.width = w;
    buf.height = h;
    const bufCtx = buf.getContext('2d');
    let src = offCanvas;
    let dst = buf;

    for (let i = 0; i < passes; i++) {
      const dstCtx = dst === buf ? bufCtx : offCtx;
      dstCtx.clearRect(0, 0, w, h);
      dstCtx.filter = `blur(${blurAmount}px)`;
      dstCtx.drawImage(src, 0, 0);
      dstCtx.filter = 'none';
      const tmp = src;
      src = dst;
      dst = tmp;
    }

    if (src !== offCanvas) {
      offCtx.clearRect(0, 0, w, h);
      offCtx.drawImage(src, 0, 0);
    }

    restoreBlurredAlpha(offCtx, w, h, savedAlpha, blurAmount, passes);
  } else {
    const factor = PIXEL_STEPS[level];
    // Bleed at least one pixel-block so downscale cells aren't mostly black.
    const bleedRadius = Math.max(2, factor);
    const savedAlpha = prepareTransparentForFilter(offCtx, w, h, bleedRadius);

    const smallW = Math.max(1, Math.floor(w / factor));
    const smallH = Math.max(1, Math.floor(h / factor));

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = smallW;
    tempCanvas.height = smallH;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.imageSmoothingEnabled = false;
    tempCtx.drawImage(offCanvas, 0, 0, smallW, smallH);

    offCtx.imageSmoothingEnabled = false;
    offCtx.clearRect(0, 0, w, h);
    offCtx.drawImage(tempCanvas, 0, 0, w, h);
    offCtx.imageSmoothingEnabled = true;

    restorePixelatedAlpha(offCtx, w, h, savedAlpha, factor);
  }

  return offCanvas;
}
