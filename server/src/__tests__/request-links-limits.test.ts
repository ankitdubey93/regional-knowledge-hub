import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.RATE_LIMITS = 'on';
});

import { pool } from '../db/client';
import { setTransportForTests } from '../mail/mailer';
import { ORIGIN, call, createFirm, signUp } from './helpers';
import { startApp, stopApp } from './server';
import { testEnv } from './testEnv';

async function ownerQuery(sql: string, params: unknown[] = []): Promise<pg.QueryResult> {
  const adminPool = new pg.Pool({ connectionString: testEnv.DATABASE_ADMIN_URL });
  try {
    return await adminPool.query(sql, params);
  } finally {
    await adminPool.end();
  }
}

let token = '';
let itemId = '';

async function upload(n: number): Promise<Response> {
  return fetch(`${await startApp()}/api/public/requests/${token}/items/${itemId}/upload`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/octet-stream', 'x-filename': encodeURIComponent(`file-${n}.txt`) },
    body: new TextEncoder().encode(`upload ${n}`),
  });
}

beforeAll(async () => {
  await startApp();
  setTransportForTests({ sent: [] });
  const u = await signUp();
  const firm = await createFirm(u.cookie, 'Limits Firm');
  const created = await call('POST', '/api/clients', {
    cookie: firm.cookie,
    body: { name: 'Limits Pty Ltd', jurisdiction: 'AU', entityType: 'company', fyEndMonth: 6 },
  });
  const clientId = ((await created.json()) as { client: { id: string } }).client.id;
  const req = await call('POST', `/api/clients/${clientId}/requests`, { cookie: firm.cookie, body: { label: 'Limit item', dueOn: null } });
  itemId = ((await req.json()) as { request: { id: string } }).request.id;
  const link = await call('POST', `/api/clients/${clientId}/request-links`, {
    cookie: firm.cookie,
    body: { recipientEmail: 'limits@example.com', requestIds: [itemId] },
  });
  expect(link.status).toBe(201);
  const { url } = (await link.json()) as { url: string };
  token = url.slice(url.lastIndexOf('/r/') + 3);
}, 60_000);

beforeEach(async () => {
  await ownerQuery("delete from rate_bucket where key like 'public%'");
});

afterAll(async () => {
  setTransportForTests(null);
  await ownerQuery('DELETE FROM rate_bucket');
  await stopApp();
  await pool.end();
});

describe('public request limits', () => {
  it('PL1 the 21st public upload in an hour gets 429', async () => {
    for (let n = 1; n <= 20; n += 1) {
      const res = await upload(n);
      expect([200, 201]).toContain(res.status);
    }
    const res = await upload(21);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('PL2 the 121st public view in an hour gets 429', async () => {
    const get = async () => fetch(`${await startApp()}/api/public/requests/${token}`, { headers: { origin: ORIGIN } });
    for (let n = 0; n < 120; n += 1) expect((await get()).status).toBe(200);
    expect((await get()).status).toBe(429);
  });
});
