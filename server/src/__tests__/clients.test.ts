import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth } from '../auth';
import { pool } from '../db/client';
import { client } from '../db/schema';
import { PROFILE_MESSAGES } from '../types/clients';
import { withOrg } from '../db/withOrg';
import { call, createFirm, mergeCookies, signUp } from './helpers';
import { stopApp } from './server';

interface ClientBody {
  client: { id: string; name: string; notes: string; orgId: string };
}

let cookieA = '';
let orgA = '';
let cookieB = '';
let orgB = '';
let loneCookie = '';
let memberCookie = '';
let acmeId = '';

beforeAll(async () => {
  const a = await signUp();
  const firmA = await createFirm(a.cookie, 'Firm A');
  cookieA = firmA.cookie;
  orgA = firmA.orgId;

  const b = await signUp();
  const firmB = await createFirm(b.cookie, 'Firm B');
  cookieB = firmB.cookie;
  orgB = firmB.orgId;

  loneCookie = (await signUp()).cookie;

  const m = await signUp();
  await auth.api.addMember({ body: { userId: m.userId, organizationId: orgA, role: 'member' } });
  const active = await call('POST', '/api/auth/organization/set-active', {
    cookie: m.cookie,
    body: { organizationId: orgA },
  });
  if (active.status !== 200) throw new Error(`member set-active failed: ${active.status}`);
  memberCookie = mergeCookies(m.cookie, active);
});

afterAll(async () => {
  await stopApp();
  await pool.end();
});

