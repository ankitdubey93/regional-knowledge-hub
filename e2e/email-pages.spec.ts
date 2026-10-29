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

test.describe('signed out', () => {
  test('signed out: email pages', async ({ page }) => {
    expect(await checkPage(page, '/forgot-password')).toBe('Reset your password');
    await page.getByLabel('Email').focus();
    await tabTo(page, 'Send reset link');

    expect(await checkPage(page, '/reset-password?token=x')).toBe('Choose a new password');
    await page.getByLabel('New password').focus();
    await tabTo(page, 'Set new password');

    expect(await checkPage(page, '/check-email')).toBe('Check your email');
    expect(await checkPage(page, '/accept-invitation/abc')).toBe('Join a workspace');
  });
});

test.describe('signed in', () => {
  test.use({ storageState: STATE_USER });

  test('signed in: members', async ({ page }) => {
    expect(await checkPage(page, '/workspace/members')).toBe('Members');
    await page.getByRole('link', { name: 'Back to workspace' }).focus();
    await tabTo(page, 'Send invitation');
  });
});
