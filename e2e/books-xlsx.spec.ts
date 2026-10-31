import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { checkPage, readIds, STATE_USER } from './helpers';

test.use({ storageState: STATE_USER });

const AU_WORKBOOK = fileURLToPath(new URL('../server/src/__tests__/fixtures/xero-au-tb.xlsx', import.meta.url));

test('signed in: the books wizard reads a Xero .xlsx', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  await checkPage(page, `/entities/${readIds().clientId}/books`);

  await page.getByLabel('Trial balance (CSV or Excel .xlsx)').setInputFiles(AU_WORKBOOK);
  await page.getByLabel('As at', { exact: true }).fill('2026-06-30');
  await page.getByLabel('Financial year start').fill('2025-07-01');
  await page.getByRole('button', { name: 'Read file' }).click();

  await expect(page.getByText('Step 2 of 4: Columns')).toBeVisible();
  await expect(page.getByText(/^Read the sheet "/)).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});
