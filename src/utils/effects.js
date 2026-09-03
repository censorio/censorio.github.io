/**
 * Apply blur or pixelate effect to a region of the source image.
 *
 * Intensity 1–5; level 3 is the comfortable default for redaction.
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

export function createEffectRegion(source, region, style, intensity) {
  const w = Math.max(1, Math.ceil(region.w));
  const h = Math.max(1, Math.ceil(region.h));
  const offCanvas = document.createElement('canvas');
  offCanvas.width = w;
  offCanvas.height = h;
  const offCtx = offCanvas.getContext('2d');

  offCtx.drawImage(
    source,
    region.x, region.y, region.w, region.h,
    0, 0, w, h
  );

  const level = clampIntensity(intensity);

  if (style === 'blur') {
    const { passes, px: blurAmount } = BLUR_STEPS[level];
    // Never draw a canvas onto itself with filter — use a ping-pong buffer
    const buf = document.createElement('canvas');
    buf.width = w;
    buf.height = h;
    const bufCtx = buf.getContext('2d');
    let src = offCanvas;
    let dst = buf;
    let srcCtx = offCtx;
    let dstCtx = bufCtx;

    for (let i = 0; i < passes; i++) {
      dstCtx.clearRect(0, 0, w, h);
      dstCtx.filter = `blur(${blurAmount}px)`;
      dstCtx.drawImage(src, 0, 0);
      dstCtx.filter = 'none';
      const tmp = src; src = dst; dst = tmp;
      const tmpCtx = srcCtx; srcCtx = dstCtx; dstCtx = tmpCtx;
    }

    if (src !== offCanvas) {
      offCtx.clearRect(0, 0, w, h);
      offCtx.drawImage(src, 0, 0);
    }
  } else {
    const factor = PIXEL_STEPS[level];
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
  }

  return offCanvas;
}
