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
