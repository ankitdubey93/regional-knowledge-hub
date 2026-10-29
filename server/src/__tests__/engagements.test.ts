import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import factsJson from '@chub/shared/seed/facts.json';
import { ENGAGEMENT_TEMPLATES } from '@chub/shared/data/engagementTemplates';
import { factsSchema } from '@chub/shared/data/schemas';
import { DEADLINE_FACT_KEYS, addDays, deadlineRulesFrom, obligationsFor, type CalendarProfile } from '@chub/shared/utils/deadlines';
import { OPEN_WINDOW_DAYS, engagementDraftsFor } from '@chub/shared/utils/engagements';
import { auth } from '../auth';
import { pool } from '../db/client';
import { engagement, engagementTemplate, task } from '../db/schema';
import { withOrg } from '../db/withOrg';
import { seedFacts } from '../kb/seedFacts';
import { openForObligations } from '../services/engagementService';
import type { EngagementView, MemberView, TaskView, TemplateView } from '../types/engagements';
import { call, createFirm, mergeCookies, signUp } from './helpers';
import { startApp, stopApp } from './server';

const all = factsSchema.parse(factsJson);

let cookieA = '';
let cookieB = '';
let memberCookie = '';
let orgA = '';
let orgB = '';
let userA = '';
let userB = '';
let memberUserId = '';
let auSole = '';
let mixed = '';
let bClient = '';
let bEngagement = '';
let copiedId = '';
let egId = '';
let firmEgId = '';
let firmTaskIds: string[] = [];
let tasks5: TaskView[] = [];

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

const clientUrl = (clientId: string, suffix = '') => `/api/clients/${clientId}/engagements${suffix}`;
const egUrl = (suffix = '') => `/api/engagements${suffix}`;

async function tasksOf(id: string): Promise<TaskView[]> {
  const res = await call('GET', egUrl(`/${id}`), { cookie: cookieA });
  return ((await res.json()) as { tasks: TaskView[] }).tasks;
}

beforeAll(async () => {
  await startApp();
  await seedFacts(Object.fromEntries(DEADLINE_FACT_KEYS.map((k) => [k, all[k]!])), new Date().toISOString().slice(0, 10));
  const a = await signUp();
  const firmA = await createFirm(a.cookie, 'Engagements Firm A');
  cookieA = firmA.cookie;
  orgA = firmA.orgId;
  userA = a.userId;
  const b = await signUp();
  const firmB = await createFirm(b.cookie, 'Engagements Firm B');
  cookieB = firmB.cookie;
  orgB = firmB.orgId;
  userB = b.userId;

  const m = await signUp();
  memberUserId = m.userId;
  await auth.api.addMember({ body: { userId: m.userId, organizationId: firmA.orgId, role: 'member' } });
  const active = await call('POST', '/api/auth/organization/set-active', {
    cookie: m.cookie,
    body: { organizationId: firmA.orgId },
  });
  if (active.status !== 200) throw new Error(`member set-active failed: ${active.status}`);
  memberCookie = mergeCookies(m.cookie, active);

  auSole = await makeClient(cookieA, {
    name: 'Eng Sole',
    jurisdiction: 'AU',
    entityType: 'sole_trader',
    fyEndMonth: 6,
    taxRegistered: true,
    taxPeriod: 'quarterly',
  });
  mixed = await makeClient(cookieA, { name: 'Eng Mixed', jurisdiction: 'AU+UK', entityType: 'company', fyEndMonth: 6 });
  bClient = await makeClient(cookieB, { name: 'Eng B Pty Ltd', jurisdiction: 'AU', entityType: 'company', fyEndMonth: 6 });
  const be = await call('POST', clientUrl(bClient), {
    cookie: cookieB,
    body: { templateId: 'seed:bas', title: 'B BAS', dueOn: '2026-11-28', periodEnd: '2026-09-30' },
  });
  if (be.status !== 201) throw new Error(`b engagement failed: ${be.status}`);
  bEngagement = ((await be.json()) as { engagement: EngagementView }).engagement.id;
}, 60_000);

afterAll(async () => {
  await stopApp();
  await pool.end();
});

const seedBas = ENGAGEMENT_TEMPLATES.templates.find((t) => t.id === 'bas')!;

