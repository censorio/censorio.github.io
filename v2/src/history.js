import { restoreSnapshot, serializeBlocks } from './store.js';

/**
 * Undo/Redo history manager.
 * Stores snapshots of block states.
 */
class HistoryManager {
  constructor() {
    /** @type {string[]} */
    this.undoStack = [];
    /** @type {string[]} */
    this.redoStack = [];
  }

  /**
   * Save current state before a change.
   */
  snapshot() {
    this.undoStack.push(serializeBlocks());
    this.redoStack = [];
  }

  /**
   * Undo the last action. Returns true if successful.
   * @returns {boolean}
   */
  undo() {
    if (this.undoStack.length === 0) return false;
    this.redoStack.push(serializeBlocks());
    const prev = /** @type {string} */ (this.undoStack.pop());
    restoreSnapshot(prev);
    return true;
  }

  /**
   * Redo the last undone action. Returns true if successful.
   * @returns {boolean}
   */
  redo() {
    if (this.redoStack.length === 0) return false;
    this.undoStack.push(serializeBlocks());
    const next = /** @type {string} */ (this.redoStack.pop());
    restoreSnapshot(next);
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
