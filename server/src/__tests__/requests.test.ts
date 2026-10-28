import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import factsJson from '@chub/shared/seed/facts.json';
import { INTAKE_RULES } from '@chub/shared/data/intakeRules';
import { factsSchema } from '@chub/shared/data/schemas';
import { DEADLINE_FACT_KEYS, addDays, deadlineRulesFrom, obligationsFor, type CalendarProfile } from '@chub/shared/utils/deadlines';
import { datedRequestsFor, intakeItemsFor } from '@chub/shared/utils/intake';
import { auth } from '../auth';
import { pool } from '../db/client';
import { documentRequest } from '../db/schema';
import { withOrg } from '../db/withOrg';
import { seedFacts } from '../kb/seedFacts';
import { GENERATE_WINDOW_DAYS, generateRequests } from '../services/requestService';
import type { RequestView } from '../types/requests';
import { call, createFirm, mergeCookies, signUp } from './helpers';
import { startApp, stopApp } from './server';

const all = factsSchema.parse(factsJson);

let cookieA = '';
let cookieB = '';
let memberCookie = '';
let orgA = '';
let orgB = '';
let userA = '';
let quarterly = '';
let fixed = '';
let mixed = '';
let bClient = '';
let firstId = '';
let manualId = '';

const quarterlyBody = { jurisdiction: 'AU', entityType: 'company', fyEndMonth: 6, taxRegistered: true, taxPeriod: 'quarterly' } as const;

