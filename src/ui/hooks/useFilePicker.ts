/**
 * Opens the browser's file picker programmatically.
 */

/**
 * Opens a hidden file input and resolves with the chosen files.
 *
 * Cancelling is detected with the input's `cancel` event (all current
 * browsers). Large folders can take seconds to enumerate after the user
 * confirms, so there is deliberately no timeout: the promise resolves when
 * the browser delivers the files.
 */
function openPicker(configure: (input: HTMLInputElement) => void): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';
    configure(input);
    const done = (files: File[]): void => {
      resolve(files);
      input.remove();
    };
    input.addEventListener('change', () => done([...(input.files ?? [])]));
    input.addEventListener('cancel', () => done([]));
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * @param accept MIME types / extensions accepted.
 * @param multiple Allow several files.
 * @returns The chosen files (empty when cancelled).
 */
export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return openPicker((input) => {
    input.accept = accept;
    input.multiple = multiple;
  });
}

/**
 * Lets the user choose a whole folder (all files inside, with their relative
 * paths in `webkitRelativePath`). Supported by all current desktop browsers.
 */
export function pickFolder(): Promise<File[]> {
  return openPicker((input) => {
    input.setAttribute('webkitdirectory', '');
    input.multiple = true;
  });
}

/** Reads a file as text. */
export function readText(file: Blob): Promise<string> {
  return file.text();
}

/** Triggers a download of text content. */
export function downloadText(filename: string, content: string, mime = 'text/plain'): void {
  downloadBlob(filename, new Blob([content], { type: `${mime};charset=utf-8` }));
}

/** Triggers a download of a blob. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
