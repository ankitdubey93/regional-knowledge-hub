/**
 * Due dates worked out from an entity's profile. Pure: no clock, no network.
 * Every offset (a day of the month, a number of months or days) is a `count`
 * fact read through DeadlineRules; only the statutory period ends are fixed here.
 * Dates are ISO yyyy-mm-dd strings and the arithmetic is integer year, month and
 * day, with Date.UTC only to count days.
 */
import type { Fact } from '../data/schemas';

export const DEADLINE_FACT_KEYS = [
  'au.bas.monthlyDueDay', 'au.bas.monthlyDecemberDueMonthsAfter', 'au.bas.quarterlyDueDay',
  'au.bas.quarterlyDueMonthsAfter', 'au.bas.quarterlyDecemberDueMonthsAfter',
  'au.itr.individualDueMonth', 'au.itr.individualDueDay', 'au.asic.reviewFeeDueMonthsAfter',
  'uk.vat.returnDueMonthsAfter', 'uk.vat.returnDueExtraDays', 'uk.ct.paymentDueMonthsAfter',
  'uk.ct.paymentDueExtraDays', 'uk.ct.returnDueMonthsAfter', 'uk.ch.accountsDueMonthsAfter',
  'uk.ch.firstAccountsDueMonthsAfterIncorporation', 'uk.ch.firstPeriodMinMonths', 'uk.ch.confirmationDueDaysAfter',
  'uk.sa.onlineDueMonth', 'uk.sa.onlineDueDay', 'uk.sa.secondPaymentOnAccountMonth',
  'uk.sa.secondPaymentOnAccountDay', 'uk.mtdItsa.updateDueMonthsAfter', 'uk.mtdItsa.updateDueDay',
] as const;
export type DeadlineRules = Record<(typeof DEADLINE_FACT_KEYS)[number], number>;
type FactKey = (typeof DEADLINE_FACT_KEYS)[number];

export const CALENDAR_TIMEZONES = [
  'Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Adelaide',
  'Australia/Darwin', 'Australia/Perth', 'Australia/Hobart', 'Europe/London',
] as const;
export type CalendarTimezone = (typeof CALENDAR_TIMEZONES)[number];

export const OBLIGATION_KINDS = [
  'au_bas', 'au_itr', 'au_asic_review', 'uk_vat', 'uk_ct_payment', 'uk_ct600',
  'uk_ch_accounts', 'uk_confirmation', 'uk_sa_return', 'uk_sa_poa2', 'uk_mtd_itsa',
] as const;
export type ObligationKind = (typeof OBLIGATION_KINDS)[number];

export interface CalendarProfile {
  jurisdiction: 'AU' | 'UK' | 'AU+UK';
  entityType: 'sole_trader' | 'partnership' | 'company' | 'trust' | 'llp' | null;
  taxRegistered: boolean;
  taxPeriod: 'monthly' | 'quarterly' | 'annual' | null;
  fyEndMonth: number | null;
  registeredOn: string | null; // yyyy-mm-dd: incorporation (UK) or ASIC registration (AU)
  vatStaggerMonth: number | null; // 1-12: a month in which a UK VAT quarter ends
  mtdItsa: boolean;
}

export interface Obligation {
  id: string; // `${kind}:${periodEnd}`
  kind: ObligationKind;
  label: string;
  periodEnd: string; // yyyy-mm-dd
  dueDate: string; // yyyy-mm-dd
  factKeys: FactKey[];
  caveat: string | null;
}

/** 'AU' → 'Australia/Sydney'; 'UK' and 'AU+UK' → 'Europe/London'. */
export function defaultTimezone(j: 'AU' | 'UK' | 'AU+UK'): CalendarTimezone {
  return j === 'AU' ? 'Australia/Sydney' : 'Europe/London';
}

/** Reads each DEADLINE_FACT_KEYS entry through get(); throws TypeError(`Fact "${key}" is not a count`) if missing, not unit 'count', or not a number. */
export function deadlineRulesFrom(get: (key: string) => Fact | undefined): DeadlineRules {
  const out: Partial<DeadlineRules> = {};
  for (const key of DEADLINE_FACT_KEYS) {
    const f = get(key);
    if (!f || f.unit !== 'count' || typeof f.value !== 'number') throw new TypeError(`Fact "${key}" is not a count`);
    out[key] = f.value;
  }
  return out as DeadlineRules;
}

