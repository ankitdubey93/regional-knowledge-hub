// Pure (A1): picks practice kinds from a question and renders the firm's records as numbered sources. No database, no clock: callers pass now. Text is redacted by the caller before it reaches a provider (Hard rule 13).
import { PRACTICE_KINDS, type PracticeKind, type PracticeParams } from '@chub/shared/lib/chatWire';
import { formatLoad, formatMinutes, type WorkloadRow } from '@chub/shared/utils/workload';
import type { EngagementStatus } from '@chub/shared/utils/engagements';
import { hasWord } from './ledgerSources';

export const PRACTICE_LINE_CAP = 100;
export const PRACTICE_DUE_DAYS = 30; // untuned
export const PRACTICE_MORE_LINE = 'More rows are not shown. Open the page for the full list.';
export type PracticeScope = 'hub' | 'entity';
export const PRACTICE_TERMS: Record<PracticeKind, readonly string[]> = {
  due_soon: ['due date', 'due dates', 'what is due', "what's due", 'due soon', 'due this week', 'due next week', 'due this month', 'deadline', 'deadlines', 'upcoming', 'coming up', 'calendar'],
  over_capacity: ['capacity', 'workload', 'workloads', 'overloaded', 'overload', 'busy', 'busiest', 'bandwidth', 'availability', 'working on'],
  unbilled_time: ['unbilled', 'uninvoiced', 'not billed', 'not been billed', 'not invoiced', 'not been invoiced', 'wip', 'work in progress', 'billable', 'timesheet', 'timesheets', 'time logged', 'hours logged'],
  open_engagements: ['engagement', 'engagements', 'job', 'jobs', 'task', 'tasks', 'board', 'in progress', 'working on', 'open work'],
  outstanding_requests: ['request', 'requests', 'requested', 'waiting on', 'waiting for', 'chase', 'chasing', 'missing', 'outstanding', 'still need', 'received'],
};

export interface DueSoonRow { clientName: string; label: string; dueDate: string; ruleChecked: boolean }
export interface DueSoonData { days: number; factsMissing: boolean; rows: DueSoonRow[]; noProfile: string[] }
export interface CapacityData { weekStart: string | null; nextWeekStart: string | null; rows: WorkloadRow[] }
export interface UnbilledRow { clientName: string; minutes: number; entries: number; oldestWorkDate: string }
export interface EngagementRow { clientName: string; title: string; status: Exclude<EngagementStatus, 'done'>; dueOn: string; overdue: boolean; tasksDone: number; tasksTotal: number }
export interface RequestRow { clientName: string; label: string; dueOn: string | null; overdue: boolean }
/** null = that kind was not asked. Rows arrive already sorted; rendering keeps their order. */
export interface PracticeData {
  clientId: string | null;
  dueSoon: DueSoonData | null;
  capacity: CapacityData | null;
  unbilled: UnbilledRow[] | null;
  engagements: EngagementRow[] | null;
  requests: RequestRow[] | null;
}
export interface PracticeSource {
  kind: PracticeKind; title: string; citation: string; text: string; sitePath: string; params: PracticeParams; asOf: string;
}

const PLACEHOLDER = /\[[A-Z]+_\d+\]/g;
const STATUS_LABEL = { planned: 'Planned', in_progress: 'In progress', review: 'Review' } as const;

export function practiceKindsFor(question: string, scope: PracticeScope): PracticeKind[] {
  const q = question.replace(PLACEHOLDER, ' ').replace(/\s+/g, ' ').toLowerCase();
  return PRACTICE_KINDS.filter((kind) => {
    if (kind === 'over_capacity' && scope === 'entity') return false;
    return PRACTICE_TERMS[kind].some((t) => hasWord(q, t));
  });
}

export function isPracticeQuestion(question: string, scope: PracticeScope): boolean {
  return practiceKindsFor(question, scope).length > 0;
}