describe('clients', () => {
  it('GET /api/clients without a session → 401', async () => {
    const res = await call('GET', '/api/clients');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Sign in required' });
  });

  it('GET /api/clients with no active firm → 403', async () => {
    const res = await call('GET', '/api/clients', { cookie: loneCookie });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'No active firm' });
  });

  it('POST /api/clients creates a client → 201 and it is listed', async () => {
    const res = await call('POST', '/api/clients', {
      cookie: cookieA,
      body: { name: 'Acme Pty Ltd', jurisdiction: 'AU', entityType: 'company', fyEndMonth: 6, entities: ['Jane Citizen'] },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as ClientBody;
    expect(body.client.name).toBe('Acme Pty Ltd');
    expect(body.client.notes).toBe('');
    acmeId = body.client.id;
    const list = await call('GET', '/api/clients', { cookie: cookieA });
    const listed = (await list.json()) as { clients: { id: string }[] };
    expect(listed.clients.map((c) => c.id)).toContain(acmeId);
  });

  it('POST /api/clients with an empty name → 400', async () => {
    const res = await call('POST', '/api/clients', { cookie: cookieA, body: { name: '', jurisdiction: 'AU', entityType: 'company', fyEndMonth: 6 } });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Invalid input');
  });

  it('POST /api/clients ignores orgId in the body', async () => {
    const res = await call('POST', '/api/clients', {
      cookie: cookieA,
      body: { name: 'Beta Ltd', jurisdiction: 'UK', entityType: 'company', fyEndMonth: 3, orgId: orgB },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as ClientBody;
    expect(body.client.orgId).toBe(orgA);
  });

  it("firm B cannot read firm A's client → 404", async () => {
    const res = await call('GET', `/api/clients/${acmeId}`, { cookie: cookieB });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Client not found' });
  });

  it("firm B cannot update or delete firm A's client → 404", async () => {
    const patch = await call('PATCH', `/api/clients/${acmeId}`, { cookie: cookieB, body: { name: 'Hacked' } });
    expect(patch.status).toBe(404);
    const del = await call('DELETE', `/api/clients/${acmeId}`, { cookie: cookieB });
    expect(del.status).toBe(404);
    const res = await call('GET', `/api/clients/${acmeId}`, { cookie: cookieA });
    const body = (await res.json()) as ClientBody;
    expect(body.client.name).toBe('Acme Pty Ltd');
  });

  it("firm B's list does not include firm A's clients", async () => {
    const res = await call('GET', '/api/clients', { cookie: cookieB });
    const body = (await res.json()) as { clients: unknown[] };
    expect(body.clients).toEqual([]);
  });

  it('GET /api/clients/not-a-uuid → 404', async () => {
    const res = await call('GET', '/api/clients/not-a-uuid', { cookie: cookieA });
    expect(res.status).toBe(404);
  });

  it('PATCH with an empty body → 400', async () => {
    const res = await call('PATCH', `/api/clients/${acmeId}`, { cookie: cookieA, body: {} });
    expect(res.status).toBe(400);
  });

  it('a member cannot delete a client → 403', async () => {
    const res = await call('DELETE', `/api/clients/${acmeId}`, { cookie: memberCookie });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Only firm owners and admins can delete clients' });
  });

  it('the owner can delete a client → 204, then 404', async () => {
    const del = await call('DELETE', `/api/clients/${acmeId}`, { cookie: cookieA });
    expect(del.status).toBe(204);
    const again = await call('DELETE', `/api/clients/${acmeId}`, { cookie: cookieA });
    expect(again.status).toBe(404);
  });

  it('the app role sees no client rows without app.org_id', async () => {
    const res = await call('POST', '/api/clients', { cookie: cookieA, body: { name: 'Gamma Ltd', jurisdiction: 'AU', entityType: 'company', fyEndMonth: 6 } });
    expect(res.status).toBe(201);
    const rows = await pool.query('select count(*)::int as n from client');
    expect(rows.rows[0].n).toBe(0);
  });

  it('withOrg cannot insert a row for another firm', async () => {
    // Drizzle wraps the Postgres error in a DrizzleQueryError; the RLS message is on its cause.
    const err: unknown = await withOrg(orgB, (tx) =>
      tx.insert(client).values({ orgId: orgA, name: 'X', jurisdiction: 'AU', createdBy: 'test' }),
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).cause).toBeInstanceOf(Error);
    expect(((err as Error).cause as Error).message).toMatch(/row-level security/);
  });

  it('the app role is not a superuser and cannot bypass RLS', async () => {
    const rows = await pool.query('select rolsuper, rolbypassrls from pg_roles where rolname = current_user');
    expect(rows.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });
});

describe('client profile', () => {
  const base = { notes: '', entityType: 'company', fyEndMonth: 6 };

  async function postClient(body: Record<string, unknown>): Promise<Response> {
    return call('POST', '/api/clients', { cookie: cookieA, body: { name: 'Profile Co', ...base, ...body } });
  }

  async function messages(res: Response): Promise<string[]> {
    const body = (await res.json()) as { issues: { message: string }[] };
    return body.issues.map((i) => i.message);
  }

  it('a trust in the UK → 400', async () => {
    const res = await postClient({ jurisdiction: 'UK', entityType: 'trust', fyEndMonth: 3 });
    expect(res.status).toBe(400);
    expect(await messages(res)).toContain(PROFILE_MESSAGES.trustOutsideAu);
  });

  it('an LLP in Australia → 400', async () => {
    const res = await postClient({ jurisdiction: 'AU', entityType: 'llp' });
    expect(res.status).toBe(400);
    expect(await messages(res)).toContain(PROFILE_MESSAGES.llpOutsideUk);
  });

  it('registered with no return period → 400', async () => {
    const res = await postClient({ jurisdiction: 'AU', taxRegistered: true });
    expect(res.status).toBe(400);
    expect(await messages(res)).toContain(PROFILE_MESSAGES.periodMissing);
  });

  it('a return period without registration → 400', async () => {
    const res = await postClient({ jurisdiction: 'AU', taxPeriod: 'quarterly' });
    expect(res.status).toBe(400);
    expect(await messages(res)).toContain(PROFILE_MESSAGES.periodWithoutRegistration);
  });

  it('fyEndMonth 13 → 400', async () => {
    const res = await postClient({ jurisdiction: 'AU', fyEndMonth: 13 });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('Invalid input');
  });

  it('PATCH that makes a trust UK → 400 and the row is unchanged', async () => {
    const created = await postClient({ jurisdiction: 'AU', entityType: 'trust' });
    expect(created.status).toBe(201);
    const { client: row } = (await created.json()) as ClientBody;
    const patch = await call('PATCH', `/api/clients/${row.id}`, { cookie: cookieA, body: { jurisdiction: 'UK' } });
    expect(patch.status).toBe(400);
    expect(await messages(patch)).toContain(PROFILE_MESSAGES.trustOutsideAu);
    const got = await call('GET', `/api/clients/${row.id}`, { cookie: cookieA });
    const body = (await got.json()) as { client: { jurisdiction: string } };
    expect(body.client.jurisdiction).toBe('AU');
  });

  it('the database rejects a UK trust even without the API', async () => {
    const err: unknown = await withOrg(orgA, (tx) =>
      tx.insert(client).values({ orgId: orgA, name: 'X', jurisdiction: 'UK', entityType: 'trust', createdBy: 'test' }),
    ).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect(((err as Error).cause as Error).message).toMatch(/client_entity_jurisdiction_check/);
  });

  it('the database allows one self row per workspace', async () => {
    const insertSelf = () =>
      withOrg(orgA, (tx) =>
        tx.insert(client).values({ orgId: orgA, name: 'Self', jurisdiction: 'AU', isSelf: true, createdBy: 'test' }),
      );
    await insertSelf();
    const err: unknown = await insertSelf().then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect(((err as Error).cause as { code?: string }).code).toBe('23505');
  });
});
