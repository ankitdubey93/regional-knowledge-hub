import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../db/client';
import { withOrg } from '../db/withOrg';
import { NUDGE_LOCK_KEY, nudgesDue, runNudgeTick } from '../jobs/nudges';
import { setTransportForTests, type TestTransport } from '../mail/mailer';
import type { RequestLinkView } from '../types/requestLinks';
import { call, createFirm, signUp } from './helpers';
import { startApp, stopApp } from './server';

let cookie = '';
let orgId = '';
let clientId = '';
let outbox: TestTransport = { sent: [] };
const DAY = 86_400_000;

async function newRequest(label: string): Promise<string> {
  const res = await call('POST', `/api/clients/${clientId}/requests`, { cookie, body: { label, dueOn: null } });
  expect(res.status).toBe(201);
  return ((await res.json()) as { request: { id: string } }).request.id;
}

/** A link with its own request, created `ageDays` ago (plus `extraMs`), with its own recipient. */
async function makeLink(tag: string, ageDays: number, extraMs = 60_000): Promise<{ id: string; recipient: string; requestId: string }> {
  const requestId = await newRequest(`Nudge ${tag} ${randomUUID().slice(0, 6)}`);
  const recipient = `nu-${tag}-${randomUUID()}@example.com`;
  const res = await call('POST', `/api/clients/${clientId}/request-links`, { cookie, body: { recipientEmail: recipient, requestIds: [requestId] } });
  expect(res.status).toBe(201);
  const id = ((await res.json()) as { link: RequestLinkView }).link.id;
  const ms = ageDays * DAY + extraMs;
  await withOrg(orgId, (tx) =>
    tx.execute(sql`update request_link set created_at = now() - (${ms} * interval '1 millisecond') where id = ${id} and org_id = ${orgId}`),
  );
  outbox.sent.length = 0;
  return { id, recipient, requestId };
}

async function linkView(id: string): Promise<RequestLinkView> {
  const res = await call('GET', `/api/clients/${clientId}/request-links`, { cookie });
  const { links } = (await res.json()) as { links: RequestLinkView[] };
  return links.find((l) => l.id === id)!;
}

const mailsTo = (recipient: string) => outbox.sent.filter((m) => m.to === recipient);

beforeAll(async () => {
  await startApp();
  const u = await signUp();
  const firm = await createFirm(u.cookie, 'Nudge Firm');
  cookie = firm.cookie;
  orgId = firm.orgId;
  const c = await call('POST', '/api/clients', {
    cookie,
    body: { name: 'Nudge Pty Ltd', jurisdiction: 'AU', entityType: 'company', fyEndMonth: 6 },
  });
  clientId = ((await c.json()) as { client: { id: string } }).client.id;
}, 60_000);

beforeEach(() => {
  outbox = { sent: [] };
  setTransportForTests(outbox);
});

afterAll(async () => {
  setTransportForTests(null);
  await stopApp();
  await pool.end();
});

describe('nudges', () => {
  it('NU1 nudgesDue counts passed cadence days', () => {
    const created = new Date('2026-11-01T00:00:00Z');
    const at = (days: number) => new Date(created.getTime() + days * DAY);
    expect(nudgesDue([3, 7, 14], created, at(2))).toBe(0);
    expect(nudgesDue([3, 7, 14], created, at(3))).toBe(1);
    expect(nudgesDue([3, 7, 14], created, at(8))).toBe(2);
    expect(nudgesDue([3, 7, 14], created, at(30))).toBe(3);
    expect(nudgesDue([], created, at(30))).toBe(0);
  });

  it('NU2 a reminder goes out on day 3', async () => {
    const l = await makeLink('nu2', 3);
    await runNudgeTick(new Date());
    const mails = mailsTo(l.recipient);
    expect(mails).toHaveLength(1);
    expect(mails[0]!.subject).toBe('Reminder: Nudge Firm is waiting for documents');
    expect(mails[0]!.text).toContain('/r/');
    const v = await linkView(l.id);
    expect(v.nudgeCount).toBe(1);
    expect(v.lastNudgedAt).not.toBeNull();
    const ev = await withOrg(orgId, async (tx) =>
      (await tx.execute(sql`select count(*)::int as n from audit_event where org_id = ${orgId} and target_id = ${l.id} and action = 'request_link.nudge'`)).rows,
    );
    expect((ev[0] as { n: number }).n).toBe(1);
  });

  it('NU3 the same tick time sends nothing twice', async () => {
    const l = await makeLink('nu3', 3);
    const now = new Date();
    await runNudgeTick(now);
    expect(mailsTo(l.recipient)).toHaveLength(1);
    await runNudgeTick(now);
    expect(mailsTo(l.recipient)).toHaveLength(1);
  });

  it('NU4 missed reminders are skipped', async () => {
    const l = await makeLink('nu4', 15);
    await runNudgeTick(new Date());
    expect(mailsTo(l.recipient)).toHaveLength(1);
    expect((await linkView(l.id)).nudgeCount).toBe(3);
  });

  it('NU5 stop rules hold', async () => {
    const paused = await makeLink('nu5p', 4);
    const revoked = await makeLink('nu5r', 4);
    const expired = await makeLink('nu5e', 4);
    const complete = await makeLink('nu5c', 4);
    expect((await call('PATCH', `/api/clients/${clientId}/request-links/${paused.id}`, { cookie, body: { paused: true } })).status).toBe(200);
    expect((await call('DELETE', `/api/clients/${clientId}/request-links/${revoked.id}`, { cookie })).status).toBe(204);
    await withOrg(orgId, (tx) =>
      tx.execute(sql`update request_link set expires_at = now() - interval '1 minute' where id = ${expired.id} and org_id = ${orgId}`),
    );
    const done = await call('PATCH', `/api/clients/${clientId}/requests/${complete.requestId}`, { cookie, body: { status: 'received' } });
    expect(done.status).toBe(200);
    outbox.sent.length = 0;
    await runNudgeTick(new Date());
    for (const l of [paused, revoked, expired, complete]) expect(mailsTo(l.recipient)).toHaveLength(0);
  });

  it('NU6 a held lock skips the tick', async () => {
    const c = await pool.connect();
    try {
      await c.query('select pg_advisory_lock($1)', [NUDGE_LOCK_KEY]);
      expect(await runNudgeTick(new Date())).toEqual({ skipped: true, sent: 0, failed: 0 });
    } finally {
      await c.query('select pg_advisory_unlock($1)', [NUDGE_LOCK_KEY]);
      c.release();
    }
  });

  it('NU7 a mail failure leaves the count', async () => {
    const l = await makeLink('nu7', 4);
    setTransportForTests(null);
    const result = await runNudgeTick(new Date());
    expect(result.failed).toBeGreaterThanOrEqual(1);
    const rows = await withOrg(orgId, async (tx) =>
      (await tx.execute(sql`select nudge_count from request_link where id = ${l.id} and org_id = ${orgId}`)).rows,
    );
    expect((rows[0] as { nudge_count: number }).nudge_count).toBe(0);
  });
});
