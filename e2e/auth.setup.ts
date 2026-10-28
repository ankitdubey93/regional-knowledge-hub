import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test as setup } from '@playwright/test';
import { E2E_ENV, WEB } from './env';
import { IDS_FILE, STATE_ADMIN, STATE_PLAIN, STATE_USER } from './helpers';

const PASSWORD = 'correct-horse-9';

setup('create the e2e users, entity, import, document and admin', async ({ playwright }) => {
  mkdirSync(dirname(IDS_FILE), { recursive: true });
  const newCtx = () => playwright.request.newContext({ baseURL: WEB, extraHTTPHeaders: { origin: WEB } });

  // User: a practice with one AU client, a trial-balance import and a document.
  const user = await newCtx();
  let res = await user.post('/api/auth/sign-up/email', {
    data: { name: 'E2E User', email: 'e2e-user@example.test', password: PASSWORD },
  });
  expect(res.status(), 'sign up user').toBe(200);
  res = await user.post('/api/auth/organization/create', {
    data: { name: 'E2E Practice', slug: 'e2e-practice', kind: 'practice' },
  });
  expect(res.status(), 'create practice').toBe(200);
  const organizationId = ((await res.json()) as { id: string }).id;
  res = await user.post('/api/auth/organization/set-active', { data: { organizationId } });
  expect(res.status(), 'set active').toBe(200);
  res = await user.post('/api/clients', {
    data: { name: 'Browser Books Pty Ltd', jurisdiction: 'AU', entityType: 'company', fyEndMonth: 6 },
  });
  expect(res.status(), 'create client').toBe(201);
  const clientId = ((await res.json()) as { client: { id: string } }).client.id;
  res = await user.post(`/api/clients/${clientId}/ledger/imports`, {
    data: {
      csvText: readFileSync(new URL('./fixtures/au-tb.csv', import.meta.url), 'utf8'),
      originalName: 'tb.csv',
      source: 'xero',
      currency: 'AUD',
      asAt: '2026-06-30',
      periodStart: '2025-07-01',
      mapping: { headerRow: 4, code: 1, name: 0, type: 2, debit: 3, credit: 4, balance: null },
    },
  });
  expect(res.status(), 'import trial balance').toBe(201);
  const importId = ((await res.json()) as { import: { id: string } }).import.id;
  res = await user.post(`/api/clients/${clientId}/documents`, {
    data: Buffer.from('Engagement letter for Browser Books Pty Ltd.\n'),
    headers: { 'content-type': 'text/plain', 'X-Filename': 'engagement-letter.txt' },
  });
  expect(res.status(), 'upload document').toBe(201);
  await user.storageState({ path: STATE_USER });
  writeFileSync(IDS_FILE, JSON.stringify({ clientId, importId }));
  await user.dispose();

  // Admin: promoted through the CLI script, never by SQL.
  const admin = await newCtx();
  res = await admin.post('/api/auth/sign-up/email', {
    data: { name: 'E2E Admin', email: 'e2e-admin@example.test', password: PASSWORD },
  });
  expect(res.status(), 'sign up admin').toBe(200);
  execFileSync('node', ['--import', 'tsx', 'scripts/admin-role.ts', 'promote', 'e2e-admin@example.test'], {
    cwd: 'server',
    env: { ...process.env, ...E2E_ENV },
    stdio: 'inherit',
  });
  res = await admin.get('/api/admin/kb/sources');
  expect(res.status(), 'admin role took effect').toBe(200);
  await admin.storageState({ path: STATE_ADMIN });
  await admin.dispose();

  // Plain: signed in, no workspace.
  const plain = await newCtx();
  res = await plain.post('/api/auth/sign-up/email', {
    data: { name: 'E2E Plain', email: 'e2e-plain@example.test', password: PASSWORD },
  });
  expect(res.status(), 'sign up plain').toBe(200);
  await plain.storageState({ path: STATE_PLAIN });
  await plain.dispose();
});
