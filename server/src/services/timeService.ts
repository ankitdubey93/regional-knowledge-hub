// Every tenant query runs inside withOrg and keeps an explicit org_id predicate (Hard rule 11). Never logs a note (Hard rule 13).
import { and, desc, eq, gte, isNotNull, isNull, lte, sql, type SQL } from 'drizzle-orm';
import { MAX_ENTRY_MINUTES } from '@chub/shared/utils/timesheet';
import { client, engagement, task, timeEntry, user } from '../db/schema';
import { withOrg, type Tx } from '../db/withOrg';
import type { FirmRole } from '../types';
import type { TimeEntryCreate, TimeEntryPatch, TimeEntryView, TimeFilter, TimerStart } from '../types/time';

export interface Viewer {
  userId: string;
  role: FirmRole;
}

export type TargetOutcome = { entry: TimeEntryView } | { badClient: true } | { badEngagement: true } | { badTask: true };
export type StartOutcome =
  | { timer: TimeEntryView }
  | { running: true }
  | { badClient: true }
  | { badEngagement: true }
  | { badTask: true };
export type ChangeOutcome =
  | { entry: TimeEntryView }
  | { notFound: true }
  | { forbidden: true }
  | { locked: true }
  | { running: true };
export type DeleteOutcome = { deleted: true } | { notFound: true } | { forbidden: true } | { locked: true };

