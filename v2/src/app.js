import { html } from 'htm/preact';
import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { AboutModal, shouldShowAboutOnStartup } from './aboutModal.js';
import { createCanvasManager } from './canvas/CanvasManager.js';
import { CropModal } from './cropModal.js';
import { DialogHost, showAlert, showConfirm } from './dialog.js';
import { history } from './history.js';
import { useStoreVersion } from './hooks.js';
import { getLang, initLang, setLang, t, toolLabel } from './i18n.js';
import {
  blocks,
  brushHardness,
  brushMode,
  brushRadius,
  clearAllBlocks,
  currentTool,
  hasImage,
  intensity,
  moveDown,
  moveUp,
  removeBlock,
  selectedBlockIds,
  serializeBlocks,
  styleMode,
  updateBlock,
} from './store.js';
import { copyCanvasToClipboard, readImageFromClipboard } from './utils/clipboard.js';
import { downloadCanvasAsPNG } from './utils/download.js';
import { loadImageFromFile } from './utils/fileLoader.js';

initLang();

let canvasManager = null;

const LS_BLOCKS_KEY = 'censorio-blocks';
const LS_IMAGE_KEY = 'censorio-image-data';
const LS_THEME_KEY = 'censorio-theme';

function onCanvasRef(el) {
  if (el && !canvasManager) {
    canvasManager = createCanvasManager(el);
    window.__canvasManager = canvasManager;
  }
}

function saveBlocksSession() {
  try {
    localStorage.setItem(LS_BLOCKS_KEY, serializeBlocks());
  } catch { /* localStorage полон */ }
}

function saveImageSession() {
  try {
    const src = canvasManager?.getSourceImage();
    if (!src) {
      localStorage.removeItem(LS_IMAGE_KEY);
      return;
    }
    const c = document.createElement('canvas');
    c.width = src.naturalWidth || src.width;
    c.height = src.naturalHeight || src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    localStorage.setItem(LS_IMAGE_KEY, c.toDataURL('image/jpeg', 0.92));
  } catch {
    try { localStorage.removeItem(LS_IMAGE_KEY); } catch { /* ignore */ }
  }
}

function clearSessionStorage() {
  try {
    localStorage.removeItem(LS_BLOCKS_KEY);
    localStorage.removeItem(LS_IMAGE_KEY);
  } catch { /* ignore */ }
}

const TOOL_IDS = ['rect', 'brush', 'lasso', 'select'];

