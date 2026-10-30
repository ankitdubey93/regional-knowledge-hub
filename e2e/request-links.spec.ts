import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
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

async function tabToLocator(page: Page, target: Locator): Promise<void> {
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error('Tab never reached the locator');
}

test('signed in: send to client', async ({ page, request }) => {
  const id = await createAuCompany(request);
  const h1 = await checkPage(page, `/entities/${id}/requests`);
  expect(h1).toBe('Requests');
  await expect(page.getByRole('button', { name: 'Send link' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Links sent' })).toBeVisible();

  await page.getByRole('link', { name: 'Back to Requests Co Pty Ltd' }).focus();
  await tabTo(page, 'Send link');
});

test('public: upload page', async ({ page, request }) => {
  const id = await createAuCompany(request);
  const headers = { origin: WEB };
  const listed = await request.get(`/api/clients/${id}/requests`);
  expect(listed.status(), 'list requests').toBe(200);
  const requests = ((await listed.json()) as { requests: { id: string; status: string }[] }).requests;
  const ids = requests.filter((r) => r.status === 'open').slice(0, 2).map((r) => r.id);
  expect(ids.length, 'open requests').toBe(2);

  const created = await request.post(`/api/clients/${id}/request-links`, {
    headers,
    data: { recipientEmail: 'client@example.com', requestIds: ids },
  });
  expect(created.status(), 'create link').toBe(201);
  const url = ((await created.json()) as { url: string }).url;
  const token = url.slice(url.indexOf('/r/') + 3);

  const view = await request.get(`/api/public/requests/${token}`);
  expect(view.status(), 'public view').toBe(200);
  const label = ((await view.json()) as { request: { items: { label: string }[] } }).request.items[0]!.label;

  await page.context().clearCookies();
  const h1 = await checkPage(page, `/r/${token}`);
  expect(h1).toBe('Documents requested');

  const input = page.getByLabel(`File for ${label}`);
  await tabToLocator(page, input);
  await input.setInputFiles({ name: 'bank.txt', mimeType: 'text/plain', buffer: Buffer.from('statement') });
  await page.getByRole('button', { name: `Upload ${label}` }).click();
  await expect(page.getByText('Uploaded. Thank you.')).toBeVisible();
});
