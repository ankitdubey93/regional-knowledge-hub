import { allFacts, fact, factStatus, type FactStatus } from '../data/facts';
import { addDays, deadlineRulesFrom, defaultTimezone, obligationsFor, todayIn, type CalendarProfile, type DeadlineRules, type Obligation } from '@chub/shared/utils/deadlines';
import type { ClientRecord } from './entity';

export function calendarRules(): DeadlineRules {
  return deadlineRulesFrom((k) => allFacts()[k]);
}

/** 'unverified' if any fact is unverified, else 'stale' if any is stale, else 'verified'. */
export function obligationStatus(o: Obligation, today: string): FactStatus {
  const statuses = o.factKeys.map((k) => factStatus(fact(k), today));
  if (statuses.includes('unverified')) return 'unverified';
  if (statuses.includes('stale')) return 'stale';
  return 'verified';
}

export function entityToday(c: ClientRecord, now: Date): string {
  return todayIn(c.timezone ?? defaultTimezone(c.jurisdiction), now);
}

export function calendarProfile(c: ClientRecord): CalendarProfile {
  return {
    jurisdiction: c.jurisdiction,
    entityType: c.entityType,
    taxRegistered: c.taxRegistered,
    taxPeriod: c.taxPeriod,
    fyEndMonth: c.fyEndMonth,
    registeredOn: c.registeredOn,
    vatStaggerMonth: c.vatStaggerMonth,
    mtdItsa: c.mtdItsa,
  };
}

export interface DueItem {
  client: ClientRecord;
  obligation: Obligation;
  /** The client's own today, so "in N days" counts from where the client is. */
  today: string;
}

/** Every due date in the next `days` days across the clients, soonest first, then by client name. */
export function dueWithin(clients: ClientRecord[], now: Date, days: number, rules: DeadlineRules = calendarRules()): DueItem[] {
  const items = clients.flatMap((c) => {
    const today = entityToday(c, now);
    return obligationsFor(calendarProfile(c), rules, today, addDays(today, days)).map((obligation) => ({ client: c, obligation, today }));
  });
  return items.sort((a, b) => a.obligation.dueDate.localeCompare(b.obligation.dueDate) || a.client.name.localeCompare(b.client.name));
}

/** How far ahead a workspace tile looks for the client's next due date: past every yearly obligation. */
export const NEXT_DUE_WINDOW_DAYS = 400;

/** The client's next due date within NEXT_DUE_WINDOW_DAYS, or null (no profile, or nothing the calendar covers). */
export function nextDue(c: ClientRecord, now: Date, rules: DeadlineRules = calendarRules()): Obligation | null {
  const today = entityToday(c, now);
  return obligationsFor(calendarProfile(c), rules, today, addDays(today, NEXT_DUE_WINDOW_DAYS))[0] ?? null;
}