function App() {
  useStoreVersion();
  const [showCrop, setShowCrop] = useState(false);
  const [showAbout, setShowAbout] = useState(() => shouldShowAboutOnStartup());
  const [blockStyle, setBlockStyle] = useState('blur');
  const [blockIntensity, setBlockIntensity] = useState(3);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [cursorPos, setCursorPos] = useState(null);
  const [lang, setLangState] = useState(() => getLang());
  const [theme, setTheme] = useState(() => {
    let next = 'light';
    try { next = localStorage.getItem(LS_THEME_KEY) || 'light'; } catch { /* ignore */ }
    document.documentElement.setAttribute('data-theme', next);
    return next;
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const intensityTimeoutRef = useRef(null);
  const toastTimerRef = useRef(null);
  const sessionRestoredRef = useRef(false);

  function showToast(message) {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2000);
  }

  function applyTheme(next) {
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(LS_THEME_KEY, next); } catch { /* ignore */ }
    setTheme(next);
  }

  function applyLang(next) {
    setLang(next);
    setLangState(next);
  }

  // Sync style controls with selected block
  useEffect(() => {
    function syncStyle() {
      if (selectedBlockIds.value.length === 1) {
        const block = blocks.value.find(b => b.id === selectedBlockIds.value[0]);
        if (block) {
          setBlockStyle(block.style);
          setBlockIntensity(block.intensity);
          return;
        }
      }
      setBlockStyle(styleMode.value);
      setBlockIntensity(intensity.value);
    }
    syncStyle();
  }, [selectedBlockIds.value, blocks.value, styleMode.value, intensity.value]);

  // Save blocks when they change
  useEffect(() => {
    if (hasImage.value) saveBlocksSession();
  }, [blocks.value]);

  // Cursor listener + session restore once canvas exists
  useEffect(() => {
    let tries = 0;
    const id = setInterval(() => {
      tries += 1;
      if (!canvasManager) {
        if (tries > 40) clearInterval(id);
        return;
      }
      clearInterval(id);
      canvasManager.setCursorListener((x, y) => {
        if (x == null) setCursorPos(null);
        else setCursorPos({ x, y });
      });
      if (!sessionRestoredRef.current) {
        sessionRestoredRef.current = true;
        restoreSession();
      }
    }, 50);
    return () => clearInterval(id);
  }, []);

  // beforeunload when there is work
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!hasImage.value && blocks.value.length === 0) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasImage.value, blocks.value]);

  async function restoreSession() {
    try {
      const savedImage = localStorage.getItem(LS_IMAGE_KEY);
      if (!savedImage || !canvasManager) return;
      setIsLoading(true);
      const savedBlocks = localStorage.getItem(LS_BLOCKS_KEY);
      const img = new Image();
      img.onload = () => {
        canvasManager.loadImage(img, { preserveBlocks: true });
        if (savedBlocks) {
          try {
            const arr = JSON.parse(savedBlocks);
            if (Array.isArray(arr)) blocks.value = arr;
          } catch { /* ignore */ }
        }
        hasImage.value = true;
        canvasManager.render();
        setIsLoading(false);
      };
      img.onerror = () => setIsLoading(false);
      img.src = savedImage;
    } catch {
      setIsLoading(false);
    }
  }

  async function applyLoadedImage(img) {
    window.__currentTool = currentTool.value;
    canvasManager.loadImage(img);
    hasImage.value = true;
    saveBlocksSession();
    saveImageSession();
  }

  async function handleFileInput(e) {
    const file = e.target.files[0];
    if (!file) return;
    setIsLoading(true);
    try {
      const img = await loadImageFromFile(file);
      await applyLoadedImage(img);
      showToast(t('toastImageLoaded'));
    } catch (err) {
      await showAlert(err.message);
    } finally {
      setIsLoading(false);
      e.target.value = '';
    }
  }

  async function handlePaste() {
    setIsLoading(true);
    try {
      const img = await readImageFromClipboard();
      if (!img) { await showAlert(t('alertNoClipboardImage')); return; }
      await applyLoadedImage(img);
      showToast(t('toastImagePasted'));
    } finally {
      setIsLoading(false);
    }
  }

  function handleDownload() {
    const cvs = canvasManager ? canvasManager.getCanvas() : null;
    if (!cvs) return;
    downloadCanvasAsPNG(cvs);
    showToast(t('toastDownloaded'));
  }

  function handleCopy() {
    const cvs = canvasManager ? canvasManager.getCanvas() : null;
    if (!cvs) return;
    copyCanvasToClipboard(cvs);
    showToast(t('toastCopied'));
  }

  async function handleClearAll() {
    if (blocks.value.length === 0) return;
    if (!(await showConfirm(t('confirmClearAll')))) return;
    history.snapshot();
    clearAllBlocks();
    if (canvasManager) canvasManager.render();
    saveBlocksSession();
    showToast(t('toastBlocksCleared'));
  }

  async function handleNew() {
    if (hasImage.value || blocks.value.length > 0) {
      if (!(await showConfirm(t('confirmNewSession')))) return;
    }
    clearAllBlocks();
    hasImage.value = false;
    clearSessionStorage();
    if (canvasManager) canvasManager.clearImage();
    setCursorPos(null);
    showToast(t('toastNewSession'));
  }

  function handleStyleChange(newStyle) {
    const ids = selectedBlockIds.value;
    if (ids.length > 0) {
      history.snapshot();
      for (const id of ids) updateBlock(id, { style: newStyle });
      if (canvasManager) canvasManager.render();
    }
    styleMode.value = newStyle;
    setBlockStyle(newStyle);
  }

  function handleIntensityChange(newValue) {
    // Local UI only while dragging — avoid store notify + full re-render each step
    setBlockIntensity(newValue);
    if (intensityTimeoutRef.current) clearTimeout(intensityTimeoutRef.current);
    intensityTimeoutRef.current = setTimeout(() => {
      intensityTimeoutRef.current = null;
      commitIntensity(newValue);
    }, 120);
  }

  function commitIntensity(newValue) {
    if (intensity.value !== newValue) intensity.value = newValue;
    const ids = selectedBlockIds.value;
    if (ids.length === 0) return;
    const needsUpdate = ids.some(id => {
      const block = blocks.value.find(b => b.id === id);
      return block && block.intensity !== newValue;
    });
    if (!needsUpdate) return;
    history.snapshot();
    for (const id of ids) updateBlock(id, { intensity: newValue });
    if (canvasManager) canvasManager.render();
  }

  function openCrop() {
    if (canvasManager && canvasManager.getCanvas()) setShowCrop(true);
  }

  function closeCrop() {
    setShowCrop(false);
  }

  function openAbout() {
    setShowAbout(true);
  }

  function closeAbout() {
    setShowAbout(false);
  }

  function toggleSidebar() {
    setSidebarOpen(v => !v);
  }

  function closeSidebar() {
    setSidebarOpen(false);
  }

  function handleUndo() {
    if (canvasManager) canvasManager.undo();
  }

  function handleRedo() {
    if (canvasManager) canvasManager.redo();
  }

  function setLangEn() {
    applyLang('en');
  }

  function setLangRu() {
    applyLang('ru');
  }

  function toggleTheme() {
    applyTheme(theme === 'dark' ? 'light' : 'dark');
  }

  function selectTool(id) {
    currentTool.value = id;
    window.__currentTool = id;
    selectedBlockIds.value = [];
    if (canvasManager) canvasManager.render();
    setSidebarOpen(false);
  }

  function selectBlurStyle() {
    handleStyleChange('blur');
  }

  function selectPixelateStyle() {
    handleStyleChange('pixelate');
  }

  function onIntensityInput(e) {
    handleIntensityChange(+e.target.value);
  }

  function onIntensityCommit(e) {
    if (intensityTimeoutRef.current) {
      clearTimeout(intensityTimeoutRef.current);
      intensityTimeoutRef.current = null;
    }
    commitIntensity(+e.target.value);
  }

  function setModeDraw() {
    brushMode.value = 'draw';
  }

  function setModeErase() {
    brushMode.value = 'erase';
  }

  function onBrushRadiusInput(e) {
    brushRadius.value = +e.target.value;
  }

  function onBrushHardnessInput(e) {
    brushHardness.value = +e.target.value;
  }

  function selectBlockItem(id) {
    selectedBlockIds.value = [id];
    if (canvasManager) canvasManager.render();
  }

  function handleMoveBlockUp(e, id) {
    e.stopPropagation();
    moveUp(id);
    if (canvasManager) canvasManager.render();
  }

  function handleMoveBlockDown(e, id) {
    e.stopPropagation();
    moveDown(id);
    if (canvasManager) canvasManager.render();
  }

  function handleDeleteBlock(e, id) {
    e.stopPropagation();
    history.snapshot();
    removeBlock(id);
    if (canvasManager) canvasManager.render();
  }

  async function applyCrop({ top, bottom, left, right }) {
    if (canvasManager) {
      history.snapshot();
      await canvasManager.cropImage(left, top, right, bottom);
      saveImageSession();
      saveBlocksSession();
    }
    setShowCrop(false);
    showToast(t('toastCropped'));
  }

  // Drag-and-drop
  useEffect(() => {
    const area = document.querySelector('.canvas-area');
    if (!area) return;

    function onDragOver(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }

    async function onDrop(e) {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (!file || !file.type.startsWith('image/')) return;
      setIsLoading(true);
      try {
        const img = await loadImageFromFile(file);
        await applyLoadedImage(img);
        showToast(t('toastImageLoaded'));
      } catch (err) {
        await showAlert(err.message);
      } finally {
        setIsLoading(false);
      }
    }

    area.addEventListener('dragover', onDragOver);
    area.addEventListener('drop', onDrop);
    return () => {
      area.removeEventListener('dragover', onDragOver);
      area.removeEventListener('drop', onDrop);
    };
  }, [lang]);

  const cvs = canvasManager ? canvasManager.getCanvas() : null;
  const w = cvs ? cvs.width : 0;
  const h = cvs ? cvs.height : 0;
  const canUndo = history.canUndo();
  const canRedo = history.canRedo();
  const selCount = selectedBlockIds.value.length;
  const toolName = toolLabel(currentTool.value);
  const cursorLabel = cursorPos ? `| ${cursorPos.x}, ${cursorPos.y}` : '';
  const styleSuffix = selCount === 1
    ? t('styleSelectedBlock')
    : selCount > 1
      ? t('styleSelectedBlocks')
      : '';

  return html`
    <div class="topbar">
      <button class="sidebar-toggle" title=${t('toolsMenu')} onClick=${toggleSidebar}>☰</button>
      <label class="file-btn">
        ${t('openFile')}
        <input type="file" accept="image/*" hidden onInput=${handleFileInput} />
      </label>
      <button onClick=${handlePaste}>${t('paste')}</button>
      <button onClick=${handleNew} title=${t('newTitle')}>${t('new')}</button>
      <span class="sep"></span>
      <button onClick=${handleUndo} disabled=${!canUndo}>${t('undo')}</button>
      <button onClick=${handleRedo} disabled=${!canRedo}>${t('redo')}</button>
      <span class="sep"></span>
      <button class="accent" onClick=${handleDownload} disabled=${!hasImage.value}>${t('download')}</button>
      <button onClick=${handleCopy} disabled=${!hasImage.value}>${t('copy')}</button>
      <button onClick=${openCrop} disabled=${!hasImage.value}>${t('crop')}</button>
      <button onClick=${handleClearAll} disabled=${!hasImage.value || blocks.value.length === 0}>${t('clearAll')}</button>
      <div class="topbar-right">
        <button type="button" onClick=${openAbout}>${t('about')}</button>
        <span class="sep"></span>
        <div class="lang-toggle" title=${t('langTitle')}>
          <button
            class="${lang === 'en' ? 'active' : ''}"
            onClick=${setLangEn}
          >${t('langEn')}</button>
          <button
            class="${lang === 'ru' ? 'active' : ''}"
            onClick=${setLangRu}
          >${t('langRu')}</button>
        </div>
        <button
          class="theme-toggle"
          title=${theme === 'dark' ? t('lightTheme') : t('darkTheme')}
          onClick=${toggleTheme}
        ><span class="theme-icon">${theme === 'dark' ? '☀' : '☾'}</span></button>
      </div>
    </div>

    <div class="main">
      ${sidebarOpen && html`<div class="sidebar-backdrop" onClick=${closeSidebar}></div>`}
      <div class="sidebar ${sidebarOpen ? 'open' : ''}">
        <div>
          <h3>${t('tools')}</h3>
          <div class="tool-btns">
            ${TOOL_IDS.map(id => html`
              <button
                class="tool-btn ${currentTool.value === id ? 'active' : ''}"
                onClick=${() => selectTool(id)}
              >${toolLabel(id)}</button>
            `)}
          </div>
        </div>

        <div>
          <h3>${t('style')} ${styleSuffix}</h3>
          <div class="style-toggle">
            <button
              class="${blockStyle === 'blur' ? 'active' : ''}"
              onClick=${selectBlurStyle}
            >${t('blur')}</button>
            <button
              class="${blockStyle === 'pixelate' ? 'active' : ''}"
              onClick=${selectPixelateStyle}
            >${t('pixelate')}</button>
          </div>
          <input
            type="range" min="1" max="5" step="1" value=${blockIntensity}
            class="intensity-slider"
            onInput=${onIntensityInput}
            onChange=${onIntensityCommit}
          />
          <div class="intensity-val">${t('intensity')}: ${blockIntensity}/5</div>
        </div>

        <div>
          <h3>${t('mode')}</h3>
          <div class="style-toggle">
            <button
              class="${brushMode.value === 'draw' ? 'active' : ''}"
              onClick=${setModeDraw}
            >${t('draw')}</button>
            <button
              class="${brushMode.value === 'erase' ? 'active' : ''}"
              onClick=${setModeErase}
            >${t('erase')}</button>
          </div>
          <div class="intensity-val" style=${{ marginTop: '4px' }}>
            ${brushMode.value === 'erase' ? t('modeEraseHint') : t('modeDrawHint')}
          </div>
        </div>

        <div>
          <h3>${t('brush')}</h3>
          <input
            type="range" min="5" max="100" value=${brushRadius.value}
            class="intensity-slider"
            onInput=${onBrushRadiusInput}
          />
          <div class="intensity-val">${t('radius')}: ${brushRadius.value}px</div>

          <input
            type="range" min="0" max="100" value=${brushHardness.value}
            class="intensity-slider"
            onInput=${onBrushHardnessInput}
          />
          <div class="intensity-val">${t('hardness')}: ${brushHardness.value}%</div>
        </div>

        <div style=${{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
          <h3>${t('blocks')} (${blocks.value.length})</h3>
          <div class="block-list">
            ${blocks.value.map((b, i) => html`
              <div
                class="block-item ${selectedBlockIds.value.includes(b.id) ? 'selected' : ''}"
                onClick=${() => selectBlockItem(b.id)}
              >
                <span class="label">${i + 1}. ${toolLabel(b.type)}${b.mode === 'erase' ? ` ${t('eraseTag')}` : ''} ${b.mode === 'erase' ? '' : `${b.style === 'blur' ? t('blur') : t('pixelate')} ${b.intensity}`}</span>
                <div style=${{ display: 'flex', gap: '2px' }}>
                  <button class="z-btn" title=${t('moveUp')} onClick=${(e) => handleMoveBlockUp(e, b.id)}>⬆</button>
                  <button class="z-btn" title=${t('moveDown')} onClick=${(e) => handleMoveBlockDown(e, b.id)}>⬇</button>
                  <button class="del-btn" title=${t('delete')} onClick=${(e) => handleDeleteBlock(e, b.id)}>✕</button>
                </div>
              </div>
            `)}
          </div>
        </div>
      </div>

      <div class="canvas-area">
        <div class="canvas-wrap ${hasImage.value ? '' : 'empty'} tool-${currentTool.value}">
          <canvas ref=${onCanvasRef}></canvas>
          ${!hasImage.value && html`
            <div class="empty-state">
              <div class="icon">📷</div>
              <p>${t('emptyHint').split('\n').map((line, idx) => idx === 0 ? html`${line}<br/>` : line)}</p>
              <label class="file-btn empty-open-btn">
                ${t('openFile')}
                <input type="file" accept="image/*" hidden onInput=${handleFileInput} />
              </label>
            </div>
          `}
          ${isLoading && html`
            <div class="loading-overlay">
              <div class="spinner"></div>
              <p>${t('loading')}</p>
            </div>
          `}
        </div>
      </div>
    </div>

    <div class="statusbar">
      <span>${hasImage.value ? `${w} × ${h} px` : t('noImage')} ${hasImage.value ? `| ${t('toolLabel')}: ${toolName} ${cursorLabel}` : ''}</span>
      <span>${blocks.value.length} ${t('blocksPlural')} | ${t('statusHint')}</span>
    </div>

    ${showCrop && html`
      <${CropModal}
        width=${w} height=${h}
        onConfirm=${applyCrop}
        onCancel=${closeCrop}
      />
    `}

    ${showAbout && html`
      <${AboutModal} onClose=${closeAbout} />
    `}

    <${DialogHost} />

    ${toast && html`
      <div class="toast">${toast}</div>
    `}
  `;
}

render(html`<${App}/>`, document.getElementById('app'));
