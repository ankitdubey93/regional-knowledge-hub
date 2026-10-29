import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays } from '@chub/shared/utils/deadlines';
import { weekStartOf, type WorkloadRow } from '@chub/shared/utils/workload';
import { auth } from '../auth';
import { pool } from '../db/client';
import { memberCapacity } from '../db/schema';
import { withOrg } from '../db/withOrg';
import { call, createFirm, mergeCookies, signUp } from './helpers';
import { startApp, stopApp } from './server';

let cookieA = '';
let cookieB = '';
let memberCookie = '';
let orgA = '';
let orgB = '';
let userA = '';
let userB = '';
let emailA = '';
let memberUserId = '';
let memberEmail = '';
let clientA = '';

async function failure(p: Promise<unknown>): Promise<string> {
  const err: unknown = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(Error);
  const cause = (err as Error).cause;
  return cause instanceof Error ? cause.message : (err as Error).message;
}

async function addTask(engagementId: string, patch: Record<string, unknown>): Promise<void> {
  const created = await call('POST', `/api/engagements/${engagementId}/tasks`, { cookie: cookieA, body: { title: 'W' } });
  expect(created.status).toBe(201);
  const taskId = ((await created.json()) as { task: { id: string } }).task.id;
  const patched = await call('PATCH', `/api/engagements/${engagementId}/tasks/${taskId}`, { cookie: cookieA, body: patch });
  expect(patched.status).toBe(200);
}

