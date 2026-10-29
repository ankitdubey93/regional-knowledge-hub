import { and, asc, eq, sql } from 'drizzle-orm';
import { engagement, member, task } from '../db/schema';
import { withOrg, type Tx } from '../db/withOrg';
import type { TaskCreate, TaskPatch, TaskView } from '../types/engagements';

// Every tenant query runs inside withOrg and keeps an explicit org_id predicate (Hard rule 11). Never logs a title (Hard rule 13).

export function toTaskView(r: typeof task.$inferSelect): TaskView {
  return {
    id: r.id,
    engagementId: r.engagementId,
    title: r.title,
    position: r.position,
    assigneeId: r.assigneeId,
    dueOn: r.dueOn,
    estimateMinutes: r.estimateMinutes,
    status: r.status,
    doneAt: r.doneAt ? r.doneAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Inside a caller's withOrg. Ordered by position asc, created_at asc, id asc. */
export async function listTasksIn(tx: Tx, orgId: string, engagementId: string): Promise<TaskView[]> {
  const rows = await tx
    .select()
    .from(task)
    .where(and(eq(task.orgId, orgId), eq(task.engagementId, engagementId)))
    .orderBy(asc(task.position), asc(task.createdAt), asc(task.id));
  return rows.map(toTaskView);
}

async function engagementExists(tx: Tx, orgId: string, engagementId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: engagement.id })
    .from(engagement)
    .where(and(eq(engagement.id, engagementId), eq(engagement.orgId, orgId)))
    .limit(1);
  return rows.length > 0;
}

/** null when the engagement is not in this firm. position = (max position in the engagement) + 1, or 0; status 'todo'. */
export async function addTask(orgId: string, engagementId: string, input: TaskCreate): Promise<TaskView | null> {
  return withOrg(orgId, async (tx) => {
    if (!(await engagementExists(tx, orgId, engagementId))) return null;
    const max = await tx
      .select({ m: sql<number | null>`max(${task.position})` })
      .from(task)
      .where(and(eq(task.orgId, orgId), eq(task.engagementId, engagementId)));
    const current = max[0]?.m;
    const position = current === null || current === undefined ? 0 : Number(current) + 1;
    const rows = await tx
      .insert(task)
      .values({ orgId, engagementId, title: input.title, position, status: 'todo' })
      .returning();
    return toTaskView(rows[0]!);
  });
}

export type TaskPatchOutcome = { task: TaskView } | { notFound: true } | { badAssignee: true };

export async function updateTask(orgId: string, engagementId: string, taskId: string, patch: TaskPatch): Promise<TaskPatchOutcome> {
  return withOrg(orgId, async (tx): Promise<TaskPatchOutcome> => {
    if (typeof patch.assigneeId === 'string') {
      const m = await tx
        .select({ userId: member.userId })
        .from(member)
        .where(and(eq(member.organizationId, orgId), eq(member.userId, patch.assigneeId)))
        .limit(1);
      if (m.length === 0) return { badAssignee: true };
    }
    const rows = await tx
      .update(task)
      .set({
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.assigneeId !== undefined ? { assigneeId: patch.assigneeId } : {}),
        ...(patch.dueOn !== undefined ? { dueOn: patch.dueOn } : {}),
        ...(patch.estimateMinutes !== undefined ? { estimateMinutes: patch.estimateMinutes } : {}),
        ...(patch.status !== undefined
          ? { doneAt: patch.status === 'done' ? sql`coalesce(${task.doneAt}, now())` : null }
          : {}),
        updatedAt: sql`now()`,
      })
      .where(and(eq(task.id, taskId), eq(task.engagementId, engagementId), eq(task.orgId, orgId)))
      .returning();
    if (!rows[0]) return { notFound: true };
    return { task: toTaskView(rows[0]) };
  });
}

/** null when the task is not in this engagement and firm. Swaps position with the neighbour; no change at the ends. */
export async function moveTask(orgId: string, engagementId: string, taskId: string, direction: 'up' | 'down'): Promise<TaskView[] | null> {
  return withOrg(orgId, async (tx) => {
    const list = await listTasksIn(tx, orgId, engagementId);
    const i = list.findIndex((t) => t.id === taskId);
    if (i < 0) return null;
    const j = direction === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return list;
    const a = list[i]!;
    const b = list[j]!;
    // Positions can tie; use the list order to give each task a distinct slot, then swap.
    const posA = Math.min(a.position, b.position);
    const posB = posA === a.position && a.position === b.position ? posA + 1 : Math.max(a.position, b.position);
    const first = i < j ? a : b;
    const second = i < j ? b : a;
    // After the swap the earlier-listed task takes the later slot and vice versa.
    await tx
      .update(task)
      .set({ position: posB, updatedAt: sql`now()` })
      .where(and(eq(task.id, first.id), eq(task.engagementId, engagementId), eq(task.orgId, orgId)));
    await tx
      .update(task)
      .set({ position: posA, updatedAt: sql`now()` })
      .where(and(eq(task.id, second.id), eq(task.engagementId, engagementId), eq(task.orgId, orgId)));
    return listTasksIn(tx, orgId, engagementId);
  });
}

/** false when the task is not in this engagement and firm. */
export async function deleteTask(orgId: string, engagementId: string, taskId: string): Promise<boolean> {
  return withOrg(orgId, async (tx) => {
    const rows = await tx
      .delete(task)
      .where(and(eq(task.id, taskId), eq(task.engagementId, engagementId), eq(task.orgId, orgId)))
      .returning({ id: task.id });
    return rows.length > 0;
  });
}
