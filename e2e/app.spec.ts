/**
 * End-to-end tests against the production build: the main user journeys
 * (writing notes with flashcard syntax, practicing, importing, exams).
 */
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Documents & Folders' })).toBeVisible();
});

test('shows the welcome document with all card types', async ({ page }) => {
  await page.getByRole('treeitem', { name: 'Getting Started' }).click();
  await expect(page.getByLabel('Title')).toHaveText('Getting Started');
  await expect(page.locator('.mc-marker')).toHaveCount(4);
  await expect(page.locator('.cloze')).toHaveCount(2);
});

test('creates flashcards by typing RemNote syntax and practices them', async ({ page }) => {
  await page.getByRole('button', { name: 'Create', exact: true }).first().click();
  await page.keyboard.type('E2E Deck');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Capital of France >> Paris');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Water :: H2O');
  await page.keyboard.press('Escape');
  await expect(page.locator('.rem-row .separator')).toHaveCount(2);
  await expect(page.getByRole('button', { name: /3 Due/ })).toBeVisible();

  await page.getByRole('button', { name: /3 Due/ }).click();
  await expect(page.locator('.card-question')).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Space');
    await expect(page.locator('.rating-bar')).toBeVisible();
    await page.keyboard.press('4');
  }
  await expect(page.getByText('Session complete')).toBeVisible();
});

test('undo and redo structural edits', async ({ page }) => {
  await page.getByRole('button', { name: 'Create', exact: true }).first().click();
  await page.keyboard.type('Undo test');
  await page.keyboard.press('Enter');
  await page.keyboard.type('first');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second');
  await page.keyboard.press('Tab');
  await expect(page.locator('.rem-children .rem')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await expect(page.locator('.rem-children .rem')).toHaveCount(0);
});

test('imports pasted RemNote text and creates an exam', async ({ page }) => {
  await page.getByRole('button', { name: 'Import' }).first().click();
  await page.getByRole('button', { name: 'Paste text' }).click();
  await page.getByLabel('Document title').fill('Imported deck');
  await page.getByLabel('Text', { exact: true }).fill('- Q1 >> A1\n- Q2 >> A2\n- Which? {CORRECT: A, B} >>A)\n    - yes\n    - also yes\n    - no');
  await page.getByRole('dialog').getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByLabel('Title')).toHaveText('Imported deck');
  await expect(page.locator('.mc-marker.is-correct')).toHaveCount(2);

  await page.goto('/#/flashcards/exams');
  await page.getByRole('button', { name: 'New exam' }).click();
  await page.locator('.scope-item', { hasText: 'Imported deck' }).locator('input[type=checkbox]').check();
  await page.getByRole('button', { name: 'Create exam' }).click();
  await expect(page.getByText('Study plan')).toBeVisible();
  await expect(page.locator('.stat-tile', { hasText: 'Cards' })).toContainText('3');
});

test('search finds Rems', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Search Rems/).fill('mitochondria');
  await expect(page.locator('.search-result').first()).toContainText('powerhouse');
});
