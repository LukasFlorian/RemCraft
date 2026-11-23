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
  await page
    .getByLabel('Text', { exact: true })
    .fill(
      '- Q1 >> A1\n- Q2 >> A2\n- Which? {CORRECT: A, B} >>A)\n    - yes\n    - also yes\n    - no',
    );
  await page.getByRole('dialog').getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByLabel('Title')).toHaveText('Imported deck');
  await expect(page.locator('.mc-marker.is-correct')).toHaveCount(2);

  await page.goto('/#/flashcards/exams');
  await page.getByRole('button', { name: 'New exam' }).click();
  await page
    .locator('.scope-item', { hasText: 'Imported deck' })
    .locator('input[type=checkbox]')
    .check();
  await page.getByRole('button', { name: 'Create exam' }).click();
  await expect(page.getByText('Study plan')).toBeVisible();
  await expect(page.locator('.stat-tile', { hasText: 'Cards' })).toContainText('3');
});

test('search finds Rems', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/Search Rems/).fill('mitochondria');
  await expect(page.locator('.search-result').first()).toContainText('powerhouse');
  // The matched word is highlighted (CSS Custom Highlight API).
  await expect
    .poll(() => page.evaluate<number>("CSS.highlights.get('search-hit')?.size ?? 0"))
    .toBeGreaterThan(0);
  const marked = await page.evaluate<string[]>(
    "[...(CSS.highlights.get('search-hit') ?? [])].map((r) => r.toString())",
  );
  expect(marked.map((t) => t.toLowerCase())).toContain('mitochondria');
  // Opening a hit scrolls to it inside its document and highlights it.
  await page.locator('.search-result').first().click();
  const hit = page.locator('.rem.is-search-hit');
  await expect(hit).toContainText('powerhouse');
  await expect(hit).toBeInViewport();
});

test('practice on a phone has no sidebar button over its exit button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/practice');
  await expect(page.getByRole('button', { name: 'Exit practice' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show sidebar' })).toBeHidden();
});

test('a card can be disabled while practising and the toolbar does not stay behind', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Create', exact: true }).first().click();
  await page.keyboard.type('Disable Deck');
  await page.keyboard.press('Enter');
  await page.keyboard.type('One >> 1');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Two >> 2');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /2 Due/ }).click();
  await expect(page.locator('.card-question')).toBeVisible();

  // Editing the card and closing the dialog leaves no editing toolbar.
  await page.getByRole('button', { name: 'Edit card' }).click();
  await page.locator('.modal .rem-text').first().click();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.edit-toolbar')).toHaveCount(0);

  // Disable the first card: only one card is left in the session.
  await page.getByRole('button', { name: 'Disable card' }).click();
  await expect(page.getByText('/ 1')).toBeVisible();
  await page.keyboard.press('Space');
  await page.keyboard.press('4');
  await expect(page.getByText('Session complete')).toBeVisible();
});

test('multi-line answers are graded item by item with one reveal button', async ({ page }) => {
  await page.getByRole('button', { name: 'Create', exact: true }).first().click();
  await page.keyboard.type('Set Deck');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Drei Probleme >>>');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Speicher');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Datenrate');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Kosten');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /1 Due/ }).click();
  await expect(page.getByRole('button', { name: 'Check answer' })).toHaveCount(0);
  await page.getByRole('button', { name: /Show answer/ }).click();
  // Mark one of three items as not known: "Partially recalled" is suggested.
  await page.getByRole('button', { name: /Datenrate/ }).click();
  await expect(page.getByText('2/3 known', { exact: false })).toBeVisible();
  await expect(page.locator('.rating-2')).toHaveClass(/is-suggested/);
});

test('editing a card while practising shows only that card and keeps the focus', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Create', exact: true }).first().click();
  await page.keyboard.type('Edit Deck');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Eins >> 1');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Zwei >> 2');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /2 Due/ }).click();
  await page.getByRole('button', { name: 'Edit card' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.rem')).toHaveCount(1);
  await dialog.locator('.rem-text').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type('abc');
  // All three characters arrived: the editor kept the focus while typing.
  await expect(dialog.locator('.rem').first()).toContainText('abc');
});

