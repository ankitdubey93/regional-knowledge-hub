import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';

export const STATE_USER = fileURLToPath(new URL('./.auth/user.json', import.meta.url));
export const STATE_ADMIN = fileURLToPath(new URL('./.auth/admin.json', import.meta.url));
export const STATE_PLAIN = fileURLToPath(new URL('./.auth/plain.json', import.meta.url));
export const IDS_FILE = fileURLToPath(new URL('./.auth/ids.json', import.meta.url));

export interface E2eIds {
  clientId: string;
  importId: string;
}

export function readIds(): E2eIds {
  const raw: unknown = JSON.parse(readFileSync(IDS_FILE, 'utf8'));
  const o = (raw ?? {}) as Record<string, unknown>;
  if (typeof o.clientId !== 'string' || typeof o.importId !== 'string') {
    throw new Error('e2e ids missing: run the setup project');
  }
  return { clientId: o.clientId, importId: o.importId };
}

// Loads a page and checks it: heading shown, no sideways scroll, keyboard reaches main, no console errors.
export async function checkPage(page: Page, path: string): Promise<string> {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(path);
  await expect(page.locator('main h1').first()).toBeVisible();
  await page.waitForLoadState('networkidle');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0);

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  const focusable = await page
    .locator('main')
    .locator('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')
    .count();
  if (focusable > 0) {
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => document.getElementById('main')?.contains(document.activeElement) ?? false),
      `${path} keyboard reaches main`,
    ).toBe(true);
  }

  expect(errors, `${path} console errors`).toEqual([]);
  return (await page.locator('main h1').first().textContent()) ?? '';
}
