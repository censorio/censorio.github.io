/**
 * Simple EN/RU i18n with localStorage persistence.
 */

export const LS_LANG_KEY = 'censorio-lang';

const listeners = new Set();

function loadLang() {
  try {
    const saved = localStorage.getItem(LS_LANG_KEY);
    if (saved === 'en' || saved === 'ru') return saved;
  } catch { /* ignore */ }
  return 'en';
}

let lang = loadLang();

export function getLang() {
  return lang;
}

export function setLang(next) {
  if (next !== 'en' && next !== 'ru') return;
  if (next === lang) return;
  lang = next;
  try { localStorage.setItem(LS_LANG_KEY, lang); } catch { /* ignore */ }
  document.documentElement.setAttribute('lang', lang === 'ru' ? 'ru' : 'en');
  listeners.forEach(fn => fn(lang));
}

export function subscribeLang(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Apply saved lang to <html lang> on startup */
export function initLang() {
  document.documentElement.setAttribute('lang', lang === 'ru' ? 'ru' : 'en');
}

const dict = {
  en: {
    appName: 'Censorio',
    openFile: 'Open File',
    paste: 'Paste',
    new: 'New',
    newTitle: 'New session',
    undo: 'Undo',
    redo: 'Redo',
    download: 'Download',
    copy: 'Copy',
    crop: 'Crop',
    clearAll: 'Clear All',
    tools: 'Tools',
    toolsMenu: 'Tools',
    toolRect: 'Rect',
    toolBrush: 'Brush',
    toolLasso: 'Lasso',
    toolSelect: 'Select',
    style: 'Style',
    styleSelectedBlock: '(selected block)',
    styleSelectedBlocks: '(selected blocks)',
    blur: 'Blur',
    pixelate: 'Pixelate',
    intensity: 'Intensity',
    mode: 'Mode',
    draw: 'Draw',
    erase: 'Erase',
    modeEraseHint: 'Erase blur / pixelate',
    modeDrawHint: 'Apply blur / pixelate',
    brush: 'Brush',
    radius: 'Radius',
    hardness: 'Hardness',
    blocks: 'Blocks',
    moveUp: 'Move Up',
    moveDown: 'Move Down',
    delete: 'Delete',
    emptyHint: 'Open an image file or paste from clipboard to begin.\nYou can also drag & drop an image here.',
    loading: 'Loading image...',
    noImage: 'No image',
    toolLabel: 'Tool',
    statusHint: 'Ctrl+Z Undo | Del Delete',
    block: 'block',
    blocksPlural: 'block(s)',
    lightTheme: 'Light theme',
    darkTheme: 'Dark theme',
    langEn: 'EN',
    langRu: 'RU',
    langTitle: 'Language',
    toastImageLoaded: 'Image loaded',
    toastImagePasted: 'Image pasted',
    toastDownloaded: 'Downloaded!',
    toastCopied: 'Copied!',
    toastBlocksCleared: 'Blocks cleared',
    toastNewSession: 'New session',
    toastCropped: 'Cropped',
    confirmClearAll: 'Clear all blocks?',
    confirmNewSession: 'Start a new session? Current image and blocks will be cleared.',
    alertNoClipboardImage: 'No image found in clipboard.',
    cropTitle: 'Crop Image',
    cropOriginal: 'Original',
    cropNew: 'New',
    cropTop: 'Top',
    cropBottom: 'Bottom',
    cropLeft: 'Left',
    cropRight: 'Right',
    cancel: 'Cancel',
    apply: 'Apply',
    ok: 'OK',
    about: 'About',
    aboutP1: ' is a simple browser tool for hiding personal data on photos and screenshots. It allows you to quickly obscure faces, license plates, parts of documents, or any other sensitive information. All files are processed strictly on your device and are never uploaded anywhere, guaranteeing full privacy.',
    aboutP2: 'You can select the required areas using a rectangle, brush, or lasso tool, and then apply blur or pixelation. If you make a mistake, the eraser easily restores the original image.',
    aboutP3: 'The finished image can be instantly copied to your clipboard or downloaded. It is a fast and convenient way to prepare a screenshot for sending in a chat or posting online.',
    aboutDontShow: 'Don\'t show this window again',
    alertBlobFailed: 'Failed to generate image blob.',
    alertClipboardWriteFailed: 'Clipboard write failed.',
    ctxDelete: 'Delete',
    ctxDuplicate: 'Duplicate',
    ctxBringToFront: 'Bring to Front',
    ctxSendToBack: 'Send to Back',
    eraseTag: 'erase',
    gotIt: 'Got it',
  },
  ru: {
    appName: 'Censorio',
    openFile: 'Открыть',
    paste: 'Вставить',
    new: 'Новый',
    newTitle: 'Новая сессия',
    undo: 'Отменить',
    redo: 'Повторить',
    download: 'Скачать',
    copy: 'Копировать',
    crop: 'Обрезать',
    clearAll: 'Очистить',
    tools: 'Инструменты',
    toolsMenu: 'Инструменты',
    toolRect: 'Прямоуг.',
    toolBrush: 'Кисть',
    toolLasso: 'Лассо',
    toolSelect: 'Выбор',
    style: 'Стиль',
    styleSelectedBlock: '(выбранный блок)',
    styleSelectedBlocks: '(выбранные блоки)',
    blur: 'Размытие',
    pixelate: 'Пиксели',
    intensity: 'Интенсивность',
    mode: 'Режим',
    draw: 'Рисовать',
    erase: 'Ластик',
    modeEraseHint: 'Стереть размытие / пиксели',
    modeDrawHint: 'Наложить размытие / пиксели',
    brush: 'Кисть',
    radius: 'Радиус',
    hardness: 'Жёсткость',
    blocks: 'Блоки',
    moveUp: 'Выше',
    moveDown: 'Ниже',
    delete: 'Удалить',
    emptyHint: 'Откройте файл или вставьте изображение из буфера.\nМожно также перетащить картинку сюда.',
    loading: 'Загрузка...',
    noImage: 'Нет изображения',
    toolLabel: 'Инструмент',
    statusHint: 'Ctrl+Z отмена | Del удалить',
    block: 'блок',
    blocksPlural: 'блок(ов)',
    lightTheme: 'Светлая тема',
    darkTheme: 'Тёмная тема',
    langEn: 'EN',
    langRu: 'RU',
    langTitle: 'Язык',
    toastImageLoaded: 'Изображение загружено',
    toastImagePasted: 'Изображение вставлено',
    toastDownloaded: 'Скачано!',
    toastCopied: 'Скопировано!',
    toastBlocksCleared: 'Блоки очищены',
    toastNewSession: 'Новая сессия',
    toastCropped: 'Обрезано',
    confirmClearAll: 'Очистить все блоки?',
    confirmNewSession: 'Начать новую сессию? Текущее изображение и блоки будут удалены.',
    alertNoClipboardImage: 'В буфере обмена нет изображения.',
    cropTitle: 'Обрезка',
    cropOriginal: 'Исходный',
    cropNew: 'Новый',
    cropTop: 'Сверху',
    cropBottom: 'Снизу',
    cropLeft: 'Слева',
    cropRight: 'Справа',
    cancel: 'Отмена',
    apply: 'Применить',
    ok: 'ОК',
    about: 'О приложении',
    aboutP1: ' – это простой инструмент в браузере для скрытия личных данных на фото и скриншотах. Он позволяет быстро замазать лица, номера автомобилей, части документов или любую другую чувствительную информацию. Все файлы обрабатываются только на вашем устройстве и никуда не отправляются, что гарантирует полную конфиденциальность.',
    aboutP2: 'Вы можете выделять нужные зоны прямоугольником, кистью или лассо, а затем применять размытие или пикселизацию. Если ошиблись – ластик легко вернёт оригинал.',
    aboutP3: 'Готовое изображение можно сразу скопировать в буфер обмена или скачать. Это быстрый и удобный способ подготовить скриншот для отправки в чат или публикации в сети.',
    aboutDontShow: 'Больше не показывать это окно',
    alertBlobFailed: 'Не удалось создать изображение.',
    alertClipboardWriteFailed: 'Не удалось записать в буфер обмена.',
    ctxDelete: 'Удалить',
    ctxDuplicate: 'Дублировать',
    ctxBringToFront: 'На передний план',
    ctxSendToBack: 'На задний план',
    eraseTag: 'ластик',
    gotIt: 'Понятно',
  },
};

/**
 * @param {keyof typeof dict.en} key
 * @param {Record<string, string|number>} [vars]
 */
export function t(key, vars) {
  const table = dict[lang] || dict.en;
  let text = table[key] ?? dict.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

export function toolLabel(id) {
  const map = {
    rect: 'toolRect',
    brush: 'toolBrush',
    lasso: 'toolLasso',
    select: 'toolSelect',
  };
  return t(map[id] || id);
}
