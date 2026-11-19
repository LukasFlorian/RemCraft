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
  await page.getByRole('button', { name: /Gewohnheiten/ }).click();
  await page.getByRole('button', { name: 'Erste Gewohnheit anlegen' }).click();
  await page.getByPlaceholder('z. B. Sport').fill('Sport');
  await page.getByPlaceholder(/Laufen, Krafttraining/).fill('Laufen oder Kraft');
  await page.getByRole('button', { name: 'Speichern' }).click();

  // The detail page opens; tick today.
  await expect(page.getByRole('heading', { name: 'Sport' })).toBeVisible();
  await page.getByRole('button', { name: 'Sport: Als erledigt markieren' }).click();
  await expect(page.getByRole('button', { name: /Sport: Erledigt/ })).toBeVisible();
  await expect(page.locator('.stat-tile', { hasText: 'Aktuelle Serie' })).toContainText('1');

  // A note for today.
  await page.getByRole('button', { name: 'Heute', exact: true }).last().click();
  await page.locator('.modal input').fill('Morgens 5 km');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.locator('.habit-note')).toContainText('Morgens 5 km');

  // A counter habit from the overview.
  await page.getByRole('button', { name: 'Zurück', exact: true }).click();
  await page.getByRole('button', { name: 'Neu' }).click();
  await page.getByPlaceholder('z. B. Sport').fill('Wasser');
  await page.getByRole('button', { name: 'Zähler' }).click();
  await page.locator('label', { hasText: 'Tagesziel' }).locator('input').fill('2');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await page.getByRole('button', { name: 'Zurück', exact: true }).click();
  const water = page.getByTestId('habit-card').filter({ hasText: 'Wasser' });
  await water.getByRole('button', { name: /Wasser: Als erledigt/ }).click();
  await expect(water.locator('.habit-check-num')).toHaveText('1');
  await water.getByRole('button', { name: /Wasser: Als erledigt/ }).click();
  await expect(water.getByRole('button', { name: /Wasser: Erledigt/ })).toBeVisible();

  // Layouts.
  await page.getByRole('tab', { name: 'Checkliste' }).click();
  await expect(page.getByTestId('habit-row')).toHaveCount(2);
  await page.getByRole('tab', { name: 'Kompakt' }).click();
  await expect(page.getByTestId('habit-row')).toHaveCount(2);

  // Statistics.
  await page.getByRole('button', { name: 'Statistik' }).click();
  await expect(page.locator('.habit-table')).toContainText('Sport');
  await expect(page.locator('.habit-table')).toContainText('Wasser');
});

test('habits fit on a phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/habits');
  await page.getByRole('button', { name: 'Erste Gewohnheit anlegen' }).click();
  await page.getByPlaceholder('z. B. Sport').fill('Lesen');
  await page.getByRole('button', { name: 'Messwert' }).click();
  await page.getByPlaceholder('Einheit (km)').fill('Seiten');
  await page.getByRole('button', { name: 'Erinnerung hinzufügen' }).click();
  await page.getByRole('button', { name: 'Speichern' }).click();
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
