import { restoreSnapshot, serializeBlocks } from './store.js';

/**
 * @typedef {{ blocks: string, imageDataUrl: string|null }} HistoryEntry
 */

/**
 * Undo/Redo history manager.
 * Stores block snapshots; optionally stores image data URLs for crop undo.
 */
class HistoryManager {
  constructor() {
    /** @type {HistoryEntry[]} */
    this.undoStack = [];
    /** @type {HistoryEntry[]} */
    this.redoStack = [];
  }

  /**
   * Save current state before a change.
   * Pass imageDataUrl when the upcoming change will replace the source image (e.g. crop).
   * @param {{ imageDataUrl?: string|null }} [opts]
   */
  snapshot(opts = {}) {
    this.undoStack.push({
      blocks: serializeBlocks(),
      imageDataUrl: opts.imageDataUrl ?? null,
    });
    this.redoStack = [];
  }

  /**
   * Undo the last action. Returns true if successful.
   * When the restored entry includes an image, captureImage/restoreImage are used
   * so redo can put the cropped (or otherwise changed) image back.
   * @param {() => string|null} [captureImage]
   * @param {(dataUrl: string) => Promise<void>|void} [restoreImage]
   * @returns {Promise<boolean>}
   */
  async undo(captureImage, restoreImage) {
    if (this.undoStack.length === 0) return false;
    const prev = /** @type {HistoryEntry} */ (this.undoStack.pop());
    this.redoStack.push({
      blocks: serializeBlocks(),
      imageDataUrl: prev.imageDataUrl != null && captureImage ? captureImage() : null,
    });
    restoreSnapshot(prev.blocks);
    if (prev.imageDataUrl != null && restoreImage) {
      await restoreImage(prev.imageDataUrl);
    }
    return true;
  }

  /**
   * Redo the last undone action. Returns true if successful.
   * @param {() => string|null} [captureImage]
   * @param {(dataUrl: string) => Promise<void>|void} [restoreImage]
   * @returns {Promise<boolean>}
   */
  async redo(captureImage, restoreImage) {
    if (this.redoStack.length === 0) return false;
    const next = /** @type {HistoryEntry} */ (this.redoStack.pop());
    this.undoStack.push({
      blocks: serializeBlocks(),
      imageDataUrl: next.imageDataUrl != null && captureImage ? captureImage() : null,
    });
    restoreSnapshot(next.blocks);
    if (next.imageDataUrl != null && restoreImage) {
      await restoreImage(next.imageDataUrl);
    }
    return true;
  }

  /**
   * Check if undo is available.
   * @returns {boolean}
   */
  canUndo() {
    return this.undoStack.length > 0;
  }

  /**
   * Check if redo is available.
   * @returns {boolean}
   */
  canRedo() {
    return this.redoStack.length > 0;
  }
}

// Singleton
export const history = new HistoryManager();