async function selectViews(tx: Tx, orgId: string, viewer: Viewer, where: SQL | undefined): Promise<TimeEntryView[]> {
  const rows = await tx
    .select({
      id: timeEntry.id,
      userId: timeEntry.userId,
      userName: user.name,
      clientId: timeEntry.clientId,
      clientName: client.name,
      engagementId: timeEntry.engagementId,
      engagementTitle: engagement.title,
      taskId: timeEntry.taskId,
      taskTitle: task.title,
      workDate: timeEntry.workDate,
      startedAt: timeEntry.startedAt,
      minutes: timeEntry.minutes,
      billable: timeEntry.billable,
      note: timeEntry.note,
      invoiceId: timeEntry.invoiceId,
      createdAt: timeEntry.createdAt,
      updatedAt: timeEntry.updatedAt,
    })
    .from(timeEntry)
    .innerJoin(client, and(eq(client.id, timeEntry.clientId), eq(client.orgId, orgId)))
    .leftJoin(engagement, and(eq(engagement.id, timeEntry.engagementId), eq(engagement.orgId, orgId)))
    .leftJoin(task, and(eq(task.id, timeEntry.taskId), eq(task.orgId, orgId)))
    .leftJoin(user, eq(user.id, timeEntry.userId))
    .where(and(eq(timeEntry.orgId, orgId), where))
    .orderBy(desc(timeEntry.workDate), desc(timeEntry.createdAt), desc(timeEntry.id))
    .limit(500);
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.userName ?? 'Former user',
    clientId: r.clientId,
    clientName: r.clientName,
    engagementId: r.engagementId,
    engagementTitle: r.engagementTitle ?? null,
    taskId: r.taskId,
    taskTitle: r.taskTitle ?? null,
    workDate: r.workDate,
    startedAt: r.startedAt ? r.startedAt.toISOString() : null,
    minutes: r.minutes,
    billable: r.billable,
    note: r.note,
    invoiceId: r.invoiceId,
    canEdit: r.invoiceId === null && r.minutes !== null && (viewer.role !== 'member' || r.userId === viewer.userId),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

async function checkTarget(
  tx: Tx,
  orgId: string,
  t: { clientId: string; engagementId: string | null; taskId: string | null },
): Promise<'ok' | 'badClient' | 'badEngagement' | 'badTask'> {
  const c = await tx
    .select({ id: client.id })
    .from(client)
    .where(and(eq(client.id, t.clientId), eq(client.orgId, orgId)))
    .limit(1);
  if (c.length === 0) return 'badClient';
  if (t.engagementId !== null) {
    const e = await tx
      .select({ id: engagement.id })
      .from(engagement)
      .where(and(eq(engagement.id, t.engagementId), eq(engagement.orgId, orgId), eq(engagement.clientId, t.clientId)))
      .limit(1);
    if (e.length === 0) return 'badEngagement';
  }
  if (t.taskId !== null) {
    const k = await tx
      .select({ id: task.id })
      .from(task)
      .where(
        and(
          eq(task.id, t.taskId),
          eq(task.orgId, orgId),
          t.engagementId === null ? sql`false` : eq(task.engagementId, t.engagementId),
        ),
      )
      .limit(1);
    if (k.length === 0) return 'badTask';
  }
  return 'ok';
}

// Drizzle wraps the Postgres error; code and constraint are on .cause.
function isRunningViolation(err: unknown): boolean {
  if (!(err instanceof Error) || !(err.cause instanceof Error)) return false;
  const cause = err.cause;
  return (
    'code' in cause &&
    cause.code === '23505' &&
    'constraint' in cause &&
    cause.constraint === 'time_entry_one_running_idx'
  );
}

export async function listEntries(orgId: string, viewer: Viewer, filter: TimeFilter): Promise<TimeEntryView[]> {
  const conds: SQL[] = [isNotNull(timeEntry.minutes)];
  if (filter.from !== undefined) conds.push(gte(timeEntry.workDate, filter.from));
  if (filter.to !== undefined) conds.push(lte(timeEntry.workDate, filter.to));
  if (filter.mine === '1') conds.push(eq(timeEntry.userId, viewer.userId));
  if (filter.clientId !== undefined) conds.push(eq(timeEntry.clientId, filter.clientId));
  if (filter.engagementId !== undefined) conds.push(eq(timeEntry.engagementId, filter.engagementId));
  return withOrg(orgId, (tx) => selectViews(tx, orgId, viewer, and(...conds)));
}

export async function getTimer(orgId: string, viewer: Viewer): Promise<TimeEntryView | null> {
  return withOrg(orgId, async (tx) => {
    const rows = await selectViews(
      tx,
      orgId,
      viewer,
      and(eq(timeEntry.userId, viewer.userId), isNull(timeEntry.minutes)),
    );
    return rows[0] ?? null;
  });
}

export async function startTimer(orgId: string, viewer: Viewer, input: TimerStart): Promise<StartOutcome> {
  try {
    return await withOrg(orgId, async (tx): Promise<StartOutcome> => {
      const check = await checkTarget(tx, orgId, input);
      if (check !== 'ok') return { [check]: true } as { badClient: true } | { badEngagement: true } | { badTask: true };
      const existing = await tx
        .select({ id: timeEntry.id })
        .from(timeEntry)
        .where(and(eq(timeEntry.orgId, orgId), eq(timeEntry.userId, viewer.userId), isNull(timeEntry.minutes)))
        .limit(1);
      if (existing.length > 0) return { running: true };
      const inserted = await tx
        .insert(timeEntry)
        .values({
          orgId,
          userId: viewer.userId,
          clientId: input.clientId,
          engagementId: input.engagementId,
          taskId: input.taskId,
          workDate: input.workDate,
          startedAt: sql`now()`,
          minutes: null,
          billable: input.billable,
          note: input.note,
        })
        .returning({ id: timeEntry.id });
      const views = await selectViews(tx, orgId, viewer, eq(timeEntry.id, inserted[0]!.id));
      return { timer: views[0]! };
    });
  } catch (err) {
    if (isRunningViolation(err)) return { running: true };
    throw err;
  }
}

export async function stopTimer(
  orgId: string,
  viewer: Viewer,
): Promise<{ entry: TimeEntryView; capped: boolean } | null> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .update(timeEntry)
      .set({
        minutes: sql`least(${MAX_ENTRY_MINUTES}::int, ceil(extract(epoch from (now() - ${timeEntry.startedAt})) / 60))::int`,
        updatedAt: sql`now()`,
      })
      .where(and(eq(timeEntry.orgId, orgId), eq(timeEntry.userId, viewer.userId), isNull(timeEntry.minutes)))
      .returning({
        id: timeEntry.id,
        capped: sql<boolean>`ceil(extract(epoch from (now() - ${timeEntry.startedAt})) / 60) > ${MAX_ENTRY_MINUTES}::int`,
      });
    const row = rows[0];
    if (!row) return null;
    const views = await selectViews(tx, orgId, viewer, eq(timeEntry.id, row.id));
    return { entry: views[0]!, capped: row.capped };
  });
}