async function makeClient(cookie: string, body: Record<string, unknown>): Promise<string> {
  const res = await call('POST', '/api/clients', { cookie, body });
  if (res.status !== 201) throw new Error(`create client failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { client: { id: string } }).client.id;
}

async function failure(p: Promise<unknown>): Promise<string> {
  const err: unknown = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(Error);
  const cause = (err as Error).cause;
  return cause instanceof Error ? cause.message : (err as Error).message;
}

const url = (clientId: string, suffix = '') => `/api/clients/${clientId}/requests${suffix}`;

beforeAll(async () => {
  await startApp();
  await seedFacts(Object.fromEntries(DEADLINE_FACT_KEYS.map((k) => [k, all[k]!])), new Date().toISOString().slice(0, 10));
  const a = await signUp();
  const firmA = await createFirm(a.cookie, 'Requests Firm A');
  cookieA = firmA.cookie;
  orgA = firmA.orgId;
  userA = a.userId;
  const b = await signUp();
  const firmB = await createFirm(b.cookie, 'Requests Firm B');
  cookieB = firmB.cookie;
  orgB = firmB.orgId;

  const m = await signUp();
  await auth.api.addMember({ body: { userId: m.userId, organizationId: firmA.orgId, role: 'member' } });
  const active = await call('POST', '/api/auth/organization/set-active', {
    cookie: m.cookie,
    body: { organizationId: firmA.orgId },
  });
  if (active.status !== 200) throw new Error(`member set-active failed: ${active.status}`);
  memberCookie = mergeCookies(m.cookie, active);

  quarterly = await makeClient(cookieA, { name: 'Requests Quarterly Pty Ltd', ...quarterlyBody });
  fixed = await makeClient(cookieA, { name: 'Requests Fixed Pty Ltd', ...quarterlyBody });
  mixed = await makeClient(cookieA, { name: 'Requests Mixed', jurisdiction: 'AU+UK', entityType: 'company', fyEndMonth: 6 });
  bClient = await makeClient(cookieB, { name: 'Requests B Pty Ltd', jurisdiction: 'AU', entityType: 'company', fyEndMonth: 6 });
}, 60_000);

afterAll(async () => {
  await stopApp();
  await pool.end();
});

describe('requests', () => {
  it('RQ1 an empty list', async () => {
    const res = await call('GET', url(quarterly), { cookie: cookieA });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ requests: [] });
  });

  let firstCount = 0;
  it('RQ2 generate over HTTP', async () => {
    const res = await call('POST', url(quarterly, '/generate'), { cookie: cookieA });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { created: number; requests: RequestView[] };
    expect(body.created).toBeGreaterThan(0);
    expect(body.requests.length).toBe(body.created);
    expect(body.requests.every((r) => r.status === 'open')).toBe(true);
    firstId = body.requests[0]!.id;
    firstCount = body.requests.length;
  });

  it('RQ3 generate is idempotent', async () => {
    const res = await call('POST', url(quarterly, '/generate'), { cookie: cookieA });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { created: number; requests: RequestView[] };
    expect(body.created).toBe(0);
    expect(body.requests.length).toBe(firstCount);
  });

  it('RQ4 a received item survives regeneration', async () => {
    const res = await call('PATCH', url(quarterly, `/${firstId}`), { cookie: cookieA, body: { status: 'received' } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { request: RequestView }).request.status).toBe('received');
    const again = await call('POST', url(quarterly, '/generate'), { cookie: cookieA });
    const body = (await again.json()) as { created: number; requests: RequestView[] };
    expect(body.created).toBe(0);
    expect(body.requests.find((r) => r.id === firstId)?.status).toBe('received');
  });

  it('RQ5 generate with a fixed date matches the engine', async () => {
    const out = await generateRequests(orgA, userA, fixed, new Date('2026-10-28T00:00:00Z'));
    const profile: CalendarProfile = { ...quarterlyBody, taxRegistered: true, registeredOn: null, vatStaggerMonth: null, mtdItsa: false };
    const obligations = obligationsFor(profile, deadlineRulesFrom((k) => all[k]), '2026-10-28', addDays('2026-10-28', GENERATE_WINDOW_DAYS));
    const expected = intakeItemsFor(profile, INTAKE_RULES).length + datedRequestsFor(profile, INTAKE_RULES, obligations).length;
    expect('created' in out).toBe(true);
    if (!('created' in out)) return;
    expect(out.created).toBe(expected);
    const bas = out.requests.find((r) => r.obligationId === 'au_bas:2026-09-30');
    expect(bas).toBeDefined();
    expect(bas!.dueOn).not.toBeNull();
    expect(bas!.dueOn! < '2026-10-28').toBe(true);
  });

  it('RQ6 add a manual request', async () => {
    const res = await call('POST', url(quarterly), { cookie: cookieA, body: { label: 'Signed engagement letter', dueOn: '2026-11-30' } });
    expect(res.status).toBe(201);
    const { request } = (await res.json()) as { request: RequestView };
    expect(request.source).toBe('manual');
    expect(request.itemId.startsWith('manual.')).toBe(true);
    expect(request.why).toBe('');
    expect(request.dueOn).toBe('2026-11-30');
    manualId = request.id;
  });

  it('RQ7 an empty label is rejected', async () => {
    const res = await call('POST', url(quarterly), { cookie: cookieA, body: { label: '  ', dueOn: null } });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'Invalid input' });
  });

  it('RQ8 an unknown status is rejected', async () => {
    const res = await call('PATCH', url(quarterly, `/${firstId}`), { cookie: cookieA, body: { status: 'lost' } });
    expect(res.status).toBe(400);
  });

  it('RQ9 a member can update but not delete', async () => {
    const patch = await call('PATCH', url(quarterly, `/${firstId}`), { cookie: memberCookie, body: { status: 'waived' } });
    expect(patch.status).toBe(200);
    const del = await call('DELETE', url(quarterly, `/${firstId}`), { cookie: memberCookie });
    expect(del.status).toBe(403);
    expect(await del.json()).toEqual({ error: 'Only firm owners and admins can delete requests' });
  });

  it('RQ10 an owner deletes', async () => {
    const del = await call('DELETE', url(quarterly, `/${firstId}`), { cookie: cookieA });
    expect(del.status).toBe(204);
    const list = await call('GET', url(quarterly), { cookie: cookieA });
    const { requests } = (await list.json()) as { requests: RequestView[] };
    expect(requests.some((r) => r.id === firstId)).toBe(false);
    const again = await call('DELETE', url(quarterly, `/${firstId}`), { cookie: cookieA });
    expect(again.status).toBe(404);
    expect(await again.json()).toEqual({ error: 'Request not found' });
  });

  it('RQ11 a two-country entity cannot generate', async () => {
    const res = await call('POST', url(mixed, '/generate'), { cookie: cookieA });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'Set the entity type, and use one country, to generate requests' });
  });
});

describe('document_request isolation', () => {
  it('DR1 the bare pool sees no requests', async () => {
    const r = await pool.query('select count(*)::int as n from document_request');
    expect(r.rows[0].n).toBe(0);
  });

  it("DR2 withOrg(orgB) sees none of firm A's requests", async () => {
    expect(await withOrg(orgB, (tx) => tx.select().from(documentRequest))).toHaveLength(0);
    const rows = await withOrg(orgA, (tx) => tx.select().from(documentRequest).where(eq(documentRequest.orgId, orgA)));
    expect(rows.length).toBeGreaterThan(0);
  });

  it("DR3 inserting with another firm's org_id fails", async () => {
    const msg = await failure(
      withOrg(orgA, (tx) =>
        tx.insert(documentRequest).values({ orgId: orgB, clientId: quarterly, itemId: 'manual.x', label: 'x', source: 'manual', createdBy: userA }),
      ),
    );
    expect(msg).toMatch(/row-level security/);
  });

  it("DR4 a request for another firm's client fails", async () => {
    const msg = await failure(
      withOrg(orgA, (tx) =>
        tx.insert(documentRequest).values({ orgId: orgA, clientId: bClient, itemId: 'manual.y', label: 'y', source: 'manual', createdBy: userA }),
      ),
    );
    expect(msg).toMatch(/foreign key/);
  });

  it('DR5 an obligation request needs an obligation id and a date', async () => {
    const msg = await failure(
      withOrg(orgA, (tx) =>
        tx.insert(documentRequest).values({ orgId: orgA, clientId: quarterly, itemId: 'au.x', label: 'x', source: 'obligation', obligationId: null, createdBy: userA }),
      ),
    );
    expect(msg).toMatch(/document_request_obligation_check/);
  });

  it("DR6 firm B gets 404 on every route for firm A's entity", async () => {
    const results = [
      await call('GET', url(quarterly), { cookie: cookieB }),
      await call('POST', url(quarterly, '/generate'), { cookie: cookieB }),
      await call('POST', url(quarterly), { cookie: cookieB, body: { label: 'Nope', dueOn: null } }),
      await call('PATCH', url(quarterly, `/${manualId}`), { cookie: cookieB, body: { status: 'received' } }),
      await call('DELETE', url(quarterly, `/${manualId}`), { cookie: cookieB }),
    ];
    expect(results.map((r) => r.status)).toEqual([404, 404, 404, 404, 404]);
  });
});
