import { and, asc, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { CALENDAR_TIMEZONES, addDays, type CalendarTimezone } from '@chub/shared/utils/deadlines';
import { currentWeekStart, workloadFor, type WorkloadTask } from '@chub/shared/utils/workload';
import { db } from '../db/client';
import { engagement, member, memberCapacity, organization, task, user } from '../db/schema';
import { withOrg } from '../db/withOrg';
import type { WorkloadView } from '../types/workload';

// Every tenant query runs inside withOrg and keeps an explicit org_id predicate (Hard rule 11).
// organization is Better Auth's table, not a tenant table: it is read and written outside withOrg,
// only for the orgId that requireFirm took from the session.

const timezoneSchema = z.enum(CALENDAR_TIMEZONES).nullable();

export async function getFirmTimezone(orgId: string): Promise<CalendarTimezone | null> {
  const rows = await db
    .select({ timezone: organization.timezone })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return timezoneSchema.parse(row.timezone);
}

export async function getWorkload(
  orgId: string,
  week: string | null,
  now: Date,
): Promise<Omit<WorkloadView, 'canEdit'>> {
  const tz = await getFirmTimezone(orgId);
  if (tz === null) return { timezone: null, weekStart: null, nextWeekStart: null, rows: [] };
  const weekStart = week ?? currentWeekStart(tz, now);
  const nextWeekStart = addDays(weekStart, 7);
  const lastDay = addDays(weekStart, 13);

  const { members, tasks } = await withOrg(orgId, async (tx) => {
    const members = await tx
      .select({
        userId: user.id,
        name: user.name,
        email: user.email,
        weeklyMinutes: memberCapacity.weeklyMinutes,
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .leftJoin(memberCapacity, and(eq(memberCapacity.orgId, orgId), eq(memberCapacity.userId, member.userId)))
      .where(eq(member.organizationId, orgId))
      .orderBy(asc(user.name), asc(user.email));
    const tasks = await tx
      .select({
        assigneeId: task.assigneeId,
        estimateMinutes: task.estimateMinutes,
        dueOn: sql<string>`coalesce(${task.dueOn}, ${engagement.dueOn})::text`,
      })
      .from(task)
      .innerJoin(engagement, and(eq(engagement.id, task.engagementId), eq(engagement.orgId, orgId)))
      .where(
        and(
          eq(task.orgId, orgId),
          ne(task.status, 'done'),
          ne(engagement.status, 'done'),
          isNotNull(task.assigneeId),
          sql`coalesce(${task.dueOn}, ${engagement.dueOn}) <= ${lastDay}`,
        ),
      );
    return { members, tasks };
  });

  const workloadTasks: WorkloadTask[] = [];
  for (const t of tasks) {
    if (t.assigneeId === null) continue;
    workloadTasks.push({ assigneeId: t.assigneeId, estimateMinutes: t.estimateMinutes, dueOn: t.dueOn });
  }
  return { timezone: tz, weekStart, nextWeekStart, rows: workloadFor(members, workloadTasks, weekStart) };
}

export async function setFirmTimezone(orgId: string, timezone: CalendarTimezone): Promise<CalendarTimezone> {
  const rows = await db
    .update(organization)
    .set({ timezone })
    .where(eq(organization.id, orgId))
    .returning({ timezone: organization.timezone });
  const row = rows[0];
  return timezoneSchema.parse(row ? row.timezone : null) ?? timezone;
}

/** null when userId is not a member of this firm. Upserts on (org_id, user_id). */
export async function setCapacity(
  orgId: string,
  userId: string,
  weeklyMinutes: number,
): Promise<{ userId: string; weeklyMinutes: number } | null> {
  return withOrg(orgId, async (tx) => {
    const found = await tx
      .select({ userId: member.userId })
      .from(member)
      .where(and(eq(member.organizationId, orgId), eq(member.userId, userId)))
      .limit(1);
    if (found.length === 0) return null;
    const rows = await tx
      .insert(memberCapacity)
      .values({ orgId, userId, weeklyMinutes })
      .onConflictDoUpdate({
        target: [memberCapacity.orgId, memberCapacity.userId],
        set: { weeklyMinutes, updatedAt: sql`now()` },
      })
      .returning({ userId: memberCapacity.userId, weeklyMinutes: memberCapacity.weeklyMinutes });
    return rows[0] ?? null;
  });
}