describe('engagements', () => {
  it("EG1 lists seeded templates and none of the firm's", async () => {
    const res = await call('GET', '/api/engagement-templates', { cookie: cookieA });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { seeded: unknown[]; templates: unknown[] };
    expect(body.seeded.length).toBe(5);
    expect(body.templates).toEqual([]);
  });

  it('EG2 copies a seeded template', async () => {
    const res = await call('POST', '/api/engagement-templates', { cookie: cookieA, body: { seedId: 'bas' } });
    expect(res.status).toBe(201);
    const { template } = (await res.json()) as { template: TemplateView };
    expect(template.seedId).toBe('bas');
    expect(template.kind).toBe('bas');
    expect(template.steps).toEqual(seedBas.steps);
    copiedId = template.id;
  });

  it('EG3 rejects an unknown seed', async () => {
    const res = await call('POST', '/api/engagement-templates', { cookie: cookieA, body: { seedId: 'nope' } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Unknown template' });
  });

  it('EG4 edits a firm template', async () => {
    const steps = [
      { title: 'Check', estimateMinutes: 15 },
      { title: 'Lodge', estimateMinutes: null },
    ];
    const res = await call('PATCH', `/api/engagement-templates/${copiedId}`, { cookie: cookieA, body: { name: 'Our BAS', steps } });
    expect(res.status).toBe(200);
    const { template } = (await res.json()) as { template: TemplateView };
    expect(template.name).toBe('Our BAS');
    expect(template.steps).toEqual(steps);
    const bad = await call('PATCH', `/api/engagement-templates/${copiedId}`, { cookie: cookieA, body: { steps: [] } });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: 'Invalid input' });
  });

  it('EG5 creates an engagement from a seeded template', async () => {
    const res = await call('POST', clientUrl(auSole), {
      cookie: cookieA,
      body: { templateId: 'seed:bas', title: 'BAS Q1', dueOn: '2026-11-28', periodEnd: '2026-09-30' },
    });
    expect(res.status).toBe(201);
    const { engagement: e } = (await res.json()) as { engagement: EngagementView };
    expect(e.status).toBe('planned');
    expect(e.templateId).toBe('seed:bas');
    expect(e.taskCount).toBe(8);
    expect(e.doneCount).toBe(0);
    expect(e.clientName).toBe('Eng Sole');
    egId = e.id;
    tasks5 = await tasksOf(egId);
    expect(tasks5.map((t) => t.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(tasks5.every((t) => t.status === 'todo')).toBe(true);
  });

  it('EG6 creates from a firm template with its steps', async () => {
    const res = await call('POST', clientUrl(auSole), {
      cookie: cookieA,
      body: { templateId: `firm:${copiedId}`, title: 'Our BAS Q1', dueOn: '2026-11-28', periodEnd: null },
    });
    expect(res.status).toBe(201);
    const { engagement: e } = (await res.json()) as { engagement: EngagementView };
    firmEgId = e.id;
    const ts = await tasksOf(firmEgId);
    firmTaskIds = ts.map((t) => t.id);
    expect(ts.map((t) => t.title)).toEqual(['Check', 'Lodge']);
    expect(ts.map((t) => t.estimateMinutes)).toEqual([15, null]);
  });

  it('EG7 rejects an unknown firm template', async () => {
    const res = await call('POST', clientUrl(auSole), {
      cookie: cookieA,
      body: { templateId: `firm:${randomUUID()}`, title: 'X', dueOn: '2026-11-28', periodEnd: null },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Unknown template' });
  });

  it('EG8 filters the firm-wide list', async () => {
    const ids = async (q: string) => {
      const res = await call('GET', egUrl(q), { cookie: cookieA });
      expect(res.status).toBe(200);
      return ((await res.json()) as { engagements: EngagementView[] }).engagements.map((e) => e.id);
    };
    expect(await ids('?status=active')).toContain(egId);
    expect(await ids('?status=done')).not.toContain(egId);
    expect(await ids(`?clientId=${auSole}`)).toContain(egId);
    expect(await ids('?dueBefore=2026-11-01')).not.toContain(egId);
    const bad = await call('GET', egUrl('?status=x'), { cookie: cookieA });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'Invalid filter' });
  });

  it('EG9 mine=1 lists only engagements with my tasks', async () => {
    const ids = async () => {
      const res = await call('GET', egUrl('?mine=1&status=all'), { cookie: cookieA });
      return ((await res.json()) as { engagements: EngagementView[] }).engagements.map((e) => e.id);
    };
    expect(await ids()).not.toContain(egId);
    const res = await call('PATCH', egUrl(`/${egId}/tasks/${tasks5[0]!.id}`), { cookie: cookieA, body: { assigneeId: userA } });
    expect(res.status).toBe(200);
    expect(await ids()).toContain(egId);
  });

  it('EG10 assigns only members of the firm', async () => {
    const ok = await call('PATCH', egUrl(`/${egId}/tasks/${tasks5[1]!.id}`), { cookie: cookieA, body: { assigneeId: memberUserId } });
    expect(ok.status).toBe(200);
    const bad = await call('PATCH', egUrl(`/${egId}/tasks/${tasks5[1]!.id}`), { cookie: cookieA, body: { assigneeId: userB } });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'Assignee is not a member of this firm' });
  });

  it('EG11 done sets doneAt and reopening clears it', async () => {
    const done = await call('PATCH', egUrl(`/${egId}/tasks/${tasks5[2]!.id}`), { cookie: cookieA, body: { status: 'done' } });
    expect(done.status).toBe(200);
    expect(((await done.json()) as { task: TaskView }).task.doneAt).not.toBeNull();
    const open = await call('PATCH', egUrl(`/${egId}/tasks/${tasks5[2]!.id}`), { cookie: cookieA, body: { status: 'todo' } });
    expect(((await open.json()) as { task: TaskView }).task.doneAt).toBeNull();
  });

  it('EG12 moves a task down and up', async () => {
    const before = (await tasksOf(egId)).map((t) => t.id);
    const down = await call('POST', egUrl(`/${egId}/tasks/${before[0]}/move`), { cookie: cookieA, body: { direction: 'down' } });
    expect(down.status).toBe(200);
    const afterDown = ((await down.json()) as { tasks: TaskView[] }).tasks.map((t) => t.id);
    expect(afterDown.slice(0, 2)).toEqual([before[1], before[0]]);
    const up = await call('POST', egUrl(`/${egId}/tasks/${before[0]}/move`), { cookie: cookieA, body: { direction: 'up' } });
    expect(((await up.json()) as { tasks: TaskView[] }).tasks.map((t) => t.id)).toEqual(before);
    const edge = await call('POST', egUrl(`/${egId}/tasks/${before[0]}/move`), { cookie: cookieA, body: { direction: 'up' } });
    expect(((await edge.json()) as { tasks: TaskView[] }).tasks.map((t) => t.id)).toEqual(before);
  });

  it('EG13 adds and deletes a task', async () => {
    const add = await call('POST', egUrl(`/${egId}/tasks`), { cookie: cookieA, body: { title: 'Extra' } });
    expect(add.status).toBe(201);
    const { task: t } = (await add.json()) as { task: TaskView };
    expect(t.position).toBe(8);
    const del = await call('DELETE', egUrl(`/${egId}/tasks/${t.id}`), { cookie: cookieA });
    expect(del.status).toBe(204);
    const again = await call('DELETE', egUrl(`/${egId}/tasks/${t.id}`), { cookie: cookieA });
    expect(again.status).toBe(404);
    expect(await again.json()).toEqual({ error: 'Task not found' });
  });

  it('EG14 updates an engagement status', async () => {
    const res = await call('PATCH', egUrl(`/${egId}`), { cookie: cookieA, body: { status: 'review' } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { engagement: EngagementView }).engagement.status).toBe('review');
    const bad = await call('PATCH', egUrl(`/${egId}`), { cookie: cookieA, body: { status: 'lost' } });
    expect(bad.status).toBe(400);
  });

  it('EG15 open needs the switch', async () => {
    const res = await call('POST', clientUrl(auSole, '/open'), { cookie: cookieA });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Turn on engagements from due dates for this entity first' });
  });

  it('EG16 turns on the switch', async () => {
    const res = await call('PATCH', clientUrl(auSole, '/auto'), { cookie: cookieA, body: { enabled: true } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ autoEngagements: true });
    const list = await call('GET', clientUrl(auSole), { cookie: cookieA });
    expect(((await list.json()) as { autoEngagements: boolean }).autoEngagements).toBe(true);
  });

  it('EG17 open matches the engine and is idempotent', async () => {
    const profile: CalendarProfile = {
      jurisdiction: 'AU',
      entityType: 'sole_trader',
      fyEndMonth: 6,
      taxRegistered: true,
      taxPeriod: 'quarterly',
      registeredOn: null,
      vatStaggerMonth: null,
      mtdItsa: false,
    };
    const obligations = obligationsFor(profile, deadlineRulesFrom((k) => all[k]), '2026-10-28', addDays('2026-10-28', OPEN_WINDOW_DAYS));
    const expected = engagementDraftsFor(obligations, () => null).length;
    expect(expected).toBeGreaterThan(0);
    const out = await openForObligations(orgA, userA, auSole, new Date('2026-10-28T00:00:00Z'));
    expect('created' in out).toBe(true);
    if (!('created' in out)) return;
    expect(out.created).toBe(expected);
    expect(out.engagements.filter((e) => e.obligationId !== null).length).toBe(expected);
    const again = await openForObligations(orgA, userA, auSole, new Date('2026-10-28T00:00:00Z'));
    expect('created' in again && again.created).toBe(0);
  });

  it('EG18 open refuses a two-country entity', async () => {
    const on = await call('PATCH', clientUrl(mixed, '/auto'), { cookie: cookieA, body: { enabled: true } });
    expect(on.status).toBe(200);
    const res = await call('POST', clientUrl(mixed, '/open'), { cookie: cookieA });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'Set the entity type, and use one country, to open engagements' });
  });

  it('EG19 a member edits but cannot delete', async () => {
    const patch = await call('PATCH', egUrl(`/${egId}`), { cookie: memberCookie, body: { title: 'BAS Q1 (edited)' } });
    expect(patch.status).toBe(200);
    const del = await call('DELETE', egUrl(`/${egId}`), { cookie: memberCookie });
    expect(del.status).toBe(403);
    expect(await del.json()).toEqual({ error: 'Only firm owners and admins can delete engagements' });
    const delT = await call('DELETE', `/api/engagement-templates/${copiedId}`, { cookie: memberCookie });
    expect(delT.status).toBe(403);
    expect(await delT.json()).toEqual({ error: 'Only firm owners and admins can delete templates' });
  });

  it('EG20 an owner deletes an engagement and its tasks', async () => {
    const del = await call('DELETE', egUrl(`/${egId}`), { cookie: cookieA });
    expect(del.status).toBe(204);
    const rows = await withOrg(orgA, (tx) => tx.select().from(task).where(eq(task.engagementId, egId)));
    expect(rows).toHaveLength(0);
    const get = await call('GET', egUrl(`/${egId}`), { cookie: cookieA });
    expect(get.status).toBe(404);
    expect(await get.json()).toEqual({ error: 'Engagement not found' });
  });

  it("EG21 lists the firm's members", async () => {
    const res = await call('GET', egUrl('/members'), { cookie: cookieA });
    expect(res.status).toBe(200);
    const ids = ((await res.json()) as { members: MemberView[] }).members.map((m) => m.userId);
    expect(ids).toContain(userA);
    expect(ids).toContain(memberUserId);
    expect(ids).not.toContain(userB);
  });
});

