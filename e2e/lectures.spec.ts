/**
 * End-to-end tests of the lecture features (Fokus port) and sharing:
 * demo course → live lecture → analysis, and sharing a course as a file
 * that is imported again as an independent copy.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/#/lectures');
  await page.getByRole('button', { name: 'Demo-Kurs erzeugen' }).click();
  // The demo opens its slide deck in lecture mode.
  await expect(page.getByRole('button', { name: 'Vorlesung starten' })).toBeVisible({
    timeout: 20_000,
  });
});

test('runs a lecture on the demo deck and shows the analysis', async ({ page }) => {
  await expect(
    page.locator('[data-w="current"] canvas, [data-w="current"] img').first(),
  ).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-w="current"] .widget-title')).toHaveText('Folie 2');
  await page.getByRole('button', { name: 'Vorlesung starten' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Starten/ })
    .click();
  await page.keyboard.press('w');
  await expect(page.getByRole('button', { name: /Wichtig/ })).toHaveClass(/active|btn-primary/);
  await page.getByRole('button', { name: 'Abschließen' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('heading', { name: 'Zeit pro Folie' })).toBeVisible();
  await expect(page.getByText('Abschweifen bemerkt').first()).toBeVisible();
});

test('shares a course as a file and imports it as a copy', async ({ page }) => {
  await page
    .getByRole('treeitem', { name: /Demo-Kurs/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Teilen' }).click();
  await page.getByRole('button', { name: 'Nur Karteikarten' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Als Datei' }).click(),
  ]);
  const file = await download.path();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Import' }).first().click();
  await page.getByRole('button', { name: /Freigabe/ }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: /Choose file/ }).click(),
  ]);
  await chooser.setFiles({
    name: 'kurs.remcraft.json',
    mimeType: 'application/json',
    buffer: readFileSync(file!),
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Import', exact: true }).click();
  // Two independent course folders now exist.
  await expect(page.getByRole('treeitem', { name: /Demo-Kurs/ })).toHaveCount(2);
});

test('text boxes keep their text, can be deselected and move in one undo step', async ({
  page,
}) => {
  const slide = page.locator('[data-w="current"] .boxes-layer');
  const box = (n: number) => slide.locator('.text-box').nth(n);
  await page.getByTitle('Textfeld (T)').click();
  const area = await slide.boundingBox();
  if (!area) throw new Error('no slide');

  // First box: type, then create a second box elsewhere - the text must stay.
  await page.mouse.click(area.x + area.width * 0.2, area.y + area.height * 0.2);
  await expect(slide.locator('textarea')).toBeFocused();
  await page.keyboard.type('Erstes');
  await page.mouse.click(area.x + area.width * 0.2, area.y + area.height * 0.6);
  await expect(slide.locator('textarea')).toBeFocused();
  await page.keyboard.type('Zweites');
  await page.getByTitle('Auswählen / Text markieren (Esc)').click();
  await expect(box(0)).toHaveText('Erstes');
  await expect(box(1)).toHaveText('Zweites');

  // Select, then click on an empty spot: the box is deselected.
  await box(0).click();
  await expect(box(0)).toHaveClass(/selected/);
  await page.mouse.click(area.x + area.width * 0.8, area.y + area.height * 0.9);
  await expect(box(0)).not.toHaveClass(/selected/);

  // Drag in many steps; a single undo restores the start position.
  const before = await box(0).boundingBox();
  await page.mouse.move(before!.x + 10, before!.y + 10);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(before!.x + 10 + i * 15, before!.y + 10);
  await page.mouse.up();
  const after = await box(0).boundingBox();
  expect(after!.x).toBeGreaterThan(before!.x + 100);
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+z');
  await expect
    .poll(async () => Math.round((await box(0).boundingBox())!.x))
    .toBe(Math.round(before!.x));
});

test('a share link shows the slides as images with their notes', async ({ page }) => {
  // Export the demo course as a snapshot file (with the slide PDF embedded) ...
  await page
    .getByRole('treeitem', { name: /Demo-Kurs/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Teilen' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Als Datei' }).click(),
  ]);
  const snapshot = JSON.parse(readFileSync((await download.path())!, 'utf8')) as {
    files: { id: string; mimeType: string; data?: string }[];
  };
  expect(snapshot.files.length).toBeGreaterThan(0);

  // ... and serve it from a mocked Supabase as a published share.
  const files = new Map(snapshot.files.map((f) => [f.id, f] as const));
  await page.route('https://share.mock.test/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/rpc/get_share'))
      return route.fulfill({
        json: { ...snapshot, files: snapshot.files.map(({ data: _, ...f }) => f) },
      });
    const file = files.get(url.pathname.split('/').pop()!);
    if (url.pathname.includes('/storage/') && file?.data)
      return route.fulfill({
        body: Buffer.from(file.data, 'base64'),
        contentType: file.mimeType,
      });
    return route.fulfill({ json: {} });
  });
  await page.evaluate(() => localStorage.setItem('remcraft.whatsNewSeen', '9999'));
  await page.evaluate(() =>
    localStorage.setItem(
      'remcraft.backend',
      JSON.stringify({ supabaseUrl: 'https://share.mock.test', supabaseAnonKey: 'anon' }),
    ),
  );
  // The backend configuration is read at start-up.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/s/tok123');
  await page.reload();
  await expect(page.getByRole('button', { name: /In meine Wissensbasis klonen/ })).toBeVisible();
  const firstSlide = page.locator('.snap-slide').first();
  await expect(firstSlide.locator('img')).toBeVisible({ timeout: 15_000 });
  expect(
    await firstSlide
      .locator('img')
      .evaluate((img) => (img as { naturalWidth: number }).naturalWidth),
  ).toBeGreaterThan(100);
  await page.screenshot({ path: 'test-results/share-mobile.png' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: 'test-results/share-desktop.png' });
});

test('looking at a card’s slide does not restart the practice session', async ({ page }) => {
  await page.goto('/#/practice?scope=global');
  const progress = page.locator('.practice-top .col div').last();
  // Answer one card, then find a card that came from a slide.
  await page.keyboard.press('Space');
  await page.keyboard.press('4');
  const slideLink = page.getByRole('button', { name: /Folie \d+/ });
  for (let i = 0; i < 15 && !(await slideLink.isVisible()); i++) {
    await page.keyboard.press('Space');
    await page.keyboard.press('4');
  }
  await expect(slideLink).toBeVisible();
  const before = await progress.textContent();
  await slideLink.click();
  await page.getByRole('button', { name: 'Weiter üben' }).click();
  await expect(progress).toHaveText(before!);
});

test('a card can be edited right in the lecture cards widget', async ({ page }) => {
  const widget = page.locator('.slide-cards');
  await widget.getByRole('button', { name: 'Alle Folien' }).click();
  await widget.getByRole('button', { name: 'Karte bearbeiten' }).click();
  const editor = page.getByTestId('slide-card-editor');
  await expect(editor).toBeVisible();
  // Append to the front of the card (first line of the embedded outliner).
  // The outliner shows text until a Rem is clicked; then the editor opens there.
  await editor.locator('.rem-row').first().click();
  await expect(editor.locator('.ProseMirror').first()).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.type(' (bearbeitet)');
  await editor.getByRole('button', { name: 'Fertig' }).click();
  // The edited text is on the card (front or back, so reveal it).
  await widget.getByRole('button', { name: 'Aufdecken' }).click();
  await expect(widget.locator('.mini-card')).toContainText('(bearbeitet)');
});
