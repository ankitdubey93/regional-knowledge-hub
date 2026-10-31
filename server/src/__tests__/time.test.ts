import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth } from '../auth';
import { pool } from '../db/client';
import { timeEntry } from '../db/schema';
import { withOrg } from '../db/withOrg';
import type { TimeEntryView } from '../types/time';
import { call, createFirm, mergeCookies, signUp } from './helpers';
import { startApp, stopApp } from './server';

let cookieA = '';
let cookieB = '';
let memberCookie = '';
let orgA = '';
let orgB = '';
let userA = '';
let memberUserId = '';
let clientA = '';
let clientA2 = '';
let clientB = '';
let engA = '';
let engA2 = '';
let taskA = '';
let taskA2 = '';
const TITLE_ENG = 'Time BAS';
const TITLE_TASK = 'Time task';

async function failure(p: Promise<unknown>): Promise<string> {
  const err: unknown = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(Error);
  const cause = (err as Error).cause;
  return cause instanceof Error ? cause.message : (err as Error).message;
}

async function makeClient(cookie: string, name: string): Promise<string> {
  const c = await call('POST', '/api/clients', {
    cookie,
    body: { name, jurisdiction: 'AU', entityType: 'company', fyEndMonth: 6, taxRegistered: true, taxPeriod: 'quarterly' },
  });
  if (c.status !== 201) throw new Error(`create client failed: ${c.status}`);
  return ((await c.json()) as { client: { id: string } }).client.id;
}

async function makeEngagement(clientId: string, title: string): Promise<string> {
  const res = await call('POST', `/api/clients/${clientId}/engagements`, {
    cookie: cookieA,
    body: { templateId: 'seed:bas', title, dueOn: '2026-11-28', periodEnd: '2026-09-30' },
  });
  if (res.status !== 201) throw new Error(`create engagement failed: ${res.status}`);
  return ((await res.json()) as { engagement: { id: string } }).engagement.id;
}

async function makeTask(engagementId: string, title: string): Promise<string> {
  const res = await call('POST', `/api/engagements/${engagementId}/tasks`, { cookie: cookieA, body: { title } });
  if (res.status !== 201) throw new Error(`create task failed: ${res.status}`);
  return ((await res.json()) as { task: { id: string } }).task.id;
}

async function addTime(cookie: string, body: Record<string, unknown>): Promise<TimeEntryView> {
  const res = await call('POST', '/api/time', { cookie, body });
  expect(res.status).toBe(201);
  return ((await res.json()) as { entry: TimeEntryView }).entry;
}

async function listTime(cookie: string, query: string): Promise<TimeEntryView[]> {
  const res = await call('GET', `/api/time${query}`, { cookie });
  expect(res.status).toBe(200);
  return ((await res.json()) as { entries: TimeEntryView[] }).entries;
}

async function startTimer(cookie: string, body: Record<string, unknown>): Promise<{ status: number; json: unknown }> {
  const res = await call('POST', '/api/time/timer', { cookie, body });
  return { status: res.status, json: await res.json() };
}

async function rewindTimer(id: string, interval: string): Promise<void> {
  await withOrg(orgA, (tx) =>
    tx
      .update(timeEntry)
      .set({ startedAt: sql`now() - ${interval}::interval` })
      .where(eq(timeEntry.id, id)),
  );
}

beforeAll(async () => {
  await startApp();
  const a = await signUp();
  const firmA = await createFirm(a.cookie, 'Time Firm A');
  cookieA = firmA.cookie;
  orgA = firmA.orgId;
  userA = a.userId;
  const b = await signUp();
  const firmB = await createFirm(b.cookie, 'Time Firm B');
  cookieB = firmB.cookie;
  orgB = firmB.orgId;

  const m = await signUp();
  memberUserId = m.userId;
  await auth.api.addMember({ body: { userId: m.userId, organizationId: firmA.orgId, role: 'member' } });
  const active = await call('POST', '/api/auth/organization/set-active', {
    cookie: m.cookie,
    body: { organizationId: firmA.orgId },
  });
  if (active.status !== 200) throw new Error(`member set-active failed: ${active.status}`);
  memberCookie = mergeCookies(m.cookie, active);

  clientA = await makeClient(cookieA, 'Time Co');
  clientA2 = await makeClient(cookieA, 'Other Co');
  clientB = await makeClient(cookieB, 'B Co');
  engA = await makeEngagement(clientA, TITLE_ENG);
  engA2 = await makeEngagement(clientA2, 'Other BAS');
  taskA = await makeTask(engA, TITLE_TASK);
  taskA2 = await makeTask(engA2, 'Other task');
}, 90_000);

