import { describe, expect, it } from 'vitest';
import {
  DEADLINE_FACT_KEYS,
  addDays,
  addMonthsCorresponding,
  calendarNotes,
  daysBetween,
  deadlineRulesFrom,
  formatDay,
  obligationsFor,
  todayIn,
  type CalendarProfile,
} from '@chub/shared/utils/deadlines';
import { seedFacts } from './seedData';

const rules = deadlineRulesFrom((k) => seedFacts[k]);
const base = { taxRegistered: false, taxPeriod: null, fyEndMonth: null, registeredOn: null, vatStaggerMonth: null, mtdItsa: false } as const;
const profile = (p: Partial<CalendarProfile> & Pick<CalendarProfile, 'jurisdiction' | 'entityType'>): CalendarProfile => ({ ...base, ...p });
const dues = (p: CalendarProfile, from: string, to: string, kind: string) =>
  obligationsFor(p, rules, from, to).filter((o) => o.kind === kind).map((o) => o.dueDate);

describe('date helpers', () => {
  it('addMonthsCorresponding keeps month ends', () => {
    expect(addMonthsCorresponding('2026-06-30', 9)).toBe('2027-03-31');
    expect(addMonthsCorresponding('2026-03-31', 9)).toBe('2026-12-31');
    expect(addMonthsCorresponding('2026-02-28', 1)).toBe('2026-03-31');
    expect(addMonthsCorresponding('2028-02-29', 12)).toBe('2029-02-28');
  });
  it('addMonthsCorresponding clamps other days', () => {
    expect(addMonthsCorresponding('2026-01-15', 1)).toBe('2026-02-15');
    expect(addMonthsCorresponding('2026-01-30', 1)).toBe('2026-02-28');
  });
  it('addDays crosses a year', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('daysBetween', () => {
    expect(daysBetween('2026-10-28', '2026-11-04')).toBe(7);
  });
  it('todayIn uses the zone', () => {
    const now = new Date('2026-10-28T20:00:00Z');
    expect(todayIn('Australia/Sydney', now)).toBe('2026-10-29');
    expect(todayIn('Europe/London', now)).toBe('2026-10-28');
  });
  it('formatDay', () => {
    expect(formatDay('2026-09-30')).toBe('30 September 2026');
  });
  it('rejects a bad date', () => {
    expect(() => addDays('2026-13-01', 1)).toThrow(RangeError);
  });
});

describe('deadlineRulesFrom', () => {
  it('reads every rule from the seed facts', () => {
    expect(Object.keys(rules)).toHaveLength(23);
    expect(Object.keys(rules).sort()).toEqual([...DEADLINE_FACT_KEYS].sort());
  });
  it('throws on a missing fact', () => {
    expect(() => deadlineRulesFrom(() => undefined)).toThrow(TypeError);
  });
});

describe('Australia', () => {
  it('quarterly BAS', () => {
    const p = profile({ jurisdiction: 'AU', entityType: 'company', taxRegistered: true, taxPeriod: 'quarterly' });
    expect(dues(p, '2026-07-01', '2027-07-31', 'au_bas')).toEqual(['2026-07-28', '2026-10-28', '2027-02-28', '2027-04-28', '2027-07-28']);
  });
  it('monthly BAS moves December', () => {
    const p = profile({ jurisdiction: 'AU', entityType: 'sole_trader', taxRegistered: true, taxPeriod: 'monthly' });
    const got = obligationsFor(p, rules, '2027-01-01', '2027-02-28').map((o) => ({ periodEnd: o.periodEnd, dueDate: o.dueDate }));
    expect(got).toEqual([
      { periodEnd: '2026-12-31', dueDate: '2027-02-21' },
      { periodEnd: '2027-01-31', dueDate: '2027-02-21' },
    ]);
  });
  it('sole trader tax return', () => {
    const p = profile({ jurisdiction: 'AU', entityType: 'sole_trader' });
    const got = obligationsFor(p, rules, '2026-07-01', '2026-12-31').filter((o) => o.kind === 'au_itr');
    expect(got).toHaveLength(1);
    expect(got[0]!.dueDate).toBe('2026-10-31');
  });
  it('ASIC review', () => {
    const p = profile({ jurisdiction: 'AU', entityType: 'company', registeredOn: '2020-03-10' });
    const got = obligationsFor(p, rules, '2026-01-01', '2026-12-31').filter((o) => o.kind === 'au_asic_review');
    expect(got).toHaveLength(1);
    expect(got[0]!.periodEnd).toBe('2026-03-10');
    expect(got[0]!.dueDate).toBe('2026-05-10');
  });
});

describe('United Kingdom', () => {
  it('quarterly VAT from the stagger month', () => {
    const p = profile({ jurisdiction: 'UK', entityType: 'company', taxRegistered: true, taxPeriod: 'quarterly', vatStaggerMonth: 3 });
    expect(dues(p, '2026-04-01', '2027-03-31', 'uk_vat')).toEqual(['2026-05-07', '2026-08-07', '2026-11-07', '2027-02-07']);
  });
  it('VAT for a November period', () => {
    const p = profile({ jurisdiction: 'UK', entityType: 'company', taxRegistered: true, taxPeriod: 'monthly' });
    const got = obligationsFor(p, rules, '2027-01-01', '2027-01-31').filter((o) => o.kind === 'uk_vat');
    expect(got).toHaveLength(1);
    expect(got[0]!.periodEnd).toBe('2026-11-30');
    expect(got[0]!.dueDate).toBe('2027-01-07');
  });
  it('Corporation Tax', () => {
    const p = profile({ jurisdiction: 'UK', entityType: 'company', fyEndMonth: 3 });
    const all = obligationsFor(p, rules, '2026-04-01', '2027-04-30');
    expect(all.find((o) => o.kind === 'uk_ct_payment' && o.periodEnd === '2026-03-31')?.dueDate).toBe('2027-01-01');
    expect(all.find((o) => o.kind === 'uk_ct600' && o.periodEnd === '2026-03-31')?.dueDate).toBe('2027-03-31');
  });
  it('Corporation Tax for a June year end', () => {
    const p = profile({ jurisdiction: 'UK', entityType: 'company', fyEndMonth: 6 });
    const all = obligationsFor(p, rules, '2026-04-01', '2027-12-31');
    expect(all.find((o) => o.kind === 'uk_ct_payment' && o.periodEnd === '2026-06-30')?.dueDate).toBe('2027-04-01');
  });
  it('first accounts use incorporation', () => {
    const p = profile({ jurisdiction: 'UK', entityType: 'company', fyEndMonth: 5, registeredOn: '2025-05-14' });
    const all = obligationsFor(p, rules, '2026-01-01', '2027-12-31');
    const first = all.find((o) => o.kind === 'uk_ch_accounts' && o.periodEnd === '2026-05-31');
    expect(first?.dueDate).toBe('2027-02-14');
    expect(first?.caveat).not.toBeNull();
    expect(all.find((o) => o.kind === 'uk_ch_accounts' && o.periodEnd === '2027-05-31')).toBeUndefined();
    const conf = all.find((o) => o.kind === 'uk_confirmation' && o.periodEnd === '2026-05-14');
    expect(conf?.dueDate).toBe('2026-05-28');
    expect(all.find((o) => o.kind === 'uk_ch_accounts' && o.periodEnd === '2025-05-31')).toBeUndefined();
  });
  it('first accounts with a March year end', () => {
    const p = profile({ jurisdiction: 'UK', entityType: 'company', fyEndMonth: 3, registeredOn: '2025-05-14' });
    const got = obligationsFor(p, rules, '2026-01-01', '2027-12-31').filter((o) => o.kind === 'uk_ch_accounts');
    expect(got.map((o) => ({ periodEnd: o.periodEnd, dueDate: o.dueDate }))).toEqual([
      { periodEnd: '2026-03-31', dueDate: '2027-02-14' },
      { periodEnd: '2027-03-31', dueDate: '2027-12-31' },
    ]);
    expect(got[0]!.caveat).not.toBeNull();
    expect(got[1]!.caveat).toBeNull();
  });
  it('Self Assessment', () => {
    const p = profile({ jurisdiction: 'UK', entityType: 'sole_trader' });
    const all = obligationsFor(p, rules, '2026-07-01', '2027-01-31');
    expect(all.find((o) => o.kind === 'uk_sa_poa2')).toMatchObject({ dueDate: '2026-07-31', periodEnd: '2026-04-05' });
    expect(all.find((o) => o.kind === 'uk_sa_return')).toMatchObject({ dueDate: '2027-01-31', periodEnd: '2026-04-05' });
  });
  it('MTD updates only when switched on', () => {
    const off = profile({ jurisdiction: 'UK', entityType: 'sole_trader', mtdItsa: false });
    expect(dues(off, '2026-07-01', '2027-05-31', 'uk_mtd_itsa')).toEqual([]);
    const on = profile({ jurisdiction: 'UK', entityType: 'sole_trader', mtdItsa: true });
    expect(dues(on, '2026-07-01', '2027-05-31', 'uk_mtd_itsa')).toEqual(['2026-08-07', '2026-11-07', '2027-02-07', '2027-05-07']);
  });
});

describe('limits', () => {
  it('AU+UK gets nothing and a note', () => {
    const p = profile({ jurisdiction: 'AU+UK', entityType: 'company', taxRegistered: true, taxPeriod: 'monthly' });
    expect(obligationsFor(p, rules, '2026-01-01', '2027-12-31')).toEqual([]);
    expect(calendarNotes(p)).toHaveLength(1);
  });
  it('no entity type gets nothing', () => {
    const p = profile({ jurisdiction: 'UK', entityType: null });
    expect(obligationsFor(p, rules, '2026-01-01', '2027-12-31')).toEqual([]);
  });
  it('missing stagger month is said, not guessed', () => {
    const p = profile({ jurisdiction: 'UK', entityType: 'company', taxRegistered: true, taxPeriod: 'quarterly', vatStaggerMonth: null });
    expect(obligationsFor(p, rules, '2026-01-01', '2027-12-31').filter((o) => o.kind === 'uk_vat')).toEqual([]);
    expect(calendarNotes(p)).toContain('Set the month a VAT quarter ends to see VAT returns.');
  });
  it('every obligation names its facts', () => {
    const p = profile({
      jurisdiction: 'UK', entityType: 'company', taxRegistered: true, taxPeriod: 'quarterly',
      fyEndMonth: 3, registeredOn: '2025-05-14', vatStaggerMonth: 3, mtdItsa: true,
    });
    const all = obligationsFor(p, rules, '2026-01-01', '2027-12-31');
    expect(all.length).toBeGreaterThan(0);
    for (const o of all) {
      expect(o.factKeys.length).toBeGreaterThanOrEqual(1);
      for (const k of o.factKeys) expect(DEADLINE_FACT_KEYS).toContain(k);
    }
  });
});
