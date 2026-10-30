import { expect, test, type Page } from '@playwright/test';
import { checkPage, STATE_USER } from './helpers';

async function tabTo(page: Page, name: string): Promise<void> {
  const target = page.getByRole('button', { name });
  for (let i = 0; i < 400; i++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error(`Tab never reached "${name}"`);
}

test.describe('signed in', () => {
  test.use({ storageState: STATE_USER });

  test('signed in: audit log', async ({ page }) => {
    expect(await checkPage(page, '/workspace/audit')).toBe('Audit log');
    // auth.setup.ts imports a trial balance and uploads a document, which write events.
    await expect(page.getByText('Imported a trial balance').first()).toBeVisible();
    await page.getByRole('link', { name: 'Back to workspace' }).focus();
    // Do not click Save: retention on the e2e database stays null.
    await tabTo(page, 'Save retention');
  });
});
