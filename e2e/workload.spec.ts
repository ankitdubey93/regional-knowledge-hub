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
  throw new Error(`Tab never reached "${name}"`);
}

test('signed in: board and workload', async ({ page, request }) => {
  const headers = { origin: WEB };
  const created = await request.post('/api/clients', {
    headers,
    data: {
      name: 'Board Co Pty Ltd',
      jurisdiction: 'AU',
      entityType: 'company',
      fyEndMonth: 6,
      taxRegistered: true,
      taxPeriod: 'quarterly',
    },
  });
  expect(created.status(), 'create AU client').toBe(201);
  const clientId = ((await created.json()) as { client: { id: string } }).client.id;

  const title = `Board BAS ${test.info().project.name}`;
  const engagement = await request.post(`/api/clients/${clientId}/engagements`, {
    headers,
    data: { templateId: 'seed:bas', title, dueOn: '2026-11-28', periodEnd: '2026-09-30' },
  });
  expect(engagement.status(), 'create engagement').toBe(201);

  const tz = await request.patch('/api/workload/timezone', { headers, data: { timezone: 'Australia/Sydney' } });
  expect(tz.status(), 'set firm timezone').toBe(200);

  expect(await checkPage(page, '/board')).toBe('Board');
  await page.getByRole('link', { name: 'Back to engagements' }).focus();
  await tabTo(page, `Move ${title} right`);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'In progress' }).getByRole('link', { name: title })).toBeVisible();
  await expect(page.getByRole('combobox', { name: `Status of ${title}` })).toBeFocused();

  expect(await checkPage(page, '/workload')).toBe('Workload');
  await page.getByRole('link', { name: 'Back to engagements' }).focus();
  await tabTo(page, 'Save firm timezone');
});