async function makeEngagement(title: string, dueOn: string): Promise<string> {
  const res = await call('POST', `/api/clients/${clientA}/engagements`, {
    cookie: cookieA,
    body: { templateId: 'seed:bas', title, dueOn, periodEnd: '2026-09-30' },
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { engagement: { id: string } }).engagement.id;
}

interface WorkloadBody {
  timezone: string | null;
  canEdit: boolean;
  weekStart: string | null;
  nextWeekStart: string | null;
  rows: WorkloadRow[];
}

async function getWorkload(cookie: string, query = ''): Promise<{ status: number; body: WorkloadBody }> {
  const res = await call('GET', `/api/workload${query}`, { cookie });
  return { status: res.status, body: (await res.json()) as WorkloadBody };
}

beforeAll(async () => {
  await startApp();
  const a = await signUp();
  const firmA = await createFirm(a.cookie, 'Workload Firm A');
  cookieA = firmA.cookie;
  orgA = firmA.orgId;
  userA = a.userId;
  emailA = a.email;
  const b = await signUp();
  const firmB = await createFirm(b.cookie, 'Workload Firm B');
  cookieB = firmB.cookie;
  orgB = firmB.orgId;
  userB = b.userId;

  const m = await signUp();
  memberUserId = m.userId;
  memberEmail = m.email;
  await auth.api.addMember({ body: { userId: m.userId, organizationId: firmA.orgId, role: 'member' } });
  const active = await call('POST', '/api/auth/organization/set-active', {
    cookie: m.cookie,
    body: { organizationId: firmA.orgId },
  });
  if (active.status !== 200) throw new Error(`member set-active failed: ${active.status}`);
  memberCookie = mergeCookies(m.cookie, active);

  const c = await call('POST', '/api/clients', {
    cookie: cookieA,
    body: { name: 'Workload Co', jurisdiction: 'AU', entityType: 'company', fyEndMonth: 6, taxRegistered: true, taxPeriod: 'quarterly' },
  });
  if (c.status !== 201) throw new Error(`create client failed: ${c.status}`);
  clientA = ((await c.json()) as { client: { id: string } }).client.id;
}, 60_000);

afterAll(async () => {
  await stopApp();
  await pool.end();
});

describe('workload', () => {
  it('WL1 before the timezone is set the view is empty', async () => {
    const r = await getWorkload(cookieA);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ timezone: null, canEdit: true, weekStart: null, nextWeekStart: null, rows: [] });
  });

  it('WL2 a member cannot set the firm timezone', async () => {
    const res = await call('PATCH', '/api/workload/timezone', { cookie: memberCookie, body: { timezone: 'Australia/Sydney' } });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Only firm owners and admins can change the firm timezone' });
  });

  it('WL3 an unknown timezone is refused', async () => {
    const res = await call('PATCH', '/api/workload/timezone', { cookie: cookieA, body: { timezone: 'Mars/Base' } });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('Invalid input');
  });

  it('WL4 an owner sets it and a member reads it', async () => {
    const set = await call('PATCH', '/api/workload/timezone', { cookie: cookieA, body: { timezone: 'Australia/Sydney' } });
    expect(set.status).toBe(200);
    expect(await set.json()).toEqual({ timezone: 'Australia/Sydney' });
    const r = await getWorkload(memberCookie);
    expect(r.status).toBe(200);
    expect(r.body.timezone).toBe('Australia/Sydney');
    expect(r.body.canEdit).toBe(false);
    expect(weekStartOf(r.body.weekStart!)).toBe(r.body.weekStart);
    expect(r.body.nextWeekStart).toBe(addDays(r.body.weekStart!, 7));
  });

  it('WL5 a week that is not a Monday is refused', async () => {
    const bad = await call('GET', '/api/workload?week=2026-11-03', { cookie: cookieA });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'Invalid week' });
    const impossible = await call('GET', '/api/workload?week=2026-02-31', { cookie: cookieA });
    expect(impossible.status).toBe(400);
  });

  it('WL6 capacity rules', async () => {
    const asMember = await call('PATCH', `/api/workload/capacity/${userA}`, { cookie: memberCookie, body: { weeklyMinutes: 1800 } });
    expect(asMember.status).toBe(403);
    expect(await asMember.json()).toEqual({ error: 'Only firm owners and admins can set capacity' });
    const other = await call('PATCH', `/api/workload/capacity/${userB}`, { cookie: cookieA, body: { weeklyMinutes: 1800 } });
    expect(other.status).toBe(404);
    expect(await other.json()).toEqual({ error: 'Member not found' });
    const tooBig = await call('PATCH', `/api/workload/capacity/${userA}`, { cookie: cookieA, body: { weeklyMinutes: 6001 } });
    expect(tooBig.status).toBe(400);
    for (let i = 0; i < 2; i++) {
      const ok = await call('PATCH', `/api/workload/capacity/${userA}`, { cookie: cookieA, body: { weeklyMinutes: 1800 } });
      expect(ok.status).toBe(200);
      expect(await ok.json()).toEqual({ userId: userA, weeklyMinutes: 1800 });
    }
  });

  it('WL7 the numbers', async () => {
    const e1 = await makeEngagement('WL BAS', '2026-11-28');
    await addTask(e1, { assigneeId: userA, estimateMinutes: 120, dueOn: '2026-10-30' });
    await addTask(e1, { assigneeId: userA, estimateMinutes: 300, dueOn: '2026-11-02' });
    await addTask(e1, { assigneeId: userA, estimateMinutes: null, dueOn: '2026-11-08' });
    await addTask(e1, { assigneeId: userA, estimateMinutes: 600, dueOn: '2026-11-09' });
    await addTask(e1, { assigneeId: userA, estimateMinutes: 90, dueOn: '2026-11-16' });
    await addTask(e1, { assigneeId: userA, estimateMinutes: 500, dueOn: '2026-11-03', status: 'done' });
    const e2 = await makeEngagement('WL VAT', '2026-11-12');
    await addTask(e2, { assigneeId: memberUserId, estimateMinutes: 240, dueOn: null });
    const e3 = await makeEngagement('WL Done', '2026-11-04');
    await addTask(e3, { assigneeId: userA, estimateMinutes: 700, dueOn: '2026-11-04' });
    const done = await call('PATCH', `/api/engagements/${e3}`, { cookie: cookieA, body: { status: 'done' } });
    expect(done.status).toBe(200);

    const r = await getWorkload(cookieA, '?week=2026-11-02');
    expect(r.status).toBe(200);
    expect(r.body.weekStart).toBe('2026-11-02');
    expect(r.body.nextWeekStart).toBe('2026-11-09');
    expect(r.body.rows).toHaveLength(2);
    expect(r.body.rows.find((x) => x.userId === userA)).toEqual({
      userId: userA,
      name: 'Test User',
      email: emailA,
      capacityMinutes: 1800,
      capacityIsDefault: false,
      overdueMinutes: 120,
      thisWeek: { openMinutes: 300, loadBp: 2333 },
      nextWeek: { openMinutes: 600, loadBp: 3333 },
      unestimatedCount: 1,
    });
    expect(r.body.rows.find((x) => x.userId === memberUserId)).toEqual({
      userId: memberUserId,
      name: 'Test User',
      email: memberEmail,
      capacityMinutes: 2250,
      capacityIsDefault: true,
      overdueMinutes: 0,
      thisWeek: { openMinutes: 0, loadBp: 0 },
      nextWeek: { openMinutes: 240, loadBp: 1067 },
      unestimatedCount: 0,
    });
  });

  it('WL8 zero capacity gives no load', async () => {
    const set = await call('PATCH', `/api/workload/capacity/${memberUserId}`, { cookie: cookieA, body: { weeklyMinutes: 0 } });
    expect(set.status).toBe(200);
    const r = await getWorkload(cookieA, '?week=2026-11-02');
    const row = r.body.rows.find((x) => x.userId === memberUserId)!;
    expect(row.capacityMinutes).toBe(0);
    expect(row.capacityIsDefault).toBe(false);
    expect(row.thisWeek.loadBp).toBeNull();
    expect(row.nextWeek.loadBp).toBeNull();
  });
});

