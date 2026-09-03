import { showAlert } from '../dialog.js';
import { t } from '../i18n.js';

export function downloadCanvasAsPNG(canvas, filename = 'redacted.png') {
  canvas.toBlob(async (blob) => {
    if (!blob) {
      await showAlert(t('alertBlobFailed'));
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/png');
}
