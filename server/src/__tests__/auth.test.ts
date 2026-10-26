import { afterAll, describe, expect, it } from 'vitest';
import { pool } from '../db/client';
import { call, createFirm, signUp } from './helpers';
import { stopApp } from './server';

afterAll(async () => {
  await stopApp();
  await pool.end();
});

describe('auth', () => {
  it('sign-up returns a session cookie', async () => {
    const { cookie } = await signUp();
    expect(cookie).toContain('better-auth.session_token=');
  });

  it('get-session returns the signed-up user', async () => {
    const { cookie, email } = await signUp();
    const res = await call('GET', '/api/auth/get-session', { cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { email: string } };
    expect(body.user.email).toBe(email);
  });

  it('creating a firm makes it the active organization', async () => {
    const { cookie } = await signUp();
    const firm = await createFirm(cookie, 'Test Firm');
    const res = await call('GET', '/api/auth/get-session', { cookie: firm.cookie });
    const body = (await res.json()) as { session: { activeOrganizationId: string } };
    expect(body.session.activeOrganizationId).toBe(firm.orgId);
    const rows = await pool.query('select role from member where organization_id = $1', [firm.orgId]);
    expect(rows.rows).toEqual([{ role: 'owner' }]);
  });
});
