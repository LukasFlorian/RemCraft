/**
 * Opens the browser's file picker programmatically.
 */

/**
 * @param accept MIME types / extensions accepted.
 * @param multiple Allow several files.
 * @returns The chosen files (empty when cancelled).
 */
export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      resolve([...(input.files ?? [])]);
      input.remove();
    });
    // Resolve with nothing if the dialog is dismissed (focus returns to the window).
    window.addEventListener('focus', () => setTimeout(() => !input.files?.length && resolve([]), 500), { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

/** Reads a file as text. */
export function readText(file: Blob): Promise<string> {
  return file.text();
}

/** Triggers a download of text content. */
export function downloadText(filename: string, content: string, mime = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
