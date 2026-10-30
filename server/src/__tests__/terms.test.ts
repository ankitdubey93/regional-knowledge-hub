import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { LEGAL_VERSION } from '@chub/shared/lib/legal';
import { afterAll, describe, expect, it } from 'vitest';
import { call } from './helpers';
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

const SELECT = 'select terms_version, terms_accepted_at from "user" where email = $1';
const MESSAGE = 'Accept the current terms of service and privacy notice to create an account.';

afterAll(async () => {
  await stopApp();
});

describe('terms acceptance at sign-up', () => {
  it('TA1 sign-up without termsVersion is refused', async () => {
    await startApp();
    const email = `ta1-${randomUUID()}@example.test`;
    const res = await call('POST', '/api/auth/sign-up/email', { body: { name: 'No Terms', email, password: 'correct-horse-9' } });
    expect(res.status).toBe(400);
    expect((await ownerQuery(SELECT, [email])).rowCount).toBe(0);
  });

  it('TA2 sign-up with an old termsVersion is refused with the message', async () => {
    await startApp();
    const email = `ta2-${randomUUID()}@example.test`;
    const res = await call('POST', '/api/auth/sign-up/email', {
      body: { name: 'Old Terms', email, password: 'correct-horse-9', termsVersion: '2020-01-01' },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message?: string };
    expect(body.message).toBe(MESSAGE);
    expect((await ownerQuery(SELECT, [email])).rowCount).toBe(0);
  });

  it('TA3 sign-up with the current version records it and the time', async () => {
    await startApp();
    const started = Date.now();
    const email = `ta3-${randomUUID()}@example.test`;
    const res = await call('POST', '/api/auth/sign-up/email', {
      body: { name: 'Good Terms', email, password: 'correct-horse-9', termsVersion: LEGAL_VERSION },
    });
    expect(res.status).toBe(200);
    const r = await ownerQuery(SELECT, [email]);
    expect(r.rows[0].terms_version).toBe(LEGAL_VERSION);
    const at = new Date(r.rows[0].terms_accepted_at as string).getTime();
    expect(Math.abs(at - started)).toBeLessThan(60_000);
  });
});
