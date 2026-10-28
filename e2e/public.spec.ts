import { expect, test } from '@playwright/test';
import { checkPage } from './helpers';

// Signed out: no storage state is loaded, so every page is checked as an anonymous visitor.
const ROUTES = [
  '/',
  '/knowledge',
  '/knowledge/learn',
  '/knowledge/learn/australia/bas-gst-guide',
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
  '/knowledge/practice/flashcards',
  '/knowledge/practice/coding',
  '/sign-in',
  '/sign-up',
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
