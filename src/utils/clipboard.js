import { showAlert } from '../dialog.js';
import { t } from '../i18n.js';

/**
 * Read an image from the system clipboard.
 * @returns {Promise<HTMLImageElement|null>}
 */
export async function readImageFromClipboard() {
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      for (const type of item.types) {
        if (type.startsWith('image/')) {
          const blob = await item.getType(type);
          return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = URL.createObjectURL(blob);
          });
        }
      }
    }
  } catch (e) {
    console.error('Clipboard read failed:', e);
  }
  return null;
}

/**
 * Copy canvas content to clipboard as PNG.
 * @param {HTMLCanvasElement} canvas
 */
export async function copyCanvasToClipboard(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        await showAlert(t('alertBlobFailed'));
        resolve(false);
        return;
      }
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        resolve(true);
      } catch (e) {
        await showAlert(t('alertClipboardWriteFailed'));
        resolve(false);
      }
    }, 'image/png');
  });
}
