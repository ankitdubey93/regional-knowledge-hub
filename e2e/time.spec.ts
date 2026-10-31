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

test('signed in: time', async ({ page, request }) => {
  const headers = { origin: WEB };
  const clear = await request.delete('/api/time/timer', { headers });
  expect([200, 404], 'clear timer').toContain(clear.status());

  const created = await request.post('/api/clients', {
    headers,
    data: {
      name: 'Time Co Pty Ltd',
      jurisdiction: 'AU',
      entityType: 'company',
      fyEndMonth: 6,
      taxRegistered: true,
      taxPeriod: 'quarterly',
    },
  });
  expect(created.status(), 'create AU client').toBe(201);
  const clientId = ((await created.json()) as { client: { id: string } }).client.id;

  const title = `Time BAS ${test.info().project.name}`;
  const engagement = await request.post(`/api/clients/${clientId}/engagements`, {
    headers,
    data: { templateId: 'seed:bas', title, dueOn: '2026-11-28', periodEnd: '2026-09-30' },
  });
  expect(engagement.status(), 'create engagement').toBe(201);
  const engagementId = ((await engagement.json()) as { engagement: { id: string } }).engagement.id;

  const entry = await request.post('/api/time', {
    headers,
    data: { clientId, engagementId, workDate: '2026-11-02', minutes: 90 },
  });
  expect(entry.status(), 'create time entry').toBe(201);

  expect(await checkPage(page, '/time?week=2026-11-02')).toBe('Time');
  await expect(page.getByText('Week of 2 November 2026')).toBeVisible();

  await tabTo(page, 'Start timer');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Stop timer', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stop timer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start timer', exact: true })).toBeVisible();

  await tabTo(page, 'Add entry');

  expect(await checkPage(page, `/engagements/${engagementId}`)).toBe(title);
  await tabTo(page, 'Start timer on this engagement');

  const after = await request.delete('/api/time/timer', { headers });
  expect([200, 404], 'cleanup timer').toContain(after.status());
});
