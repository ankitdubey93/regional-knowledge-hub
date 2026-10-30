import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth } from '../auth';
import { pool } from '../db/client';
import { auditEvent, conversation, document } from '../db/schema';
import { withOrg } from '../db/withOrg';
import { RETENTION_LOCK_KEY, runRetentionTick } from '../jobs/retention';
import { call, createFirm, mergeCookies, ORIGIN, signUp } from './helpers';
import { startApp, stopApp } from './server';
import { testEnv } from './testEnv';

let cookieA = '';
let adminCookie = '';
let memberCookie = '';
let cookieB = '';
let orgA = '';
let orgB = '';
let userA = '';
let clientA = '';
let clientB = '';
let bDocId = '';

async function makeClient(cookie: string, name: string): Promise<string> {
  const res = await call('POST', '/api/clients', {
    cookie,
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

async function uploadId(cookie: string, cid: string, name: string): Promise<string> {
  const res = await upload(cookie, cid, name, new TextEncoder().encode(`${name} ${randomUUID()}`));
  expect(res.status).toBe(201);
  return ((await res.json()) as { document: { id: string } }).document.id;
}

async function ownerQuery(sql: string, params: unknown[] = []): Promise<pg.QueryResult> {
  const adminPool = new pg.Pool({ connectionString: testEnv.DATABASE_ADMIN_URL });
  try {
    return await adminPool.query(sql, params);
  } finally {
    await adminPool.end();
  }
}

async function addMemberWithRole(orgId: string, role: 'admin' | 'member'): Promise<string> {
  const m = await signUp();
  await auth.api.addMember({ body: { userId: m.userId, organizationId: orgId, role } });
  const active = await call('POST', '/api/auth/organization/set-active', { cookie: m.cookie, body: { organizationId: orgId } });
  if (active.status !== 200) throw new Error(`set-active failed: ${active.status}`);
  return mergeCookies(m.cookie, active);
}

async function newConversation(orgId: string, userId: string): Promise<string> {
  const rows = await withOrg(orgId, (tx) => tx.insert(conversation).values({ orgId, userId, clientId: clientA }).returning({ id: conversation.id }));
  const id = rows[0]?.id;
  if (!id) throw new Error('conversation insert failed');
  return id;
}

function eventsOf(orgId: string) {
  return withOrg(orgId, (tx) => tx.select().from(auditEvent).where(eq(auditEvent.orgId, orgId)).orderBy(asc(auditEvent.id)));
}

async function getRetention(cookie: string): Promise<{ status: number; body: { retention: { documentsDays: number | null; conversationsDays: number | null }; canEdit: boolean } }> {
  const res = await call('GET', '/api/workspace/retention', { cookie });
  return { status: res.status, body: (await res.json()) as never };
}

let oldDocId = '';
let newDocId = '';
let oldConvId = '';
let newConvId = '';

beforeAll(async () => {
  await startApp();
  const a = await signUp();
  const firmA = await createFirm(a.cookie, 'Retention Firm A');
  cookieA = firmA.cookie;
  orgA = firmA.orgId;
  userA = a.userId;
  const b = await signUp();
  const firmB = await createFirm(b.cookie, 'Retention Firm B');
  cookieB = firmB.cookie;
  orgB = firmB.orgId;
  clientA = await makeClient(cookieA, 'Retention Co A');
  clientB = await makeClient(cookieB, 'Retention Co B');
  adminCookie = await addMemberWithRole(orgA, 'admin');
  memberCookie = await addMemberWithRole(orgA, 'member');
  bDocId = await uploadId(cookieB, clientB, 'b-old.txt');
  await ownerQuery("update document set created_at = now() - make_interval(days => $2::int) where id = $1", [bDocId, 4000]);
}, 60_000);

afterAll(async () => {
  await stopApp();
  await pool.end();
});

describe('retention', () => {
  it('RT1 retention starts as keep forever', async () => {
    const owner = await getRetention(cookieA);
    expect(owner.status).toBe(200);
    expect(owner.body).toEqual({ retention: { documentsDays: null, conversationsDays: null }, canEdit: true });
    expect((await getRetention(memberCookie)).body.canEdit).toBe(false);
  });

  it('RT2 the owner sets retention and it is audited', async () => {
    const res = await call('PATCH', '/api/workspace/retention', { cookie: cookieA, body: { documentsDays: 30, conversationsDays: 365 } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ retention: { documentsDays: 30, conversationsDays: 365 } });
    const events = (await eventsOf(orgA)).filter((e) => e.action === 'retention.update');
    expect(events.length).toBe(1);
    expect(events[0]?.detail).toEqual({ documentsDays: 30, conversationsDays: 365 });
    expect(events[0]?.actorId).toBe(userA);
  });

  it('RT3 an admin and a member cannot change retention', async () => {
    for (const cookie of [adminCookie, memberCookie]) {
      const res = await call('PATCH', '/api/workspace/retention', { cookie, body: { documentsDays: 60, conversationsDays: null } });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'Only the workspace owner can change retention' });
    }
  });

  it('RT4 out-of-range or missing values are rejected', async () => {
    const bodies = [
      { documentsDays: 29, conversationsDays: null },
      { documentsDays: 3651, conversationsDays: null },
      { documentsDays: 30 },
      { documentsDays: 30, conversationsDays: null, extra: 1 },
    ];
    for (const body of bodies) {
      const res = await call('PATCH', '/api/workspace/retention', { cookie: cookieA, body });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe('Invalid input');
    }
  });

  it('RT5 the database check rejects 10 days', async () => {
    await expect(ownerQuery('update organization set retention_days_documents = 10 where id = $1', [orgB])).rejects.toThrow(
      /organization_retention_days_check/,
    );
  });

  it('RT6 Better Auth cannot set retention', async () => {
    await call('POST', '/api/auth/organization/update', {
      cookie: cookieA,
      body: { organizationId: orgA, data: { retentionDaysDocuments: 3650 } },
    });
    expect((await getRetention(cookieA)).body.retention.documentsDays).toBe(30);
  });

  it('RT7 a tick purges only expired rows', async () => {
    oldDocId = await uploadId(cookieA, clientA, 'old.txt');
    newDocId = await uploadId(cookieA, clientA, 'new.txt');
    await ownerQuery('update document set created_at = now() - make_interval(days => $2::int) where id = $1', [oldDocId, 31]);
    oldConvId = await newConversation(orgA, userA);
    newConvId = await newConversation(orgA, userA);
    await ownerQuery('update conversation set updated_at = now() - make_interval(days => $2::int) where id = $1', [oldConvId, 366]);

    const result = await runRetentionTick(new Date());
    expect(result.skipped).toBe(false);
    expect(result.documents).toBeGreaterThanOrEqual(1);
    expect(result.conversations).toBeGreaterThanOrEqual(1);

    expect((await call('GET', `/api/clients/${clientA}/documents/${oldDocId}/file`, { cookie: cookieA })).status).toBe(404);
    expect((await call('GET', `/api/clients/${clientA}/documents/${newDocId}/file`, { cookie: cookieA })).status).toBe(200);
    const convs = await withOrg(orgA, (tx) => tx.select({ id: conversation.id }).from(conversation).where(eq(conversation.orgId, orgA)));
    const ids = convs.map((c) => c.id);
    expect(ids).not.toContain(oldConvId);
    expect(ids).toContain(newConvId);
  });

  it('RT8 a firm without settings keeps old rows', async () => {
    const rows = await withOrg(orgB, (tx) =>
      tx.select().from(document).where(and(eq(document.orgId, orgB), eq(document.id, bDocId))),
    );
    expect(rows.length).toBe(1);
  });

  it('RT9 the purge is logged once with counts', async () => {
    const purges = (await eventsOf(orgA)).filter((e) => e.action === 'retention.purge');
    expect(purges.length).toBe(1);
    expect(purges[0]?.actorId).toBeNull();
    expect(purges[0]?.detail).toEqual({ documents: 1, conversations: 1 });
    await runRetentionTick(new Date());
    expect((await eventsOf(orgA)).filter((e) => e.action === 'retention.purge').length).toBe(1);
  });

  it('RT10 a tick while another holds the lock is skipped', async () => {
    const c = await pool.connect();
    try {
      await c.query('select pg_advisory_lock($1)', [RETENTION_LOCK_KEY]);
      expect(await runRetentionTick(new Date())).toEqual({ skipped: true, orgs: 0, documents: 0, conversations: 0, rateBuckets: 0 });
    } finally {
      await c.query('select pg_advisory_unlock($1)', [RETENTION_LOCK_KEY]);
      c.release();
    }
  });

  it('RT11 rate buckets older than a day are purged', async () => {
    const oldKey = `rt-old-${randomUUID()}`;
    const newKey = `rt-new-${randomUUID()}`;
    await pool.query("insert into rate_bucket (key, window_start, count) values ($1, now() - interval '2 days', 1), ($2, now(), 1)", [oldKey, newKey]);
    await runRetentionTick(new Date());
    const r = await pool.query<{ key: string }>('select key from rate_bucket where key = any($1)', [[oldKey, newKey]]);
    const keys = r.rows.map((x) => x.key);
    expect(keys).not.toContain(oldKey);
    expect(keys).toContain(newKey);
  });
});
