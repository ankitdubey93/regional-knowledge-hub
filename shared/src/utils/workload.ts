/**
 * Workload per firm member (W2). Pure: no clock (callers pass now), no network.
 * Minutes are integers; load is basis points through roundDiv (Hard rule 3).
 */
import { roundDiv } from './money';
import { addDays, todayIn } from './deadlines';

/** Firm policy, not law and not a fact: a placeholder weekly capacity (37.5 hours) for a member with no member_capacity row. Untuned. */
export const DEFAULT_WEEKLY_MINUTES = 2250;
/** Upper bound on a member's weekly capacity (100 hours); mirrors member_capacity_weekly_minutes_check. */
export const MAX_WEEKLY_MINUTES = 6000;

export interface WorkloadMember {
  userId: string;
  name: string;
  email: string;
  /** null = no member_capacity row, so DEFAULT_WEEKLY_MINUTES applies. */
  weeklyMinutes: number | null;
}
export interface WorkloadTask {
  assigneeId: string;
  estimateMinutes: number | null;
  /** Effective due date, yyyy-mm-dd: the task's due date, else its engagement's. */
  dueOn: string;
}
export interface WeekLoad {
  openMinutes: number;
  /** null when capacity is 0. */
  loadBp: number | null;
}
export interface WorkloadRow {
  userId: string;
  name: string;
  email: string;
  capacityMinutes: number;
  capacityIsDefault: boolean;
  overdueMinutes: number;
  thisWeek: WeekLoad;
  nextWeek: WeekLoad;
  unestimatedCount: number;
}

/** The Monday on or before day (yyyy-mm-dd), via Date.UTC. */
export function weekStartOf(day: string): string {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7));
  const d = Number(day.slice(8, 10));
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(day, -((dow + 6) % 7));
}

/** weekStartOf(todayIn(timeZone, now)). */
export function currentWeekStart(timeZone: string, now: Date): string {
  return weekStartOf(todayIn(timeZone, now));
}

/** One row per member, in input order (never sorted by load). */
export function workloadFor(members: WorkloadMember[], tasks: WorkloadTask[], weekStart: string): WorkloadRow[] {
  const thisLastDay = addDays(weekStart, 6);
  const lastDay = addDays(weekStart, 13);
  return members.map((mem) => {
    const capacityMinutes = mem.weeklyMinutes ?? DEFAULT_WEEKLY_MINUTES;
    let overdueMinutes = 0;
    let thisOpen = 0;
    let nextOpen = 0;
    let unestimatedCount = 0;
    for (const t of tasks) {
      if (t.assigneeId !== mem.userId) continue;
      const minutes = t.estimateMinutes ?? 0;
      if (t.dueOn < weekStart) overdueMinutes += minutes;
      else if (t.dueOn <= thisLastDay) thisOpen += minutes;
      else if (t.dueOn <= lastDay) nextOpen += minutes;
      else continue;
      if (t.estimateMinutes === null) unestimatedCount += 1;
    }
    return {
      userId: mem.userId,
      name: mem.name,
      email: mem.email,
      capacityMinutes,
      capacityIsDefault: mem.weeklyMinutes === null,
      overdueMinutes,
      thisWeek: {
        openMinutes: thisOpen,
        loadBp: capacityMinutes === 0 ? null : roundDiv((overdueMinutes + thisOpen) * 10000, capacityMinutes),
      },
      nextWeek: {
        openMinutes: nextOpen,
        loadBp: capacityMinutes === 0 ? null : roundDiv(nextOpen * 10000, capacityMinutes),
      },
      unestimatedCount,
    };
  });
}

/** 0 → '0 min'; < 60 → '45 min'; whole hours → '1 h'; else '37 h 30 min'. */
export function formatMinutes(minutes: number): string {
  const r = minutes % 60;
  const h = (minutes - r) / 60;
  if (minutes === 0) return '0 min';
  if (h === 0) return `${r} min`;
  if (r === 0) return `${h} h`;
  return `${h} h ${r} min`;
}

/** null → '—'; else `${roundDiv(loadBp, 100)}%`. */
export function formatLoad(loadBp: number | null): string {
  return loadBp === null ? '—' : `${roundDiv(loadBp, 100)}%`;
}
