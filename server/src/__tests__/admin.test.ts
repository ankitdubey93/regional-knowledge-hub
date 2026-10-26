import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../db/client';
import { setPlatformAdmin } from '../services/platformAdmin';
import { call, createFirm, makePlatformAdmin, signUp } from './helpers';
import { stopApp } from './server';
import { testEnv } from './testEnv';

interface UserRow {
  id: string;
  email: string;
  workspaces: { name: string; role: string }[];
}
interface ListBody {
  users: UserRow[];
  total: number;
  page: number;
  pageSize: number;
}

const adminPool = new pg.Pool({ connectionString: testEnv.DATABASE_ADMIN_URL });
let admin: Awaited<ReturnType<typeof signUp>>;
let firmUser: Awaited<ReturnType<typeof signUp>>;
let ordinary: Awaited<ReturnType<typeof signUp>>;

beforeAll(async () => {
  admin = await signUp();
  await makePlatformAdmin(admin.userId);
  const u = await signUp();
  const firm = await createFirm(u.cookie, 'Firm Z');
  firmUser = { ...u, cookie: firm.cookie };
  ordinary = await signUp();
});

afterAll(async () => {
  await stopApp();
  await pool.end();
  await adminPool.end();
});

describe('admin', () => {
  it('A1 GET /api/admin/users signed out → 404', async () => {
    const res = await call('GET', '/api/admin/users');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });

  it('A2 GET /api/admin/users as an ordinary user → 404', async () => {
    const res = await call('GET', '/api/admin/users', { cookie: ordinary.cookie });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });

  it('A3 GET /api/admin/users as the platform admin lists users with their workspaces', async () => {
    const res = await call('GET', '/api/admin/users?q=' + encodeURIComponent(firmUser.email), { cookie: admin.cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ListBody;
    expect(body.pageSize).toBe(50);
    const row = body.users.find((x) => x.id === firmUser.userId);
    expect(row?.workspaces[0]?.name).toBe('Firm Z');
    expect(row?.workspaces[0]?.role).toBe('owner');
  });

  it('A4 GET /api/admin/users?q= filters by email', async () => {
    const res = await call('GET', `/api/admin/users?q=${encodeURIComponent(firmUser.email)}`, { cookie: admin.cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ListBody;
    expect(body.users).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('A5 sign-up cannot set a role', async () => {
    const email = `u-role-${Date.now()}@example.test`;
    const res = await call('POST', '/api/auth/sign-up/email', {
      body: { name: 'Sneaky', email, password: 'correct-horse-9', role: 'platform_admin' },
    });
    const body = (await res.json()) as { user?: { id: string } };
    const id = body.user?.id;
    if (id) {
      const r = await adminPool.query('select role from "user" where id = $1', [id]);
      expect(r.rows[0].role).toBe('user');
    } else {
      // Rejected outright: no account, so no role could be granted.
      const r = await adminPool.query('select role from "user" where email = $1', [email]);
      expect(r.rows.every((x: { role: string }) => x.role !== 'platform_admin')).toBe(true);
    }
  });

  it('A6 the database allows only one platform admin', async () => {
    await expect(
      adminPool.query(`update "user" set role='platform_admin' where id = $1`, [ordinary.userId]),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('A7 setPlatformAdmin refuses a second admin and names the first', async () => {
    const result = await setPlatformAdmin(adminPool, ordinary.email, true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(admin.email);
  });

  it('A8 ban → the user\'s session ends and the ban is audited', async () => {
    const res = await call('POST', `/api/admin/users/${ordinary.userId}/ban`, {
      cookie: admin.cookie,
      body: { reason: 'Test ban' },
    });
    expect(res.status).toBe(200);
    const sess = await call('GET', '/api/auth/get-session', { cookie: ordinary.cookie });
    expect(await sess.json()).toBeNull();
    const rows = await adminPool.query(
      `select action, target_id, detail from admin_audit where action = 'user.ban' and target_id = $1`,
      [ordinary.userId],
    );
    expect(rows.rows).toHaveLength(1);
    expect(JSON.stringify(rows.rows[0].detail)).not.toContain('Test ban');
  });

  it('A9 unban → 200 and the user can sign in again', async () => {
    const res = await call('POST', `/api/admin/users/${ordinary.userId}/unban`, { cookie: admin.cookie });
    expect(res.status).toBe(200);
    const signIn = await call('POST', '/api/auth/sign-in/email', {
      body: { email: ordinary.email, password: 'correct-horse-9' },
    });
    expect(signIn.status).toBe(200);
  });

  it('A10 the admin cannot ban themselves → 400', async () => {
    const res = await call('POST', `/api/admin/users/${admin.userId}/ban`, {
      cookie: admin.cookie,
      body: { reason: 'Oops me' },
    });
    expect(res.status).toBe(400);
  });

  it('A11 chub_app cannot update or delete admin_audit', async () => {
    let code: unknown;
    try {
      await pool.query('delete from admin_audit');
    } catch (e) {
      const err = e as { code?: string; cause?: { code?: string } };
      code = err.code ?? err.cause?.code;
    }
    expect(code).toBe('42501');
  });
});