describe('engagement isolation', () => {
  it('EI1 the bare pool sees no rows', async () => {
    for (const t of ['engagement_template', 'engagement', 'task']) {
      const r = await pool.query(`select count(*)::int as n from ${t}`);
      expect(r.rows[0].n).toBe(0);
    }
  });

  it("EI2 withOrg(orgB) sees none of firm A's rows", async () => {
    expect(await withOrg(orgB, (tx) => tx.select().from(engagementTemplate).where(eq(engagementTemplate.orgId, orgA)))).toHaveLength(0);
    expect(await withOrg(orgB, (tx) => tx.select().from(engagement).where(eq(engagement.orgId, orgA)))).toHaveLength(0);
    expect(await withOrg(orgB, (tx) => tx.select().from(task).where(eq(task.orgId, orgA)))).toHaveLength(0);
    expect((await withOrg(orgA, (tx) => tx.select().from(engagementTemplate).where(eq(engagementTemplate.orgId, orgA)))).length).toBeGreaterThan(0);
    expect((await withOrg(orgA, (tx) => tx.select().from(engagement).where(eq(engagement.orgId, orgA)))).length).toBeGreaterThan(0);
    expect((await withOrg(orgA, (tx) => tx.select().from(task).where(eq(task.orgId, orgA)))).length).toBeGreaterThan(0);
  });

  it("EI3 inserting with another firm's org_id fails", async () => {
    const m1 = await failure(
      withOrg(orgA, (tx) =>
        tx.insert(engagementTemplate).values({ orgId: orgB, name: 'x', kind: 'bas', steps: [{ title: 'a', estimateMinutes: null }], createdBy: userA }),
      ),
    );
    expect(m1).toMatch(/row-level security/);
    const m2 = await failure(
      withOrg(orgA, (tx) =>
        tx.insert(engagement).values({ orgId: orgB, clientId: auSole, title: 'x', kind: 'bas', dueOn: '2026-11-28', createdBy: userA }),
      ),
    );
    expect(m2).toMatch(/row-level security/);
    const m3 = await failure(
      withOrg(orgA, (tx) => tx.insert(task).values({ orgId: orgB, engagementId: firmEgId, title: 'x', position: 0 })),
    );
    expect(m3).toMatch(/row-level security/);
  });

  it("EI4 an engagement for another firm's client fails", async () => {
    const msg = await failure(
      withOrg(orgA, (tx) =>
        tx.insert(engagement).values({ orgId: orgA, clientId: bClient, title: 'x', kind: 'bas', dueOn: '2026-11-28', createdBy: userA }),
      ),
    );
    expect(msg).toMatch(/foreign key/);
  });

  it("EI5 a task on another firm's engagement fails", async () => {
    const msg = await failure(
      withOrg(orgA, (tx) => tx.insert(task).values({ orgId: orgA, engagementId: bEngagement, title: 'x', position: 0 })),
    );
    expect(msg).toMatch(/foreign key/);
  });

  it('EI6 a done task needs doneAt', async () => {
    const msg = await failure(
      withOrg(orgA, (tx) =>
        tx.insert(task).values({ orgId: orgA, engagementId: firmEgId, title: 'x', position: 9, status: 'done', doneAt: null }),
      ),
    );
    expect(msg).toMatch(/task_done_at_check/);
  });

  it("EI7 firm B gets 404 on every route for firm A's rows", async () => {
    const t0 = firmTaskIds[0]!;
    const results = [
      await call('GET', clientUrl(auSole), { cookie: cookieB }),
      await call('POST', clientUrl(auSole), {
        cookie: cookieB,
        body: { templateId: 'seed:bas', title: 'Nope', dueOn: '2026-11-28', periodEnd: null },
      }),
      await call('PATCH', clientUrl(auSole, '/auto'), { cookie: cookieB, body: { enabled: true } }),
      await call('POST', clientUrl(auSole, '/open'), { cookie: cookieB }),
      await call('GET', egUrl(`/${firmEgId}`), { cookie: cookieB }),
      await call('PATCH', egUrl(`/${firmEgId}`), { cookie: cookieB, body: { status: 'done' } }),
      await call('POST', egUrl(`/${firmEgId}/tasks`), { cookie: cookieB, body: { title: 'Nope' } }),
      await call('PATCH', egUrl(`/${firmEgId}/tasks/${t0}`), { cookie: cookieB, body: { status: 'done' } }),
      await call('POST', egUrl(`/${firmEgId}/tasks/${t0}/move`), { cookie: cookieB, body: { direction: 'down' } }),
      await call('DELETE', egUrl(`/${firmEgId}/tasks/${t0}`), { cookie: cookieB }),
      await call('DELETE', egUrl(`/${firmEgId}`), { cookie: cookieB }),
      await call('GET', `/api/engagement-templates/${copiedId}`, { cookie: cookieB }),
      await call('PATCH', `/api/engagement-templates/${copiedId}`, { cookie: cookieB, body: { name: 'Nope' } }),
      await call('DELETE', `/api/engagement-templates/${copiedId}`, { cookie: cookieB }),
    ];
    expect(results.map((r) => r.status)).toEqual(Array(14).fill(404));
  });
});