afterAll(async () => {
  await stopApp();
  await pool.end();
});

let timerId = '';
let lastAEntryId = '';

describe('time', () => {
  it('TM1 an owner starts a timer', async () => {
    const r = await startTimer(cookieA, { clientId: clientA, engagementId: engA, taskId: taskA, workDate: '2026-11-02' });
    expect(r.status).toBe(201);
    const timer = (r.json as { timer: TimeEntryView }).timer;
    expect(timer.minutes).toBeNull();
    expect(typeof timer.startedAt).toBe('string');
    expect(timer.workDate).toBe('2026-11-02');
    expect(timer.billable).toBe(true);
    expect(timer.note).toBe('');
    expect(timer.engagementTitle).toBe(TITLE_ENG);
    expect(timer.taskTitle).toBe(TITLE_TASK);
    expect(timer.canEdit).toBe(false);
    timerId = timer.id;
  });

  it('TM2 a second timer is refused', async () => {
    const r = await startTimer(cookieA, { clientId: clientA, engagementId: engA, taskId: taskA, workDate: '2026-11-02' });
    expect(r.status).toBe(409);
    expect(r.json).toEqual({ error: 'A timer is already running' });
  });

  it('TM3 the timer belongs to its user', async () => {
    const own = await call('GET', '/api/time/timer', { cookie: cookieA });
    expect(own.status).toBe(200);
    expect(((await own.json()) as { timer: TimeEntryView }).timer.id).toBe(timerId);
    const other = await call('GET', '/api/time/timer', { cookie: memberCookie });
    expect(other.status).toBe(200);
    expect(await other.json()).toEqual({ timer: null });
  });

  it('TM4 stopping rounds up on the server', async () => {
    await rewindTimer(timerId, '90 seconds');
    const stop = await call('DELETE', '/api/time/timer', { cookie: cookieA });
    expect(stop.status).toBe(200);
    const body = (await stop.json()) as { entry: TimeEntryView; capped: boolean };
    expect(body.entry.minutes).toBe(2);
    expect(body.capped).toBe(false);
    const again = await call('DELETE', '/api/time/timer', { cookie: cookieA });
    expect(again.status).toBe(404);
    expect(await again.json()).toEqual({ error: 'No timer is running' });
  });

  it('TM5 a timer over a day is capped', async () => {
    const r = await startTimer(cookieA, { clientId: clientA, workDate: '2026-11-02' });
    expect(r.status).toBe(201);
    await rewindTimer((r.json as { timer: TimeEntryView }).timer.id, '30 hours');
    const stop = await call('DELETE', '/api/time/timer', { cookie: cookieA });
    expect(stop.status).toBe(200);
    const body = (await stop.json()) as { entry: TimeEntryView; capped: boolean };
    expect(body.entry.minutes).toBe(1440);
    expect(body.capped).toBe(true);
  });

  it('TM6 a manual entry and the list', async () => {
    const entry = await addTime(cookieA, { clientId: clientA, workDate: '2026-11-03', minutes: 90, billable: false, note: 'Bank rec' });
    expect(entry.minutes).toBe(90);
    expect(entry.billable).toBe(false);
    expect(entry.note).toBe('Bank rec');
    expect(entry.startedAt).toBeNull();
    expect(entry.workDate).toBe('2026-11-03');
    const r = await startTimer(cookieA, { clientId: clientA, workDate: '2026-11-03' });
    expect(r.status).toBe(201);
    const entries = await listTime(cookieA, '?from=2026-11-03&to=2026-11-03&mine=1');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.id).toBe(entry.id);
    expect(entries.some((e) => e.minutes === null)).toBe(false);
    const stop = await call('DELETE', '/api/time/timer', { cookie: cookieA });
    expect(stop.status).toBe(200);
  });

  it('TM7 validation', async () => {
    const bodies: Record<string, unknown>[] = [
      { clientId: clientA, workDate: '2026-11-02', minutes: 0 },
      { clientId: clientA, workDate: '2026-11-02', minutes: 1441 },
      { clientId: clientA, workDate: '2026-02-31', minutes: 10 },
      { clientId: clientA, workDate: '2026-11-02', minutes: 10, taskId: taskA },
    ];
    for (const body of bodies) {
      const res = await call('POST', '/api/time', { cookie: cookieA, body });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe('Invalid input');
    }
  });

  it('TM8 targets must match', async () => {
    const wrongEng = await call('POST', '/api/time', {
      cookie: cookieA,
      body: { clientId: clientA, engagementId: engA2, workDate: '2026-11-02', minutes: 10 },
    });
    expect(wrongEng.status).toBe(400);
    expect(await wrongEng.json()).toEqual({ error: 'Engagement is not for this entity' });
    const wrongTask = await call('POST', '/api/time', {
      cookie: cookieA,
      body: { clientId: clientA, engagementId: engA, taskId: taskA2, workDate: '2026-11-02', minutes: 10 },
    });
    expect(wrongTask.status).toBe(400);
    expect(await wrongTask.json()).toEqual({ error: 'Task is not in this engagement' });
    const wrongClient = await call('POST', '/api/time', {
      cookie: cookieA,
      body: { clientId: clientB, workDate: '2026-11-02', minutes: 10 },
    });
    expect(wrongClient.status).toBe(400);
    expect(await wrongClient.json()).toEqual({ error: 'Unknown entity' });
  });

  it('TM9 members change only their own time', async () => {
    const mine = await addTime(memberCookie, { clientId: clientA, workDate: '2026-11-04', minutes: 30 });
    expect(mine.canEdit).toBe(true);
    const owners = await addTime(cookieA, { clientId: clientA, workDate: '2026-11-04', minutes: 60 });
    lastAEntryId = owners.id;
    const patch = await call('PATCH', `/api/time/${owners.id}`, { cookie: memberCookie, body: { minutes: 5 } });
    expect(patch.status).toBe(403);
    expect(await patch.json()).toEqual({ error: 'You can only change your own time' });
    const del = await call('DELETE', `/api/time/${owners.id}`, { cookie: memberCookie });
    expect(del.status).toBe(403);
    expect(await del.json()).toEqual({ error: 'You can only change your own time' });
    const seen = await listTime(memberCookie, `?clientId=${clientA}`);
    const seenOwners = seen.find((e) => e.id === owners.id);
    expect(seenOwners).toBeDefined();
    expect(seenOwners!.canEdit).toBe(false);
    const fix = await call('PATCH', `/api/time/${mine.id}`, { cookie: cookieA, body: { minutes: 45, note: 'Fixed' } });
    expect(fix.status).toBe(200);
    const fixed = ((await fix.json()) as { entry: TimeEntryView }).entry;
    expect(fixed.minutes).toBe(45);
    expect(fixed.note).toBe('Fixed');
    const own = await call('PATCH', `/api/time/${mine.id}`, { cookie: memberCookie, body: { billable: false } });
    expect(own.status).toBe(200);
  });

  it('TM10 an invoiced entry is locked', async () => {
    const entry = await addTime(cookieA, { clientId: clientA, workDate: '2026-11-05', minutes: 20 });
    const invoiceId = randomUUID();
    await withOrg(orgA, (tx) => tx.update(timeEntry).set({ invoiceId }).where(eq(timeEntry.id, entry.id)));
    const patch = await call('PATCH', `/api/time/${entry.id}`, { cookie: cookieA, body: { minutes: 5 } });
    expect(patch.status).toBe(409);
    expect(await patch.json()).toEqual({ error: 'This entry is on an invoice and cannot be changed' });
    const del = await call('DELETE', `/api/time/${entry.id}`, { cookie: cookieA });
    expect(del.status).toBe(409);
    expect(await del.json()).toEqual({ error: 'This entry is on an invoice and cannot be changed' });
    const listed = (await listTime(cookieA, `?clientId=${clientA}&from=2026-11-05&to=2026-11-05`)).find((e) => e.id === entry.id);
    expect(listed).toBeDefined();
    expect(listed!.canEdit).toBe(false);
    expect(listed!.invoiceId).toBe(invoiceId);
  });

  it('TM11 a running timer cannot be edited but can be discarded', async () => {
    const r = await startTimer(cookieA, { clientId: clientA, workDate: '2026-11-06' });
    expect(r.status).toBe(201);
    const id = (r.json as { timer: TimeEntryView }).timer.id;
    const patch = await call('PATCH', `/api/time/${id}`, { cookie: cookieA, body: { minutes: 5 } });
    expect(patch.status).toBe(409);
    expect(await patch.json()).toEqual({ error: 'Stop the timer first' });
    const del = await call('DELETE', `/api/time/${id}`, { cookie: cookieA });
    expect(del.status).toBe(204);
    const timer = await call('GET', '/api/time/timer', { cookie: cookieA });
    expect(await timer.json()).toEqual({ timer: null });
  });

  it('TM12 deleting a task or engagement keeps the time', async () => {
    const engDel = await makeEngagement(clientA, 'To delete');
    const taskDel = await makeTask(engDel, 'Task to delete');
    const first = await addTime(cookieA, { clientId: clientA, engagementId: engDel, taskId: taskDel, workDate: '2026-11-02', minutes: 10 });
    expect(first.taskId).toBe(taskDel);
    const delTask = await call('DELETE', `/api/engagements/${engDel}/tasks/${taskDel}`, { cookie: cookieA });
    expect(delTask.status).toBe(204);
    const afterTask = (await listTime(cookieA, `?clientId=${clientA}&from=2026-11-02&to=2026-11-02`)).find((e) => e.id === first.id);
    expect(afterTask).toBeDefined();
    expect(afterTask!.taskId).toBeNull();
    expect(afterTask!.engagementId).toBe(engDel);

    const task2 = await makeTask(engDel, 'Second task');
    const second = await addTime(cookieA, { clientId: clientA, engagementId: engDel, taskId: task2, workDate: '2026-11-02', minutes: 15 });
    const delEng = await call('DELETE', `/api/engagements/${engDel}`, { cookie: cookieA });
    expect(delEng.status).toBe(204);
    const all = await listTime(cookieA, `?clientId=${clientA}&from=2026-11-02&to=2026-11-02`);
    for (const id of [first.id, second.id]) {
      const e = all.find((x) => x.id === id);
      expect(e).toBeDefined();
      expect(e!.engagementId).toBeNull();
      expect(e!.taskId).toBeNull();
    }
  });

  it('TM13 the engagement filter shows every member\'s time', async () => {
    await addTime(cookieA, { clientId: clientA, engagementId: engA, workDate: '2026-11-07', minutes: 11 });
    await addTime(memberCookie, { clientId: clientA, engagementId: engA, workDate: '2026-11-07', minutes: 12 });
    await addTime(cookieA, { clientId: clientA2, engagementId: engA2, workDate: '2026-11-07', minutes: 13 });
    const entries = await listTime(memberCookie, `?engagementId=${engA}`);
    const users = new Set(entries.map((e) => e.userId));
    expect(users.has(userA)).toBe(true);
    expect(users.has(memberUserId)).toBe(true);
    expect(entries.every((e) => e.engagementId === engA)).toBe(true);
  });

  it('TM14 a bad filter', async () => {
    const badDate = await call('GET', '/api/time?from=2026-13-01', { cookie: cookieA });
    expect(badDate.status).toBe(400);
    expect(await badDate.json()).toEqual({ error: 'Invalid filter' });
    const badMine = await call('GET', '/api/time?mine=yes', { cookie: cookieA });
    expect(badMine.status).toBe(400);
  });
});