export function asOfLabel(now: Date): string {
  const iso = now.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function withRows(head: string[], rows: string[], total: number, none: string): string {
  const lines = [...head];
  if (total === 0) lines.push(none);
  else lines.push(...rows.slice(0, PRACTICE_LINE_CAP));
  if (total > PRACTICE_LINE_CAP) lines.push(PRACTICE_MORE_LINE);
  return lines.join('\n');
}

export function buildPracticeSources(data: PracticeData, now: Date): PracticeSource[] {
  const label = asOfLabel(now);
  const asOf = now.toISOString();
  const first = `As of ${label}.`;
  const id = data.clientId;
  const out: PracticeSource[] = [];
  const make = (
    kind: PracticeKind, title: string, base: string, sitePath: string, text: string, days: number | null, weekStart: string | null,
  ): void => {
    out.push({ kind, title, citation: `${base}, as of ${label}`, text, sitePath, params: { clientId: id, days, weekStart }, asOf });
  };

  if (data.dueSoon) {
    const d = data.dueSoon;
    const lead = `Due dates from the compliance calendar for the next ${d.days} days, worked out from each entity's profile. Weekend and public-holiday moves are not applied.`;
    let text: string;
    if (d.factsMissing) {
      text = [first, lead, 'The due-date rules are not loaded, so no dates can be shown.'].join('\n');
    } else {
      text = withRows(
        [first, lead],
        d.rows.map((r) => `${r.clientName}: ${r.label}, due ${r.dueDate}${r.ruleChecked ? '' : ' (due-date rule not checked)'}`),
        d.rows.length,
        `No due dates in the next ${d.days} days.`,
      );
      if (d.noProfile.length > 0) text += `\nNo dates for these entities because their profile is incomplete: ${d.noProfile.join(', ')}.`;
    }
    make('due_soon', `Due dates in the next ${d.days} days`, 'Compliance calendar', id === null ? '/workspace' : `/entities/${id}/calendar`, text, d.days, null);
  }

  if (data.capacity) {
    const c = data.capacity;
    let text: string;
    if (c.weekStart === null) {
      text = [first, "The firm's timezone is not set, so workload cannot be worked out. An owner or admin sets it on the Workload page."].join('\n');
    } else {
      const over = (bp: number | null): string => (bp !== null && bp > 10000 ? ', over capacity' : '');
      const rows = c.rows.map((r) => {
        let line = `${r.name}: this week ${formatMinutes(r.overdueMinutes + r.thisWeek.openMinutes)} of ${formatMinutes(r.capacityMinutes)} (${formatLoad(r.thisWeek.loadBp)})${over(r.thisWeek.loadBp)}; next week ${formatMinutes(r.nextWeek.openMinutes)} (${formatLoad(r.nextWeek.loadBp)})${over(r.nextWeek.loadBp)}`;
        const n = r.unestimatedCount;
        if (n > 0) line += `; ${n} open ${n === 1 ? 'task' : 'tasks'} without an estimate`;
        if (r.capacityIsDefault) line += '; capacity is the default, not set for this member';
        return line;
      });
      text = withRows(
        [first, `Workload for the week starting ${c.weekStart} and the week starting ${c.nextWeekStart ?? ''}, from open task estimates against each member's weekly capacity. Overdue tasks count in this week.`],
        rows,
        c.rows.length,
        'No members.',
      );
    }
    make('over_capacity', 'Workload this week and next', 'Workload', '/workload', text, null, c.weekStart);
  }

  if (data.unbilled) {
    const u = data.unbilled;
    const text = withRows(
      [first, 'Billable time not yet on an invoice, by entity, from finished time entries. No amounts are shown; drafting an invoice prices the time.'],
      u.map((r) => `${r.clientName}: ${formatMinutes(r.minutes)} in ${r.entries === 1 ? '1 entry' : `${r.entries} entries`}, oldest from ${r.oldestWorkDate}`),
      u.length,
      'No unbilled billable time.',
    );
    make('unbilled_time', 'Unbilled time', 'Time entries', '/invoices', text, null, null);
  }

  if (data.engagements) {
    const e = data.engagements;
    const text = withRows(
      [first, 'Engagements that are not done, earliest due date first.'],
      e.map((r) => `${r.clientName}: ${r.title} (${STATUS_LABEL[r.status]}), due ${r.dueOn}${r.overdue ? ', overdue' : ''}, ${r.tasksDone} of ${r.tasksTotal} tasks done`),
      e.length,
      'No open engagements.',
    );
    make('open_engagements', 'Open engagements', 'Engagements', id === null ? '/engagements' : `/entities/${id}/engagements`, text, null, null);
  }

  if (data.requests) {
    const q = data.requests;
    const text = withRows(
      [first, 'Document requests still open (not received or waived), earliest due date first.'],
      q.map((r) => `${r.clientName}: ${r.label}, ${r.dueOn === null ? 'no due date' : `due ${r.dueOn}${r.overdue ? ', overdue' : ''}`}`),
      q.length,
      'No outstanding document requests.',
    );
    make('outstanding_requests', 'Outstanding document requests', 'Document requests', id === null ? '/workspace' : `/entities/${id}/requests`, text, null, null);
  }

  return out;
}
