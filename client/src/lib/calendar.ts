import { allFacts, fact, factStatus, type FactStatus } from '../data/facts';
import { deadlineRulesFrom, defaultTimezone, todayIn, type CalendarProfile, type DeadlineRules, type Obligation } from '@chub/shared/utils/deadlines';
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
