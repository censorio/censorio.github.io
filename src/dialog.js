/**
 * Styled alert / confirm dialogs (promise API usable from anywhere).
 */
import { html } from 'htm/preact';
import { useEffect, useState } from 'preact/hooks';
import { t } from './i18n.js';

/** @type {Set<() => void>} */
const listeners = new Set();

/** @type {{ type: 'alert'|'confirm', message: string, resolve: (v: boolean) => void } | null} */
let current = null;

function notify() {
  listeners.forEach(fn => fn());
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function openDialog(type, message) {
  return new Promise((resolve) => {
    // Replace any existing dialog (resolve previous as dismissed)
    if (current) current.resolve(false);
    current = { type, message, resolve };
    notify();
  });
}

/** Alert — resolves after OK (always true). */
export function showAlert(message) {
  return openDialog('alert', String(message ?? '')).then(() => undefined);
}

/** Confirm — resolves true on OK, false on Cancel. */
export function showConfirm(message) {
  return openDialog('confirm', String(message ?? ''));
}

function close(result) {
  if (!current) return;
  const { resolve } = current;
  current = null;
  notify();
  resolve(result);
}

/** Preact host — mount once in App. */
export function DialogHost() {
  const [, bump] = useState(0);
  useEffect(() => subscribe(() => bump(n => n + 1)), []);

  useEffect(() => {
    if (!current) return;
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(current?.type === 'alert');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        close(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current]);

  if (!current) return null;

  const isConfirm = current.type === 'confirm';
  const message = current.message;

  return html`
    <div
      class="modal-backdrop dialog-backdrop"
      onMouseDown=${(e) => {
        if (e.target === e.currentTarget) close(!isConfirm);
      }}
    >
      <div
        class="modal dialog-modal"
        role="alertdialog"
        aria-modal="true"
        onMouseDown=${(e) => e.stopPropagation()}
      >
        <p class="dialog-message">${message}</p>
        <div class="modal-actions">
          ${isConfirm && html`
            <button type="button" onClick=${() => close(false)}>${t('cancel')}</button>
          `}
          <button type="button" class="accent" onClick=${() => close(true)}>
            ${t('ok')}
          </button>
        </div>
      </div>
    </div>
  `;
}
