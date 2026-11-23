/**
 * Interface language: English by default for an English browser, German for
 * a German one, and switchable in Settings → Appearance.
 */
import { expect, test } from '@playwright/test';

test('switching the language in the settings translates the app', async ({ page }) => {
  await page.goto('/#/settings/general');
  await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
  await page.getByRole('radio', { name: 'Deutsch' }).click();
  // The app reloads in German.
  await expect(page.getByRole('heading', { name: 'Darstellung' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Einstellungen' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Deutsch' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  // And back.
  await page.getByRole('radio', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
});

test.describe('German browser', () => {
  test.use({ locale: 'de-DE' });

  test('starts in German and fits on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#/flashcards');
    await expect(page.getByRole('heading', { name: 'Karteikarten' })).toBeVisible();
    await expect(page.getByText('Tagesziel').first()).toBeVisible();
    for (const path of ['/#/flashcards', '/#/settings/general', '/#/legal']) {
      await page.goto(path);
      await page.waitForTimeout(200);
      const overflow = await page
        .locator('.main-scroll')
        .first()
        .evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});