interface Ymd {
  y: number;
  m: number;
  d: number;
}

function parse(iso: string): Ymd {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new RangeError(`Not a date: ${iso}`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > lastDayOfMonth(y, m)) throw new RangeError(`Not a date: ${iso}`);
  return { y, m, d };
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

function make(y: number, m: number, d: number): string {
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function shiftMonths(y: number, m: number, months: number): { y: number; m: number } {
  const total = y * 12 + (m - 1) + months;
  return { y: Math.floor(total / 12), m: (((total % 12) + 12) % 12) + 1 };
}

/** Corresponding-date rule: a month-end stays a month-end; other days clamp to the target month's length. */
export function addMonthsCorresponding(iso: string, months: number): string {
  const { y, m, d } = parse(iso);
  const t = shiftMonths(y, m, months);
  const last = lastDayOfMonth(t.y, t.m);
  return make(t.y, t.m, d === lastDayOfMonth(y, m) ? last : Math.min(d, last));
}

export function addDays(iso: string, days: number): string {
  const { y, m, d } = parse(iso);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return make(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Whole days from a to b (b - a), via Date.UTC. */
export function daysBetween(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

/** The calendar date in timeZone at instant now, as yyyy-mm-dd (Intl.DateTimeFormat 'en-CA'). */
export function todayIn(timeZone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** '2026-09-30' → '30 September 2026' (en-GB, timeZone 'UTC'). */
export function formatDay(iso: string): string {
  const { y, m, d } = parse(iso);
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/** Day N of the month that is k months after periodEnd's month, clamped to that month's length. */
function dayOfMonthAfter(periodEnd: string, k: number, n: number): string {
  const { y, m } = parse(periodEnd);
  const t = shiftMonths(y, m, k);
  return make(t.y, t.m, Math.min(n, lastDayOfMonth(t.y, t.m)));
}

function clampedDate(y: number, m: number, d: number): string {
  return make(y, m, Math.min(d, lastDayOfMonth(y, m)));
}

function endOfMonth(y: number, m: number): string {
  return make(y, m, lastDayOfMonth(y, m));
}

export function obligationsFor(p: CalendarProfile, rules: DeadlineRules, from: string, to: string): Obligation[] {
  parse(from);
  parse(to);
  if (p.jurisdiction === 'AU+UK' || p.entityType === null) return [];
  const out: Obligation[] = [];
  const add = (kind: ObligationKind, label: string, periodEnd: string, dueDate: string, factKeys: FactKey[], caveat: string | null) => {
    if (dueDate < from || dueDate > to) return;
    out.push({ id: `${kind}:${periodEnd}`, kind, label, periodEnd, dueDate, factKeys, caveat });
  };
  const years: number[] = [];
  for (let y = parse(from).y - 2; y <= parse(to).y + 1; y++) years.push(y);
  const isCompany = p.entityType === 'company';
  const isIndividual = p.entityType === 'sole_trader' || p.entityType === 'partnership';
  const isCompanyLike = isCompany || p.entityType === 'llp';

  // The first Companies House period end: the earliest year end at least firstPeriodMinMonths after incorporation (CA 2006 s.391(5)).
  let firstAccountsEnd: string | null = null;
  if (p.registeredOn !== null && p.fyEndMonth !== null) {
    const earliest = addMonthsCorresponding(p.registeredOn, rules['uk.ch.firstPeriodMinMonths']);
    const reg = parse(earliest);
    const sameYear = endOfMonth(reg.y, p.fyEndMonth);
    firstAccountsEnd = sameYear >= earliest ? sameYear : endOfMonth(reg.y + 1, p.fyEndMonth);
  }

  for (const y of years) {
    if (p.jurisdiction === 'AU') {
      if (p.taxRegistered && p.taxPeriod === 'monthly') {
        for (let m = 1; m <= 12; m++) {
          const end = endOfMonth(y, m);
          const due = m === 12
            ? dayOfMonthAfter(end, rules['au.bas.monthlyDecemberDueMonthsAfter'], rules['au.bas.monthlyDueDay'])
            : dayOfMonthAfter(end, 1, rules['au.bas.monthlyDueDay']);
          add('au_bas', `BAS for the month ending ${formatDay(end)}`, end, due,
            ['au.bas.monthlyDueDay', 'au.bas.monthlyDecemberDueMonthsAfter'], null);
        }
      }
      if (p.taxRegistered && p.taxPeriod === 'quarterly') {
        for (const m of [3, 6, 9, 12]) {
          const end = endOfMonth(y, m);
          const after = m === 12 ? rules['au.bas.quarterlyDecemberDueMonthsAfter'] : rules['au.bas.quarterlyDueMonthsAfter'];
          add('au_bas', `BAS for the quarter ending ${formatDay(end)}`, end,
            dayOfMonthAfter(end, after, rules['au.bas.quarterlyDueDay']),
            ['au.bas.quarterlyDueDay', 'au.bas.quarterlyDueMonthsAfter', 'au.bas.quarterlyDecemberDueMonthsAfter'], null);
        }
      }
      if (isIndividual) {
        const end = endOfMonth(y, 6);
        add('au_itr', `Income tax return, year ending ${formatDay(end)}`, end,
          clampedDate(y, rules['au.itr.individualDueMonth'], rules['au.itr.individualDueDay']),
          ['au.itr.individualDueMonth', 'au.itr.individualDueDay'],
          'Self-lodged date. Returns lodged through a tax agent can have later dates.');
      }
      if (isCompany && p.registeredOn !== null) {
        const reg = parse(p.registeredOn);
        const end = clampedDate(y, reg.m, reg.d);
        if (end > p.registeredOn) {
          add('au_asic_review', `ASIC annual review fee, review date ${formatDay(end)}`, end,
            addMonthsCorresponding(end, rules['au.asic.reviewFeeDueMonthsAfter']), ['au.asic.reviewFeeDueMonthsAfter'], null);
        }
      }
    }

    if (p.jurisdiction === 'UK') {
      if (p.taxRegistered && (p.taxPeriod === 'monthly' || (p.taxPeriod === 'quarterly' && p.vatStaggerMonth !== null))) {
        for (let m = 1; m <= 12; m++) {
          if (p.taxPeriod === 'quarterly' && p.vatStaggerMonth !== null && (((m - p.vatStaggerMonth) % 3) + 3) % 3 !== 0) continue;
          const end = endOfMonth(y, m);
          add('uk_vat', `VAT return for the period ending ${formatDay(end)}`, end,
            addDays(addMonthsCorresponding(end, rules['uk.vat.returnDueMonthsAfter']), rules['uk.vat.returnDueExtraDays']),
            ['uk.vat.returnDueMonthsAfter', 'uk.vat.returnDueExtraDays'], null);
        }
      }
      if (isCompany && p.fyEndMonth !== null) {
        const end = endOfMonth(y, p.fyEndMonth);
        add('uk_ct_payment', `Corporation Tax payment, period ending ${formatDay(end)}`, end,
          addDays(addMonthsCorresponding(end, rules['uk.ct.paymentDueMonthsAfter']), rules['uk.ct.paymentDueExtraDays']),
          ['uk.ct.paymentDueMonthsAfter', 'uk.ct.paymentDueExtraDays'], 'Large companies pay by instalments, which are not shown.');
        add('uk_ct600', `Company Tax Return (CT600), period ending ${formatDay(end)}`, end,
          addMonthsCorresponding(end, rules['uk.ct.returnDueMonthsAfter']), ['uk.ct.returnDueMonthsAfter'], null);
      }
      if (isCompanyLike && p.fyEndMonth !== null) {
        const end = endOfMonth(y, p.fyEndMonth);
        if (p.registeredOn === null || firstAccountsEnd === null || end >= firstAccountsEnd) {
          const first = p.registeredOn !== null && end === firstAccountsEnd;
          add('uk_ch_accounts', `Annual accounts to Companies House, period ending ${formatDay(end)}`, end,
            first && p.registeredOn !== null
              ? addMonthsCorresponding(p.registeredOn, rules['uk.ch.firstAccountsDueMonthsAfterIncorporation'])
              : addMonthsCorresponding(end, rules['uk.ch.accountsDueMonthsAfter']),
            first ? ['uk.ch.firstAccountsDueMonthsAfterIncorporation', 'uk.ch.firstPeriodMinMonths'] : ['uk.ch.accountsDueMonthsAfter'],
            first ? 'First accounts: confirm the date on the Companies House service.' : null);
        }
      }
      if (isCompanyLike && p.registeredOn !== null) {
        const reg = parse(p.registeredOn);
        const end = clampedDate(y, reg.m, reg.d);
        if (end > p.registeredOn) {
          add('uk_confirmation', `Confirmation statement, review period ending ${formatDay(end)}`, end,
            addDays(end, rules['uk.ch.confirmationDueDaysAfter']), ['uk.ch.confirmationDueDaysAfter'],
            'Assumes the review period runs from incorporation; filing early moves it.');
        }
      }
      if (isIndividual) {
        const end = make(y, 4, 5);
        add('uk_sa_return', `Self Assessment return and payment, tax year ending ${formatDay(end)}`, end,
          clampedDate(y + 1, rules['uk.sa.onlineDueMonth'], rules['uk.sa.onlineDueDay']),
          ['uk.sa.onlineDueMonth', 'uk.sa.onlineDueDay'], 'The first payment on account for the next tax year is due the same day.');
        add('uk_sa_poa2', `Second payment on account, tax year ending ${formatDay(end)}`, end,
          clampedDate(y, rules['uk.sa.secondPaymentOnAccountMonth'], rules['uk.sa.secondPaymentOnAccountDay']),
          ['uk.sa.secondPaymentOnAccountMonth', 'uk.sa.secondPaymentOnAccountDay'], 'Only if HMRC has set payments on account.');
      }
      if (p.entityType === 'sole_trader' && p.mtdItsa) {
        for (const m of [7, 10, 1, 4]) {
          const end = make(y, m, 5);
          add('uk_mtd_itsa', `MTD Income Tax quarterly update, period ending ${formatDay(end)}`, end,
            dayOfMonthAfter(end, rules['uk.mtdItsa.updateDueMonthsAfter'], rules['uk.mtdItsa.updateDueDay']),
            ['uk.mtdItsa.updateDueMonthsAfter', 'uk.mtdItsa.updateDueDay'], 'Standard update periods; calendar-quarter periods are not shown.');
        }
      }
    }
  }

  return out.sort((a, b) =>
    a.dueDate.localeCompare(b.dueDate) ||
    OBLIGATION_KINDS.indexOf(a.kind) - OBLIGATION_KINDS.indexOf(b.kind) ||
    a.periodEnd.localeCompare(b.periodEnd));
}

/** The 'not shown' lines for this profile, in the order listed below. */
export function calendarNotes(p: CalendarProfile): string[] {
  if (p.jurisdiction === 'AU+UK') return ['Calendars cover one country. Set up a separate entity for each country to see its due dates.'];
  if (p.entityType === null) return ['Set the entity type to see due dates.'];
  const notes = ['Due dates are not moved for weekends or public holidays.'];
  const companyLike = p.entityType === 'company' || p.entityType === 'llp';
  if (p.jurisdiction === 'AU') {
    notes.push(
      'Tax agent lodgment program dates are not shown.',
      'Company and trust income tax returns are not shown.',
      'Super guarantee, PAYG withholding and annual GST returns are not shown.',
    );
    if (p.entityType === 'company' && p.registeredOn === null) notes.push('Add the ASIC registration date to see the annual review.');
  } else {
    notes.push('PAYE, CIS and annual VAT accounting returns are not shown.');
    if (p.taxRegistered && p.taxPeriod === 'quarterly' && p.vatStaggerMonth === null) {
      notes.push('Set the month a VAT quarter ends to see VAT returns.');
    }
    if (companyLike && p.registeredOn === null) {
      notes.push('Add the incorporation date to see the confirmation statement and first accounts.');
    }
    if (companyLike && p.fyEndMonth === null) notes.push('Set the financial year end to see accounts and Corporation Tax.');
  }
  return notes;
}
