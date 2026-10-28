import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { WEB } from './env';
import { checkPage, STATE_USER } from './helpers';

test.use({ storageState: STATE_USER });

// An AU company with a quarterly BAS, with its requests generated through the API.
async function createAuCompany(request: APIRequestContext): Promise<string> {
  const headers = { origin: WEB };
  const created = await request.post('/api/clients', {
    headers,
    data: {
      name: 'Requests Co Pty Ltd',
      jurisdiction: 'AU',
      entityType: 'company',
      fyEndMonth: 6,
      taxRegistered: true,
      taxPeriod: 'quarterly',
    },
  });
  expect(created.status(), 'create AU client').toBe(201);
  const id = ((await created.json()) as { client: { id: string } }).client.id;
  const generated = await request.post(`/api/clients/${id}/requests/generate`, { headers, data: {} });
  expect(generated.status(), 'generate requests').toBe(200);
  return id;
}

async function tabTo(page: Page, name: string): Promise<void> {
  const target = page.getByRole('button', { name });
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error(`Tab never reached "${name}"`);
}

test('signed in: requests', async ({ page, request }) => {
  const id = await createAuCompany(request);
  const h1 = await checkPage(page, `/entities/${id}/requests`);
  expect(h1).toBe('Requests');
  await expect(page.getByRole('button', { name: 'Generate from profile' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();

  await page.getByRole('link', { name: 'Back to Requests Co Pty Ltd' }).focus();
  await tabTo(page, 'Generate from profile');
  await tabTo(page, 'Add request');
});
