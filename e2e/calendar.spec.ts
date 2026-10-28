import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { WEB } from './env';
import { checkPage, STATE_USER } from './helpers';

test.use({ storageState: STATE_USER });

// A UK company set up as in the component-test fixture, created through the API.
async function createUkCompany(request: APIRequestContext): Promise<string> {
  const headers = { origin: WEB };
  const created = await request.post('/api/clients', {
    headers,
    data: {
      name: 'Calendar Co Ltd',
      jurisdiction: 'UK',
      entityType: 'company',
      fyEndMonth: 3,
      taxRegistered: true,
      taxPeriod: 'quarterly',
    },
  });
  expect(created.status(), 'create UK client').toBe(201);
  const id = ((await created.json()) as { client: { id: string } }).client.id;
  const patched = await request.patch(`/api/clients/${id}`, {
    headers,
    data: { timezone: 'Europe/London', registeredOn: '2025-05-14', vatStaggerMonth: 3, mtdItsa: false },
  });
  expect(patched.status(), 'patch calendar fields').toBe(200);
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

test('signed in: calendar', async ({ page, request }) => {
  const id = await createUkCompany(request);
  const h1 = await checkPage(page, `/entities/${id}/calendar`);
  expect(h1).toBe('Calendar');
  await expect(page.getByText('Due dates are not moved for weekends or public holidays.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save calendar details' })).toBeVisible();

  await page.getByRole('link', { name: 'Back to dashboard' }).focus();
  await tabTo(page, 'Download calendar (.ics)');
  await tabTo(page, 'Save calendar details');
});

test('signed in: workspace with a due-soon panel', async ({ page, request }) => {
  await createUkCompany(request);
  const h1 = await checkPage(page, '/workspace');
  expect(h1).not.toBe('Page not found');
  await expect(page.getByRole('heading', { name: 'Due in the next 30 days' })).toBeVisible();
});