describe('workload isolation', () => {
  it('WI1 the bare pool sees no capacity rows', async () => {
    const r = await pool.query('select count(*)::int as n from member_capacity');
    expect(r.rows[0].n).toBe(0);
  });

  it("WI2 withOrg(orgB) sees none of firm A's rows", async () => {
    expect(await withOrg(orgB, (tx) => tx.select().from(memberCapacity).where(eq(memberCapacity.orgId, orgA)))).toHaveLength(0);
    expect(await withOrg(orgA, (tx) => tx.select().from(memberCapacity).where(eq(memberCapacity.orgId, orgA)))).toHaveLength(2);
  });

  it("WI3 inserting with another firm's org_id fails", async () => {
    const msg = await failure(
      withOrg(orgA, (tx) => tx.insert(memberCapacity).values({ orgId: orgB, userId: userB, weeklyMinutes: 60 })),
    );
    expect(msg).toMatch(/row-level security/);
  });

  it('WI4 capacity above the maximum fails', async () => {
    const msg = await failure(
      withOrg(orgA, (tx) => tx.insert(memberCapacity).values({ orgId: orgA, userId: userB, weeklyMinutes: 6001 })),
    );
    expect(msg).toMatch(/member_capacity_weekly_minutes_check/);
  });

  it('WI5 an unknown firm timezone fails', async () => {
    await expect(pool.query("update organization set timezone = 'Mars/Base' where id = $1", [orgB])).rejects.toThrow(
      /organization_timezone_check/,
    );
  });

  it('WI6 firm B sees only its own workload', async () => {
    const b = await getWorkload(cookieB);
    expect(b.body).toEqual({ timezone: null, canEdit: true, weekStart: null, nextWeekStart: null, rows: [] });
    const cap = await call('PATCH', `/api/workload/capacity/${userA}`, { cookie: cookieB, body: { weeklyMinutes: 60 } });
    expect(cap.status).toBe(404);
    expect(await cap.json()).toEqual({ error: 'Member not found' });
    const tz = await call('PATCH', '/api/workload/timezone', { cookie: cookieB, body: { timezone: 'Europe/London' } });
    expect(tz.status).toBe(200);
    expect((await getWorkload(cookieA)).body.timezone).toBe('Australia/Sydney');
  });

  it('WI7 Better Auth cannot set the timezone', async () => {
    await call('POST', '/api/auth/organization/update', {
      cookie: cookieA,
      body: { organizationId: orgA, data: { timezone: 'Europe/London' } },
    });
    expect((await getWorkload(cookieA)).body.timezone).toBe('Australia/Sydney');
  });
});