test('find and replace in a document with preview and one undo step', async ({ page }) => {
  await page.getByRole('button', { name: 'Create', exact: true }).first().click();
  await page.keyboard.type('Replace Doc');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Hashing nutzt Hash-Funktionen');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Ein Hash >> Streuwert');
  await page.keyboard.press('Escape');

  await page.keyboard.press('ControlOrMeta+Shift+H');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Find', { exact: true }).fill('Hash');
  await dialog.getByLabel('Replace with').fill('Streu');
  await dialog.getByText('Whole word').click();
  // "Hashing" is no whole-word match; "Hash-Funktionen" and "Hash" are.
  await expect(dialog.locator('.replace-list li')).toHaveCount(2);
  // Leave out the first change.
  await dialog.getByLabel('Apply this change').first().uncheck();
  await dialog.getByRole('button', { name: 'Replace 1' }).click();
  await expect(page.locator('.outliner')).toContainText('Ein Streu');
  await expect(page.locator('.outliner')).toContainText('Hashing nutzt Hash-Funktionen');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.outliner')).toContainText('Ein Hash');
});

test('AI editing proposes changes that are previewed and applied in one step', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('remcraft.whatsNewSeen', '9999');
    localStorage.setItem(
      'remcraft.ai',
      JSON.stringify({ baseUrl: 'https://ai.mock.test/v1', apiKey: 'k', model: 'm' }),
    );
  });
  // The model turns the concept card into a basic card and adds a line.
  await page.route('https://ai.mock.test/**', async (route) => {
    const body = route.request().postDataJSON() as { messages: { content: string }[] };
    const prompt = body.messages[1]!.content;
    const ref = /\[(r\d+)\] Hash\s+::\s+Streuwert/.exec(prompt)![1];
    const content = JSON.stringify({
      summary: 'Eine Karte umgestellt.',
      ops: [
        { op: 'update', ref, line: 'Was ist ein Hash? >> Ein Streuwert' },
        { op: 'add', parent: 'r1', after: ref, line: 'Neue Karte >> ja' },
      ],
    });
    await route.fulfill({ json: { choices: [{ message: { content } }] } });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Create', exact: true }).first().click();
  await page.keyboard.type('KI Doc');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Hash :: Streuwert');
  await page.keyboard.press('Escape');

  await page
    .locator('.topbar')
    .getByRole('button', { name: /More|Mehr/ })
    .click();
  await page.getByRole('menuitem', { name: /Revise with AI/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Instruction').fill('Mach normale Karten daraus');
  await dialog.getByRole('button', { name: /Get suggestions/ }).click();
  await expect(dialog.getByText('Eine Karte umgestellt.')).toBeVisible();
  await expect(dialog.locator('.ai-edit-list li')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Apply 2' }).click();
  await expect(page.locator('.outliner')).toContainText('Was ist ein Hash?');
  await expect(page.locator('.outliner')).toContainText('Neue Karte');
});

test('legal page with Impressum, privacy policy and RemNote notice', async ({ page }) => {
  await page.getByRole('button', { name: 'Legal notice & privacy' }).click();
  await expect(page.getByRole('heading', { name: 'Privacy policy' })).toBeVisible();
  await expect(page.getByTestId('remnote-notice')).toContainText('not affiliated with');
  // No operator details in the test build: the page says so instead of showing blanks.
  await expect(page.getByTestId('legal-missing').first()).toBeVisible();
  // Phone width: the long text wraps, nothing scrolls sideways.
  await page.setViewportSize({ width: 390, height: 800 });
  const overflow = await page
    .locator('.main-scroll')
    .first()
    .evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'test-results/legal-390.png' });
});

test('flashcard home rows stay aligned with long titles (phone width)', async ({ page }) => {
  for (const title of ['Kurz', 'Ein ziemlich langer Dokumenttitel über Datenbanksysteme Teil 2']) {
    await page.getByRole('button', { name: 'Create', exact: true }).first().click();
    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Title').press('Enter');
    await page.keyboard.type('Frage >> Antwort');
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/flashcards');
  const lefts = await page
    .locator('.priority-row .tree-icon')
    .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
  expect(lefts.length).toBeGreaterThanOrEqual(3);
  expect(new Set(lefts).size).toBe(1);
});
