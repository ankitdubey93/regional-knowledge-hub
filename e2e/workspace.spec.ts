import { expect, test } from '@playwright/test';
import { checkPage, readIds, STATE_USER } from './helpers';

test.use({ storageState: STATE_USER });

// Paths are built inside each test: readIds() needs the setup project to have run first.
const LABELS = [
  'workspace',
  'workspace/new',
  'entity',
  'entity settings',
  'books',
  'reports',
  'reports balance sheet',
  'documents',
  'knowledge',
] as const;

function pathFor(label: (typeof LABELS)[number]): string {
  const { clientId } = readIds();
  switch (label) {
    case 'workspace':
      return '/workspace';
    case 'workspace/new':
      return '/workspace/new';
    case 'entity':
      return `/entities/${clientId}`;
    case 'entity settings':
      return `/entities/${clientId}/settings`;
    case 'books':
      return `/entities/${clientId}/books`;
    case 'reports':
      return `/entities/${clientId}/reports`;
    case 'reports balance sheet':
      return `/entities/${clientId}/reports?tab=bs`;
    case 'documents':
      return `/entities/${clientId}/documents`;
    case 'knowledge':
      return '/knowledge';
  }
}

for (const label of LABELS) {
  test(`signed in: ${label}`, async ({ page }) => {
    const h1 = await checkPage(page, pathFor(label));
    expect(h1).not.toBe('Page not found');

    if (label === 'knowledge') {
      await expect(page.getByRole('heading', { name: 'Ask the Knowledge Hub' })).toBeVisible();
      await expect(page.locator('main').getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(0);
    }
    if (label === 'documents') {
      await expect(page.getByText('engagement-letter.txt')).toBeVisible();
    }
  });
}
