/**
 * Dragging files from the computer into the app (issue #16): text into the
 * sidebar, a PDF onto a folder, a card file onto an open lecture.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/** A file to drop: text, or binary as base64. */
interface DropFile {
  name: string;
  type: string;
  text?: string;
  base64?: string;
}

/**
 * Drags files over an element (checks the hint) and drops them.
 *
 * Args:
 *   page: The page.
 *   target: Element to drop on.
 *   files: Files to drop.
 *
 * Returns:
 *   The hint shown while dragging.
 */
async function dropFiles(page: Page, target: Locator, files: DropFile[]): Promise<string> {
  // Built in the page (DataTransfer/File only exist there).
  const dt = await page.evaluateHandle(`(() => {
    const dt = new DataTransfer();
    for (const f of ${JSON.stringify(files)}) {
      const body = f.base64
        ? Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0))
        : f.text;
      dt.items.add(new File([body], f.name, { type: f.type }));
    }
    return dt;
  })()`);
  await target.dispatchEvent('dragenter', { dataTransfer: dt });
  await target.dispatchEvent('dragover', { dataTransfer: dt });
  const hint = (await page.getByTestId('file-drop-hint').textContent()) ?? '';
  await target.dispatchEvent('drop', { dataTransfer: dt });
  await expect(page.getByTestId('file-drop-hint')).toHaveCount(0);
  return hint;
}

/** A minimal one-page PDF (pdf.js rebuilds the missing cross-reference table). */
function tinyPdf(): string {
  const pdf = [
    '%PDF-1.4',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 400 225] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    '4 0 obj << /Length 44 >> stream',
    'BT /F1 24 Tf 40 150 Td (Hallo Folie) Tj ET',
    'endstream endobj',
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    'trailer << /Root 1 0 R >>',
    '%%EOF',
  ].join('\n');
  return Buffer.from(pdf).toString('base64');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Documents & Folders' })).toBeVisible();
});

test('a Markdown file dropped on the sidebar becomes a document', async ({ page }) => {
  const hint = await dropFiles(page, page.locator('.sidebar-scroll'), [
    { name: 'Vokabeln.md', type: 'text/markdown', text: '- Haus >> house\n- Baum >> tree\n' },
  ]);
  expect(hint).toContain('top level');
  await expect(page.getByLabel('Title')).toHaveText('Vokabeln');
  await expect(page.locator('.rem-row .separator')).toHaveCount(2);
  await expect(page.getByRole('treeitem', { name: 'Vokabeln' })).toBeVisible();
});

test('a PDF dropped on a folder becomes a slide deck inside it', async ({ page }) => {
  await page.getByRole('button', { name: 'Folder', exact: true }).click();
  await page.getByLabel('Title').fill('Kurs');
  await page.getByLabel('Title').press('Escape');
  const folderRow = page.getByRole('treeitem', { name: 'Kurs' });
  await expect(folderRow).toBeVisible();

  const hint = await dropFiles(page, folderRow, [
    { name: 'VL01.pdf', type: 'application/pdf', base64: tinyPdf() },
  ]);
  expect(hint).toContain('Kurs');
  // The deck opens; it lives inside the folder.
  await expect(page.getByLabel('Title')).toHaveText('VL01', { timeout: 20_000 });
  await expect(page.locator('.breadcrumbs, .doc-path').first()).toContainText('Kurs');
});

test('a card file dropped on an open lecture goes onto its slides', async ({ page }) => {
  await page.goto('/#/lectures');
  await page.getByRole('button', { name: 'Create demo course' }).click();
  await expect(page.getByRole('button', { name: 'Start lecture' })).toBeVisible({
    timeout: 20_000,
  });
  const deckId = /#\/lecture\/([^/?]+)/.exec(page.url())![1]!;
  // Export the demo deck's cards from its document page ...
  await page.goto(`/#/rem/${deckId}`);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export cards' }).click(),
  ]);
  const text = readFileSync((await download.path())!, 'utf8');
  // ... and drop the file onto the lecture.
  await page.goto(`/#/lecture/${deckId}`);
  const lecture = page.locator('.lecture');
  await expect(lecture).toBeVisible();
  const hint = await dropFiles(page, lecture, [
    { name: 'demo.cards.json', type: 'application/json', text },
  ]);
  expect(hint).toContain('Karten');
  await expect(page.getByText(/cards, \d+ explanations imported/)).toBeVisible();
});
