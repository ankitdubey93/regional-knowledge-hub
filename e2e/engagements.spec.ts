import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { WEB } from './env';
import { checkPage, STATE_USER } from './helpers';

test.use({ storageState: STATE_USER });

interface Setup {
  clientId: string;
  engagementId: string;
  templateId: string;
}

// An AU quarterly company with one engagement from the BAS seed, and a firm copy of the year-end seed.
async function setUp(request: APIRequestContext): Promise<Setup> {
  const headers = { origin: WEB };
  const created = await request.post('/api/clients', {
    headers,
    data: {
      name: 'Engagements Co Pty Ltd',
      jurisdiction: 'AU',
      entityType: 'company',
      fyEndMonth: 6,
      taxRegistered: true,
      taxPeriod: 'quarterly',
    },
  });
  expect(created.status(), 'create AU client').toBe(201);
  const clientId = ((await created.json()) as { client: { id: string } }).client.id;

  const engagement = await request.post(`/api/clients/${clientId}/engagements`, {
    headers,
    data: { templateId: 'seed:bas', title: 'BAS Q1', dueOn: '2026-11-28', periodEnd: '2026-09-30' },
  });
  expect(engagement.status(), 'create engagement').toBe(201);
  const engagementId = ((await engagement.json()) as { engagement: { id: string } }).engagement.id;

  const template = await request.post('/api/engagement-templates', { headers, data: { seedId: 'year-end' } });
  expect(template.status(), 'copy template').toBe(201);
  const templateId = ((await template.json()) as { template: { id: string } }).template.id;
  return { clientId, engagementId, templateId };
}

async function tabTo(page: Page, name: string): Promise<void> {
  const target = page.getByRole('button', { name });
  for (let i = 0; i < 400; i++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error(`Tab never reached "${name}"`);
}

test('signed in: engagements', async ({ page, request }) => {
  const { clientId, engagementId, templateId } = await setUp(request);

  expect(await checkPage(page, '/engagements')).toBe('Engagements');
  expect(await checkPage(page, `/engagements/${engagementId}`)).toBe('BAS Q1');

  await page.getByRole('link', { name: 'Back to engagements' }).focus();
  await tabTo(page, 'Delete engagement');
  await tabTo(page, 'Add task');

  expect(await checkPage(page, `/entities/${clientId}/engagements`)).toBe('Engagements');
  await page.getByRole('link', { name: 'Back to Engagements Co Pty Ltd' }).focus();
  await tabTo(page, 'Create engagement');

  expect(await checkPage(page, '/workspace/templates')).toBe('Templates');
  expect(await checkPage(page, `/workspace/templates/${templateId}`)).toBe('Year-end accounts');
});
