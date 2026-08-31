/**
 * Browser file helpers with WebKit-safe lifecycle behavior.
 */
/** @typedef {{ click: () => void, remove: () => void, href?: string, download?: string }} DownloadAnchor */
/** @typedef {{ body: { appendChild: (node: unknown) => unknown }, createElement: (name: string) => DownloadAnchor }} DownloadDocument */
/** @typedef {{ createObjectURL: (blob: Blob) => string, revokeObjectURL: (url: string) => void }} ObjectUrlApi */

/**
 * @param {Blob} blob
 * @param {string} filename
 * @param {{ documentObject?: DownloadDocument, urlApi?: ObjectUrlApi, schedule?: typeof setTimeout }} [options]
 */
export function downloadBlob(blob, filename, {
  documentObject = document,
  urlApi = URL,
  schedule = setTimeout,
} = {}) {
  if (!(blob instanceof Blob)) throw new TypeError('A Blob is required');
  if (typeof filename !== 'string' || filename.trim() === '') {
    throw new TypeError('A download filename is required');
  }

  const objectUrl = urlApi.createObjectURL(blob);
  const anchor = documentObject.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  try {
    documentObject.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    // Safari/WebViews can cancel a download if its URL is revoked in the same
    // task as the click. Keep it alive briefly, then deterministically release.
    schedule(() => urlApi.revokeObjectURL(objectUrl), 1_000);
  }
  return objectUrl;
}

/**
 * @param {unknown} text
 * @param {{ navigatorObject?: { clipboard?: { writeText?: (value: string) => Promise<void> } } | null, documentObject?: any }} [options]
 */
export async function copyText(text, {
  navigatorObject = globalThis.navigator,
  documentObject = globalThis.document,
} = {}) {
  const value = String(text ?? '');
  try {
    if (typeof navigatorObject?.clipboard?.writeText === 'function') {
      await navigatorObject.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Safari may expose Clipboard but reject it outside a secure/user-gesture
    // context. Fall through to its selection-based compatibility path.
  }

  if (!documentObject?.body || typeof documentObject.execCommand !== 'function') return false;
  const activeElement = /** @type {{ focus?: (options?: FocusOptions) => void } | null} */ (
    documentObject.activeElement
  );
  const textarea = documentObject.createElement('textarea');
  textarea.value = value;
  textarea.readOnly = true;
  textarea.setAttribute('aria-hidden', 'true');
  Object.assign(textarea.style, {
    position: 'fixed',
    inset: '0 auto auto -9999px',
    opacity: '0',
  });

  try {
    documentObject.body.appendChild(textarea);
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, value.length);
    return documentObject.execCommand('copy') === true;
  } catch {
    return false;
  } finally {
    textarea.remove();
    activeElement?.focus?.({ preventScroll: true });
  }
}
