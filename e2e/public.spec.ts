import { expect, test } from '@playwright/test';
import { checkPage } from './helpers';

// Signed out: no storage state is loaded, so every page is checked as an anonymous visitor.
const ROUTES = [
  '/',
  '/knowledge',
  '/knowledge/learn',
  '/knowledge/learn/australia/bas-gst-guide',
  '/knowledge/learn/uk/making-tax-digital',
  '/knowledge/compare',
  '/knowledge/laws',
  '/knowledge/tools',
  '/knowledge/tools/journal',
  '/knowledge/tools/tax',
  '/knowledge/tools/depreciation',
  '/knowledge/tools/inventory',
  '/knowledge/tools/company-size',
  '/knowledge/practice',
  '/knowledge/practice/quiz/australia/bas-gst-guide',
  '/knowledge/practice/quiz/uk/making-tax-digital',
  '/knowledge/practice/flashcards',
  '/knowledge/practice/coding',
  '/sign-in',
  '/sign-up',
  '/legal/privacy',
  '/legal/terms',
  '/legal/processing',
  '/legal/subprocessors',
];

for (const path of ROUTES) {
  test(`signed out: ${path}`, async ({ page }) => {
    const h1 = await checkPage(page, path);
    expect(h1).not.toBe('Page not found');
  });
}

test('signed out: an unknown URL shows Page not found', async ({ page }) => {
  expect(await checkPage(page, '/no-such-page')).toBe('Page not found');
});

test('signed out: /knowledge asks you to sign in', async ({ page }) => {
  await checkPage(page, '/knowledge');
  await expect(page.locator('main').getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
});

test('signed out: sign-up shows the region and the terms box', async ({ page }) => {
  await checkPage(page, '/sign-up');
  await expect(page.getByText("Your firm's data will be stored in Australia.")).toBeVisible();
  const box = page.getByRole('checkbox');
  await expect(box).toBeVisible();
  for (let i = 0; i < 10; i++) {
    if (await box.evaluate((el) => el === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(box).toBeFocused();
});
