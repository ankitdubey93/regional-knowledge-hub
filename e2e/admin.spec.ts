import { expect, test } from '@playwright/test';
import { checkPage, STATE_ADMIN, STATE_PLAIN } from './helpers';

test.describe('platform admin', () => {
  test.use({ storageState: STATE_ADMIN });

  const ROUTES = [
    '/admin',
    '/admin/users',
    '/admin/kb',
    '/admin/kb/new',
    '/admin/kb/search',
    '/admin/facts',
    '/admin/facts/new',
    '/admin/facts/au.gst.rate',
  ];

  for (const path of ROUTES) {
    test(`admin: ${path}`, async ({ page }) => {
      const h1 = await checkPage(page, path);
      expect(h1).not.toBe('Page not found');
    });
  }

  test('admin: a source and its published version', async ({ page }) => {
    const res = await page.request.get('/api/admin/kb/sources');
    expect(res.status(), 'GET /api/admin/kb/sources').toBe(200);
    const body = (await res.json()) as {
      sources: { id: string; publishedVersion: { id: string } | null }[];
    };
    const s = body.sources.find((x) => x.publishedVersion !== null);
    expect(s, 'a source with a published version').toBeDefined();
    if (!s?.publishedVersion) return;

    expect(await checkPage(page, `/admin/kb/sources/${s.id}`)).not.toBe('Page not found');
    expect(await checkPage(page, `/admin/kb/versions/${s.publishedVersion.id}`)).not.toBe('Page not found');
  });
});

test.describe('signed-in non-admin', () => {
  test.use({ storageState: STATE_PLAIN });

  test('non-admin: /admin is Page not found, three loads in a row', async ({ page }) => {
    for (let i = 0; i < 3; i++) {
      expect(await checkPage(page, '/admin')).toBe('Page not found');
    }
  });

  test('non-admin: /admin/facts is Page not found', async ({ page }) => {
    expect(await checkPage(page, '/admin/facts')).toBe('Page not found');
  });
});
