/**
 * About modal — app intro + "don't show again" preference.
 */
import { html } from 'htm/preact';
import { useState } from 'preact/hooks';
import { t } from './i18n.js';

export const LS_HIDE_ABOUT_KEY = 'censorio-hide-about';

export function shouldShowAboutOnStartup() {
  try {
    return Boolean(localStorage.getItem(LS_HIDE_ABOUT_KEY)) === false;
  } catch {
    return true;
  }
}

export function getHideAbout() {
  try {
    return Boolean(localStorage.getItem(LS_HIDE_ABOUT_KEY));
  } catch {
    return false;
  }
}

export function setHideAbout(hide) {
  try {
    if (hide) localStorage.setItem(LS_HIDE_ABOUT_KEY, true);
    else localStorage.removeItem(LS_HIDE_ABOUT_KEY);
  } catch { /* ignore */ }
}

export function AboutModal({ onClose, lang, theme, onLangEn, onLangRu, onToggleTheme }) {
  const [hide, setHide] = useState(() => getHideAbout());

  function onHideChange(e) {
    const next = e.target.checked;
    setHide(next);
    setHideAbout(next);
  }

  return html`
    <div
      class="modal-backdrop"
      onMouseDown=${(e) => {
      if (e.target === e.currentTarget) onClose();
    }}
    >
      <div
        class="modal about-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown=${(e) => e.stopPropagation()}
      >
        <div class="about-modal-header">
          <h2>${t('about')} ${t('appName')}</h2>
          <div class="about-modal-toggles">
            <div class="lang-toggle" title=${t('langTitle')}>
              <button
                type="button"
                class="${lang === 'en' ? 'active' : ''}"
                onClick=${onLangEn}
              >${t('langEn')}</button>
              <button
                type="button"
                class="${lang === 'ru' ? 'active' : ''}"
                onClick=${onLangRu}
              >${t('langRu')}</button>
            </div>
            <button
              type="button"
              class="theme-toggle"
              title=${theme === 'dark' ? t('lightTheme') : t('darkTheme')}
              onClick=${onToggleTheme}
            ><span class="theme-icon">${theme === 'dark' ? '☀' : '☾'}</span></button>
          </div>
        </div>
        <div class="about-body">
          <img src="assets/preview.png" alt=""  />
          <p>${t('appName')} ${t('aboutP1')}</p>
          <p>${t('aboutP2')}</p>
          <p>${t('aboutP3')}</p>
        </div>
        <label class="about-dont-show">
          <input type="checkbox" checked=${hide} onChange=${onHideChange} />
          <span>${t('aboutDontShow')}</span>
        </label>
        <div class="modal-actions">
          <button type="button" class="accent" onClick=${onClose}>${t('gotIt')}</button>
        </div>
      </div>
    </div>
  `;
}
