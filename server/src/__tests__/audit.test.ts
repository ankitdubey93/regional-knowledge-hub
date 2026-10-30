import { randomUUID } from 'node:crypto';
import { and, asc, eq, gt } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AU_TB_CSV } from '@chub/shared/fixtures/tb';
import { auth } from '../auth';
import { pool } from '../db/client';
import { auditEvent } from '../db/schema';
import { withOrg } from '../db/withOrg';
import { call, createFirm, mergeCookies, ORIGIN, setActive, signUp } from './helpers';
import { startApp, stopApp } from './server';
import { testEnv } from './testEnv';

let cookieA = '';
let cookieB = '';
let memberCookie = '';
let orgA = '';
let orgB = '';
let userA = '';
let emailA = '';
let clientId = '';

const auBody = {
  csvText: AU_TB_CSV,
  originalName: 'tb.csv',
  source: 'xero',
  currency: 'AUD',
  asAt: '2026-06-30',
  periodStart: '2025-07-01',
  mapping: { headerRow: 4, code: 1, name: 0, type: 2, debit: 3, credit: 4, balance: null },
};

async function makeClient(name: string): Promise<string> {
  const res = await call('POST', '/api/clients', {
    cookie: cookieA,
    body: { name, jurisdiction: 'AU', entityType: 'company', fyEndMonth: 6 },
  });
  if (res.status !== 201) throw new Error(`create client failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { client: { id: string } }).client.id;
}

async function upload(cookie: string, cid: string, name: string, bytes: Uint8Array): Promise<Response> {
  return fetch(`${await startApp()}/api/clients/${cid}/documents`, {
    method: 'POST',
    headers: { origin: ORIGIN, cookie, 'x-filename': encodeURIComponent(name), 'content-type': 'application/octet-stream' },
    body: bytes,
  });
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

async function ownerQuery(sql: string, params: unknown[] = []): Promise<pg.QueryResult> {
  const adminPool = new pg.Pool({ connectionString: testEnv.DATABASE_ADMIN_URL });
  try {
    return await adminPool.query(sql, params);
  } finally {
    await adminPool.end();
  }
}

function eventsOf(orgId: string) {
  return withOrg(orgId, (tx) => tx.select().from(auditEvent).where(eq(auditEvent.orgId, orgId)).orderBy(asc(auditEvent.id)));
}

async function maxId(orgId: string): Promise<number> {
  const all = await eventsOf(orgId);
  return all[all.length - 1]?.id ?? 0;
}

function newEvents(orgId: string, since: number) {
  return withOrg(orgId, (tx) =>
    tx.select().from(auditEvent).where(and(eq(auditEvent.orgId, orgId), gt(auditEvent.id, since))).orderBy(asc(auditEvent.id)),
  );
}

async function memberIdOf(userId: string, orgId: string): Promise<string> {
  const r = await pool.query<{ id: string }>('select id from member where user_id = $1 and organization_id = $2', [userId, orgId]);
  const id = r.rows[0]?.id;
  if (!id) throw new Error('member not found');
  return id;
}

beforeAll(async () => {
  await startApp();
  const a = await signUp();
  const firmA = await createFirm(a.cookie, 'Audit Firm A');
  cookieA = firmA.cookie;
  orgA = firmA.orgId;
  userA = a.userId;
  emailA = a.email;
  const b = await signUp();
  const firmB = await createFirm(b.cookie, 'Audit Firm B');
  cookieB = firmB.cookie;
  orgB = firmB.orgId;
  clientId = await makeClient('Audit Co');

  const m = await signUp();
  await auth.api.addMember({ body: { userId: m.userId, organizationId: orgA, role: 'member' } });
  const active = await call('POST', '/api/auth/organization/set-active', { cookie: m.cookie, body: { organizationId: orgA } });
  if (active.status !== 200) throw new Error(`member set-active failed: ${active.status}`);
  memberCookie = mergeCookies(m.cookie, active);
}, 60_000);

afterAll(async () => {
  await stopApp();
  await pool.end();
});

describe('audit', () => {
  it('AU1 upload, download and delete each write one event', async () => {
    const since = await maxId(orgA);
    const up = await upload(cookieA, clientId, 'a.txt', new TextEncoder().encode('hello audit'));
    expect(up.status).toBe(201);
    const docId = ((await up.json()) as { document: { id: string } }).document.id;
    const dl = await call('GET', `/api/clients/${clientId}/documents/${docId}/file`, { cookie: cookieA });
    expect(dl.status).toBe(200);
    const del = await call('DELETE', `/api/clients/${clientId}/documents/${docId}`, { cookie: cookieA });
    expect(del.status).toBe(204);
    const events = await newEvents(orgA, since);
    expect(events.map((e) => e.action)).toEqual(['document.upload', 'document.download', 'document.delete']);
    for (const e of events) {
      expect(e.actorId).toBe(userA);
      expect(e.targetType).toBe('document');
      expect(e.targetId).toBe(docId);
      expect(e.ipKey).toMatch(/^[0-9a-f]{32}$/);
    }
    expect(events[0]?.detail).toEqual({ clientId, kind: 'text', byteSize: 11 });
  });

  it('AU2 a duplicate upload writes no second event', async () => {
    const since = await maxId(orgA);
    const bytes = new TextEncoder().encode(`dup ${randomUUID()}`);
    expect((await upload(cookieA, clientId, 'd.txt', bytes)).status).toBe(201);
    expect((await upload(cookieA, clientId, 'd.txt', bytes)).status).toBe(200);
    const events = (await newEvents(orgA, since)).filter((e) => e.action === 'document.upload');
    expect(events.length).toBe(1);
  });

  it('AU3 a trial-balance import and delete each write one event', async () => {
    const since = await maxId(orgA);
    const created = await call('POST', `/api/clients/${clientId}/ledger/imports`, { cookie: cookieA, body: auBody });
    expect(created.status).toBe(201);
    const importId = ((await created.json()) as { import: { id: string } }).import.id;
    const del = await call('DELETE', `/api/clients/${clientId}/ledger/imports/${importId}`, { cookie: cookieA });
    expect(del.status).toBe(204);
    const events = await newEvents(orgA, since);
    expect(events.map((e) => e.action)).toEqual(['ledger.import', 'ledger.delete']);
    expect(events[0]?.detail).toEqual({ clientId, supersededId: null });
    for (const e of events) {
      expect(e.targetType).toBe('ledger_import');
      expect(e.targetId).toBe(importId);
    }
  });

  it('AU4 sign-in writes one sign_in event per workspace', async () => {
    const a2 = await createFirm(cookieA, 'Audit Firm A2');
    // The session is shared, so put the original firm back as active for later cases.
    cookieA = await setActive(cookieA, orgA);
    const sinceA = await maxId(orgA);
    const sinceA2 = await maxId(a2.orgId);
    const sinceB = await maxId(orgB);
    const res = await call('POST', '/api/auth/sign-in/email', { body: { email: emailA, password: 'correct-horse-9' } });
    expect(res.status).toBe(200);
    for (const [org, since] of [[orgA, sinceA], [a2.orgId, sinceA2]] as const) {
      const events = (await newEvents(org, since)).filter((e) => e.action === 'sign_in');
      expect(events.length).toBe(1);
      expect(events[0]?.actorId).toBe(userA);
      expect(events[0]?.targetId).toBe(userA);
    }
    expect((await newEvents(orgB, sinceB)).length).toBe(0);
  });

  it('AU5 an invitation writes member.invite with the role and no email', async () => {
    const since = await maxId(orgA);
    const inviteeEmail = `invitee-${randomUUID()}@example.test`;
    const res = await call('POST', '/api/auth/organization/invite-member', { cookie: cookieA, body: { email: inviteeEmail, role: 'member' } });
    expect(res.status).toBe(200);
    const events = (await newEvents(orgA, since)).filter((e) => e.action === 'member.invite');
    expect(events.length).toBe(1);
    expect(events[0]?.actorId).toBe(userA);
    expect(events[0]?.targetType).toBe('invitation');
    expect(events[0]?.detail).toEqual({ role: 'member' });
    const text = JSON.stringify(await eventsOf(orgA));
    expect(text).not.toContain(inviteeEmail);
    expect(text).not.toContain('@');
  });

  it('AU6 a role change and a removal write member.role and member.remove', async () => {
    const m = await signUp();
    await auth.api.addMember({ body: { organizationId: orgA, userId: m.userId, role: 'member' } });
    const memberId = await memberIdOf(m.userId, orgA);
    const since = await maxId(orgA);
    const role = await call('POST', '/api/auth/organization/update-member-role', { cookie: cookieA, body: { memberId, role: 'admin' } });
    expect(role.status).toBe(200);
    const removed = await call('POST', '/api/auth/organization/remove-member', { cookie: cookieA, body: { memberIdOrEmail: memberId } });
    expect(removed.status).toBe(200);
    const events = await newEvents(orgA, since);
    expect(events.map((e) => e.action)).toEqual(['member.role', 'member.remove']);
    expect(events[0]?.detail).toEqual({ userId: m.userId, role: 'admin' });
    for (const e of events) {
      expect(e.actorId).toBe(userA);
      expect(e.targetId).toBe(memberId);
    }
  });

  it('AU7 a refused invitation writes nothing', async () => {
    const since = await maxId(orgA);
    const res = await call('POST', '/api/auth/organization/invite-member', {
      cookie: memberCookie,
      body: { email: `x-${randomUUID()}@example.test`, role: 'member' },
    });
    expect(res.status).toBe(403);
    expect((await newEvents(orgA, since)).filter((e) => e.action === 'member.invite').length).toBe(0);
  });

  it('AU8 chub_app cannot update or delete events', async () => {
    expect(await failure(withOrg(orgA, (tx) => tx.update(auditEvent).set({ targetId: 'x' }).where(eq(auditEvent.orgId, orgA))))).toMatch(/permission denied/);
    expect(await failure(withOrg(orgA, (tx) => tx.delete(auditEvent).where(eq(auditEvent.orgId, orgA))))).toMatch(/permission denied/);
  });

  it('AU9 the bare pool sees no events', async () => {
    const r = await pool.query<{ n: number }>('select count(*)::int as n from audit_event');
    expect(r.rows[0]?.n).toBe(0);
  });

  it("AU10 firm B cannot see or write firm A's events", async () => {
    const seen = await withOrg(orgB, (tx) => tx.select().from(auditEvent).where(eq(auditEvent.orgId, orgA)));
    expect(seen.length).toBe(0);
    const msg = await failure(
      withOrg(orgA, (tx) => tx.insert(auditEvent).values({ orgId: orgB, actorId: null, action: 'sign_in', targetType: 'user', targetId: 'x' })),
    );
    expect(msg).toMatch(/row-level security/);
  });

  it('AU11 an unknown action fails the check', async () => {
    await expect(
      ownerQuery("insert into audit_event (org_id, action, target_type, target_id) values ($1, 'export', 'user', 'x')", [orgA]),
    ).rejects.toThrow(/audit_event_action_check/);
  });

  it('AU12 the owner pages through the log newest first', async () => {
    const first = await call('GET', '/api/audit?limit=1', { cookie: cookieA });
    expect(first.status).toBe(200);
    const body = (await first.json()) as { events: { id: number }[]; nextBefore: number | null };
    expect(body.events.length).toBe(1);
    expect(body.nextBefore).toBe(body.events[0]?.id);
    const second = await call('GET', `/api/audit?before=${body.nextBefore}&limit=1`, { cookie: cookieA });
    const secondBody = (await second.json()) as { events: { id: number }[] };
    expect(secondBody.events[0]?.id).toBeLessThan(body.events[0]?.id ?? 0);
    const all = await call('GET', '/api/audit', { cookie: cookieA });
    const allBody = (await all.json()) as { events: Record<string, unknown>[] };
    const ids = allBody.events.map((e) => e.id as number);
    for (let i = 1; i < ids.length; i++) expect(ids[i] ?? 0).toBeLessThan(ids[i - 1] ?? 0);
    for (const e of allBody.events) expect('ipKey' in e).toBe(false);
  });

  it('AU13 a member gets 403 and a bad query 400', async () => {
    const denied = await call('GET', '/api/audit', { cookie: memberCookie });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: 'Only firm owners and admins can see the audit log' });
    const zero = await call('GET', '/api/audit?limit=0', { cookie: cookieA });
    expect(zero.status).toBe(400);
    expect(await zero.json()).toEqual({ error: 'Invalid query' });
    expect((await call('GET', '/api/audit?limit=101', { cookie: cookieA })).status).toBe(400);
  });

  it("AU14 firm B's log holds none of firm A's events", async () => {
    const aIds = new Set((await eventsOf(orgA)).map((e) => e.id));
    const res = await call('GET', '/api/audit?limit=100', { cookie: cookieB });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: { id: number }[] };
    for (const e of body.events) expect(aIds.has(e.id)).toBe(false);
  });

  it('AU15 events never hold a document name', async () => {
    const up = await upload(cookieA, clientId, 'Jane Citizen tax return.txt', new TextEncoder().encode(`jc ${randomUUID()}`));
    expect(up.status).toBe(201);
    expect(JSON.stringify(await eventsOf(orgA))).not.toContain('Jane');
  });
});