export async function addEntry(orgId: string, viewer: Viewer, input: TimeEntryCreate): Promise<TargetOutcome> {
  return withOrg(orgId, async (tx): Promise<TargetOutcome> => {
    const check = await checkTarget(tx, orgId, input);
    if (check !== 'ok') return { [check]: true } as { badClient: true } | { badEngagement: true } | { badTask: true };
    const inserted = await tx
      .insert(timeEntry)
      .values({
        orgId,
        userId: viewer.userId,
        clientId: input.clientId,
        engagementId: input.engagementId,
        taskId: input.taskId,
        workDate: input.workDate,
        startedAt: null,
        minutes: input.minutes,
        billable: input.billable,
        note: input.note,
      })
      .returning({ id: timeEntry.id });
    const views = await selectViews(tx, orgId, viewer, eq(timeEntry.id, inserted[0]!.id));
    return { entry: views[0]! };
  });
}

export async function updateEntry(
  orgId: string,
  viewer: Viewer,
  id: string,
  patch: TimeEntryPatch,
): Promise<ChangeOutcome> {
  return withOrg(orgId, async (tx): Promise<ChangeOutcome> => {
    const found = await tx
      .select({ userId: timeEntry.userId, minutes: timeEntry.minutes, invoiceId: timeEntry.invoiceId })
      .from(timeEntry)
      .where(and(eq(timeEntry.id, id), eq(timeEntry.orgId, orgId)))
      .for('update');
    const row = found[0];
    if (!row) return { notFound: true };
    if (viewer.role === 'member' && row.userId !== viewer.userId) return { forbidden: true };
    if (row.invoiceId !== null) return { locked: true };
    if (row.minutes === null) return { running: true };
    const updated = await tx
      .update(timeEntry)
      .set({
        ...(patch.workDate !== undefined ? { workDate: patch.workDate } : {}),
        ...(patch.minutes !== undefined ? { minutes: patch.minutes } : {}),
        ...(patch.billable !== undefined ? { billable: patch.billable } : {}),
        ...(patch.note !== undefined ? { note: patch.note } : {}),
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(timeEntry.id, id),
          eq(timeEntry.orgId, orgId),
          isNull(timeEntry.invoiceId),
          isNotNull(timeEntry.minutes),
        ),
      )
      .returning({ id: timeEntry.id });
    if (updated.length === 0) return { locked: true };
    const views = await selectViews(tx, orgId, viewer, eq(timeEntry.id, id));
    return { entry: views[0]! };
  });
}

export async function deleteEntry(orgId: string, viewer: Viewer, id: string): Promise<DeleteOutcome> {
  return withOrg(orgId, async (tx): Promise<DeleteOutcome> => {
    const found = await tx
      .select({ userId: timeEntry.userId, invoiceId: timeEntry.invoiceId })
      .from(timeEntry)
      .where(and(eq(timeEntry.id, id), eq(timeEntry.orgId, orgId)))
      .for('update');
    const row = found[0];
    if (!row) return { notFound: true };
    if (viewer.role === 'member' && row.userId !== viewer.userId) return { forbidden: true };
    if (row.invoiceId !== null) return { locked: true };
    const deleted = await tx
      .delete(timeEntry)
      .where(and(eq(timeEntry.id, id), eq(timeEntry.orgId, orgId), isNull(timeEntry.invoiceId)))
      .returning({ id: timeEntry.id });
    if (deleted.length === 0) return { locked: true };
    return { deleted: true };
  });
}
