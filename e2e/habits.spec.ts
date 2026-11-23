/**
 * Habits (beta feature; the e2e build is the beta build): create, tick off,
 * counters, layouts, detail page with notes, statistics, share card.
 */
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Documents & Folders' })).toBeVisible();
});

test('create a habit, tick today, switch layouts, add a note', async ({ page }) => {
  await page.getByRole('button', { name: /Habits/ }).click();
  await page.getByRole('button', { name: 'Create your first habit' }).click();
  await page.getByPlaceholder('e.g. Sport').fill('Sport');
  await page.getByPlaceholder(/running, strength training/).fill('Laufen oder Kraft');
  await page.getByRole('button', { name: 'Save' }).click();

  // The detail page opens; tick today.
  await expect(page.getByRole('heading', { name: 'Sport' })).toBeVisible();
  await page.getByRole('button', { name: 'Sport: Mark as done' }).click();
  await expect(page.getByRole('button', { name: /Sport: Done/ })).toBeVisible();
  await expect(page.locator('.stat-tile', { hasText: 'Current streak' })).toContainText('1');

  // A note for today.
  await page.getByRole('button', { name: 'Today', exact: true }).last().click();
  await page.locator('.modal input').fill('Morgens 5 km');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.habit-note')).toContainText('Morgens 5 km');

  // A counter habit from the overview.
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'New' }).click();
  await page.getByPlaceholder('e.g. Sport').fill('Wasser');
  await page.getByRole('button', { name: 'Counter' }).click();
  await page.locator('label', { hasText: 'Daily target' }).locator('input').fill('2');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  const water = page.getByTestId('habit-card').filter({ hasText: 'Wasser' });
  await water.getByRole('button', { name: /Wasser: Mark as done/ }).click();
  await expect(water.locator('.habit-check-num')).toHaveText('1');
  await water.getByRole('button', { name: /Wasser: Mark as done/ }).click();
  await expect(water.getByRole('button', { name: /Wasser: Done/ })).toBeVisible();

  // Layouts.
  await page.getByRole('tab', { name: 'Checklist' }).click();
  await expect(page.getByTestId('habit-row')).toHaveCount(2);
  await page.getByRole('tab', { name: 'Compact' }).click();
  await expect(page.getByTestId('habit-row')).toHaveCount(2);

  // Statistics.
  await page.getByRole('button', { name: 'Statistics' }).click();
  await expect(page.locator('.habit-table')).toContainText('Sport');
  await expect(page.locator('.habit-table')).toContainText('Wasser');
});

test('habits fit on a phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/habits');
  await page.getByRole('button', { name: 'Create your first habit' }).click();
  await page.getByPlaceholder('e.g. Sport').fill('Lesen');
  await page.getByRole('button', { name: 'Measurement' }).click();
  await page.getByPlaceholder('Unit (km)').fill('Seiten');
  await page.getByRole('button', { name: 'Add reminder' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Lesen' })).toBeVisible();
  for (const path of ['/#/habits', '/#/habits/stats']) {
    await page.goto(path);
    await page.waitForTimeout(200);
    const overflow = await page
      .locator('.main-scroll')
      .first()
      .evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await page.goto('/#/habits');
  await page.screenshot({ path: 'test-results/habits-390.png' });
});

test('reordering shows where the habit lands', async ({ page }) => {
  await page.goto('/#/habits');
  for (const name of ['Eins', 'Zwei', 'Drei']) {
    await page
      .getByRole('button', { name: /^New$|Create your first habit/ })
      .first()
      .click();
    await page.getByPlaceholder('e.g. Sport').fill(name);
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
  }
  const titles = page.locator('.habit-card strong');
  await expect(titles).toHaveText(['Eins', 'Zwei', 'Drei']);

  // Grab "Drei" and move it above "Eins".
  const handle = page.getByTestId('habit-card').filter({ hasText: 'Drei' }).getByLabel('Move');
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const first = (await page.getByTestId('habit-card').first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, first.y + 5, { steps: 12 });
  await expect(page.getByTestId('habit-drop-line')).toHaveCount(1);
  // The line sits right above "Eins".
  const line = (await page.getByTestId('habit-drop-line').boundingBox())!;
  expect(line.y).toBeLessThan(first.y);
  await page.mouse.up();
  await expect(page.getByTestId('habit-drop-line')).toHaveCount(0);
  await expect(titles).toHaveText(['Drei', 'Eins', 'Zwei']);

  // Keyboard: focus the handle of "Drei" and move it down.
  await page.getByTestId('habit-card').filter({ hasText: 'Drei' }).getByLabel('Move').focus();
  await page.keyboard.press('ArrowDown');
  await expect(titles).toHaveText(['Eins', 'Drei', 'Zwei']);
});