describe('time isolation', () => {
  it('TI1 the bare pool sees no time rows', async () => {
    const r = await pool.query('select count(*)::int as n from time_entry');
    expect((r.rows[0] as { n: number }).n).toBe(0);
  });

  it('TI2 withOrg(orgB) sees none of firm A\'s rows', async () => {
    const fromB = await withOrg(orgB, (tx) => tx.select({ id: timeEntry.id }).from(timeEntry).where(eq(timeEntry.orgId, orgA)));
    expect(fromB).toHaveLength(0);
    const fromA = await withOrg(orgA, (tx) => tx.select({ id: timeEntry.id }).from(timeEntry).where(eq(timeEntry.orgId, orgA)));
    expect(fromA.length).toBeGreaterThan(0);
  });

  it('TI3 inserting with another firm\'s org_id fails', async () => {
    const msg = await failure(
      withOrg(orgA, (tx) =>
        tx.insert(timeEntry).values({ orgId: orgB, userId: userA, clientId: clientB, workDate: '2026-11-02', minutes: 5 }),
      ),
    );
    expect(msg).toMatch(/row-level security/);
  });

  it('TI4 the database allows one running timer', async () => {
    const msg = await failure(
      withOrg(orgB, async (tx) => {
        const row = { orgId: orgB, userId: 'ti4-user', clientId: clientB, workDate: '2026-11-02', startedAt: new Date() };
        await tx.insert(timeEntry).values(row);
        await tx.insert(timeEntry).values(row);
      }),
    );
    expect(msg).toMatch(/time_entry_one_running_idx/);
  });

  it('TI5 the checks', async () => {
    const base = { orgId: orgB, userId: 'ti5', clientId: clientB, workDate: '2026-11-02' };
    expect(await failure(withOrg(orgB, (tx) => tx.insert(timeEntry).values({ ...base, minutes: 1441 })))).toMatch(
      /time_entry_minutes_check/,
    );
    expect(await failure(withOrg(orgB, (tx) => tx.insert(timeEntry).values({ ...base, minutes: null })))).toMatch(
      /time_entry_running_check/,
    );
    expect(
      await failure(withOrg(orgB, (tx) => tx.insert(timeEntry).values({ ...base, minutes: 5, note: 'x'.repeat(501) }))),
    ).toMatch(/time_entry_note_check/);
  });

  it('TI6 another firm\'s engagement is refused by the database', async () => {
    const msg = await failure(
      withOrg(orgB, (tx) =>
        tx.insert(timeEntry).values({ orgId: orgB, userId: 'ti6', clientId: clientB, engagementId: engA, workDate: '2026-11-02', minutes: 5 }),
      ),
    );
    expect(msg).toMatch(/time_entry_engagement_fk/);
  });

  it('TI7 an engagement of another entity is refused by the database', async () => {
    const msg = await failure(
      withOrg(orgA, (tx) =>
        tx.insert(timeEntry).values({ orgId: orgA, userId: 'ti7', clientId: clientA2, engagementId: engA, workDate: '2026-11-02', minutes: 5 }),
      ),
    );
    expect(msg).toMatch(/time_entry_engagement_fk/);
  });

  it('TI8 firm B cannot reach firm A\'s time', async () => {
    expect(lastAEntryId).not.toBe('');
    const list = await call('GET', `/api/time?engagementId=${engA}`, { cookie: cookieB });
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual({ entries: [] });
    const patch = await call('PATCH', `/api/time/${lastAEntryId}`, { cookie: cookieB, body: { minutes: 5 } });
    expect(patch.status).toBe(404);
    expect(await patch.json()).toEqual({ error: 'Time entry not found' });
    const del = await call('DELETE', `/api/time/${lastAEntryId}`, { cookie: cookieB });
    expect(del.status).toBe(404);
    expect(await del.json()).toEqual({ error: 'Time entry not found' });
    const post = await call('POST', '/api/time', {
      cookie: cookieB,
      body: { clientId: clientA, workDate: '2026-11-02', minutes: 5 },
    });
    expect(post.status).toBe(400);
    expect(await post.json()).toEqual({ error: 'Unknown entity' });
    const timer = await call('GET', '/api/time/timer', { cookie: cookieB });
    expect(await timer.json()).toEqual({ timer: null });
  });
});
