import { expect, test, type Page } from '@playwright/test';
import { WEB } from './env';
import { checkPage, STATE_USER } from './helpers';

test.use({ storageState: STATE_USER });

async function tabTo(page: Page, name: string): Promise<void> {
  const target = page.getByRole('button', { name });
  for (let i = 0; i < 400; i++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error(`Tab never reaches "${name}"`);
}

test('signed in: profitability', async ({ page, request }) => {
  const headers = { origin: WEB };
  const clientName = `Profit Co ${test.info().project.name}`;

  const settings = await request.patch('/api/billing/settings', {
    headers,
    data: {
      jurisdiction: 'AU',
      legalName: 'E2E Books Pty Ltd',
      address: '1 Test St\nSydney NSW 2000',
      taxRegistered: true,
      taxNumber: '12345678901',
    },
  });
  expect(settings.status(), 'billing settings').toBe(200);

  const rate = await request.patch('/api/billing/rates', {
    headers,
    data: { userId: null, currency: 'AUD', centsPerHour: 15000, costCentsPerHour: 6000 },
  });
  expect(rate.status(), 'firm default rate and cost').toBe(200);

  const created = await request.post('/api/clients', {
    headers,
    data: {
      name: clientName,
      jurisdiction: 'AU',
      entityType: 'company',
      fyEndMonth: 6,
      taxRegistered: true,
      taxPeriod: 'quarterly',
    },
  });
  expect(created.status(), 'create AU client').toBe(201);
  const clientId = ((await created.json()) as { client: { id: string } }).client.id;

  const pricing = await request.patch(`/api/clients/${clientId}/pricing`, {
    headers,
    data: { model: 'hourly', currency: 'AUD' },
  });
  expect(pricing.status(), 'client pricing').toBe(200);

  const entry = await request.post('/api/time', {
    headers,
    data: { clientId, workDate: '2026-10-05', minutes: 90 },
  });
  expect(entry.status(), 'create time entry').toBe(201);

  const draft = await request.post('/api/invoices', {
    headers,
    data: { clientId, from: '2026-10-01', to: '2026-10-31' },
  });
  expect(draft.status(), 'create draft').toBe(201);
  const id = ((await draft.json()) as { invoice: { id: string } }).invoice.id;

  const issued = await request.post(`/api/invoices/${id}/issue`, {
    headers,
    data: { issuedOn: '2026-10-31' },
  });
  expect(issued.status(), 'issue invoice').toBe(200);

  expect(await checkPage(page, '/profitability?from=2026-10-01&to=2026-10-31&currency=AUD')).toBe('Profitability');
  await expect(page.getByRole('rowheader', { name: clientName })).toBeVisible();
  await tabTo(page, 'Show');

  expect(await checkPage(page, '/workspace/billing')).toBe('Billing');
  await tabTo(page, 'Save rate');
});
