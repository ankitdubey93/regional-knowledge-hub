import { describe, expect, it } from 'vitest';
import {
  PRACTICE_MORE_LINE,
  asOfLabel,
  buildPracticeSources,
  isPracticeQuestion,
  practiceKindsFor,
  type CapacityData,
  type DueSoonData,
  type EngagementRow,
  type PracticeData,
  type RequestRow,
  type UnbilledRow,
} from '../chat/practiceSources';

const NOW = new Date('2026-11-04T09:30:00Z');
const none: PracticeData = { clientId: null, dueSoon: null, capacity: null, unbilled: null, engagements: null, requests: null };

const dueSoon: DueSoonData = {
  days: 30,
  factsMissing: false,
  rows: [
    { clientName: 'Acme Pty Ltd', label: 'BAS (quarter to 30 Sep 2026)', dueDate: '2026-11-28', ruleChecked: false },
    { clientName: 'Brook Ltd', label: 'VAT return', dueDate: '2026-12-07', ruleChecked: true },
  ],
  noProfile: ['Cobalt Trust'],
};
const capacity: CapacityData = {
  weekStart: '2026-11-02',
  nextWeekStart: '2026-11-09',
  rows: [
    {
      userId: 'u1', name: 'Priya Shah', email: 'p@example.com', capacityMinutes: 2250, capacityIsDefault: false, overdueMinutes: 60,
      thisWeek: { openMinutes: 2400, loadBp: 10933 }, nextWeek: { openMinutes: 600, loadBp: 2667 }, unestimatedCount: 2,
    },
  ],
};
const unbilled: UnbilledRow[] = [
  { clientName: 'Brook Ltd', minutes: 600, entries: 4, oldestWorkDate: '2026-09-30' },
  { clientName: 'Acme Pty Ltd', minutes: 90, entries: 1, oldestWorkDate: '2026-10-20' },
];
const engagements: EngagementRow[] = [
  { clientName: 'Acme Pty Ltd', title: 'BAS Q1', status: 'in_progress', dueOn: '2026-10-28', overdue: true, tasksDone: 2, tasksTotal: 5 },
];
const requests: RequestRow[] = [
  { clientName: 'Acme Pty Ltd', label: 'Bank statements', dueOn: null, overdue: false },
  { clientName: 'Acme Pty Ltd', label: 'Payroll report', dueOn: '2026-10-31', overdue: true },
];

const LINE1 = 'As of 2026-11-04 09:30 UTC.';
const DUE_LEAD = "Due dates from the compliance calendar for the next 30 days, worked out from each entity's profile. Weekend and public-holiday moves are not applied.";

describe('practice sources', () => {
  it('PS1 picks each kind from its words', () => {
    expect(practiceKindsFor('What is due in the next month?', 'hub')).toEqual(['due_soon']);
    expect(practiceKindsFor('Who is over capacity this week?', 'hub')).toEqual(['over_capacity']);
    expect(practiceKindsFor('How much unbilled time do we have?', 'hub')).toEqual(['unbilled_time']);
    expect(practiceKindsFor('Which engagements are open?', 'hub')).toEqual(['open_engagements']);
    expect(practiceKindsFor('Which documents are we still waiting on?', 'hub')).toEqual(['outstanding_requests']);
  });

  it('PS2 an entity chat never gets workload', () => {
    expect(practiceKindsFor('Who is over capacity?', 'entity')).toEqual([]);
    expect(practiceKindsFor('What is [NAME_1] working on?', 'entity')).toEqual(['open_engagements']);
    expect(practiceKindsFor('What is [NAME_1] working on?', 'hub')).toEqual(['over_capacity', 'open_engagements']);
  });

  it('PS3 ignores questions about the law or the books', () => {
    for (const q of [
      'When does the zorbel levy apply to fennimore marmalade?',
      'What was our revenue this year?',
      'What is the GST rate?',
      'What colour is the invoice total?',
      'What is glimmerwick duty on a quillon?',
      'When are quarterly updates due under Making Tax Digital for Income Tax?',
      'When must a business lodge a BAS?',
    ]) {
      expect(practiceKindsFor(q, 'hub')).toEqual([]);
    }
    expect(isPracticeQuestion('zqxv flurble wibbet?', 'hub')).toBe(false);
  });

  it("PS4 only the firm's own dates pick due soon", () => {
    expect(practiceKindsFor("What's due this week?", 'entity')).toEqual(['due_soon']);
    expect(practiceKindsFor('When is a quarterly BAS due?', 'entity')).toEqual([]);
  });

  it('PS5 due soon text', () => {
    const [s] = buildPracticeSources({ ...none, dueSoon }, NOW);
    expect(s?.text).toBe(
      [
        LINE1,
        DUE_LEAD,
        'Acme Pty Ltd: BAS (quarter to 30 Sep 2026), due 2026-11-28 (due-date rule not checked)',
        'Brook Ltd: VAT return, due 2026-12-07',
        'No dates for these entities because their profile is incomplete: Cobalt Trust.',
      ].join('\n'),
    );
    const [m] = buildPracticeSources({ ...none, dueSoon: { ...dueSoon, factsMissing: true } }, NOW);
    expect(m?.text).toBe([LINE1, DUE_LEAD, 'The due-date rules are not loaded, so no dates can be shown.'].join('\n'));
  });

  it('PS6 workload text', () => {
    const [s] = buildPracticeSources({ ...none, capacity }, NOW);
    expect(s?.text).toBe(
      [
        LINE1,
        "Workload for the week starting 2026-11-02 and the week starting 2026-11-09, from open task estimates against each member's weekly capacity. Overdue tasks count in this week.",
        'Priya Shah: this week 41 h of 37 h 30 min (109%), over capacity; next week 10 h (27%); 2 open tasks without an estimate',
      ].join('\n'),
    );
    const [e] = buildPracticeSources({ ...none, capacity: { weekStart: null, nextWeekStart: null, rows: [] } }, NOW);
    expect(e?.text).toBe(
      "As of 2026-11-04 09:30 UTC.\nThe firm's timezone is not set, so workload cannot be worked out. An owner or admin sets it on the Workload page.",
    );
  });

  it('PS7 unbilled time text', () => {
    const lines = buildPracticeSources({ ...none, unbilled }, NOW)[0]?.text.split('\n');
    expect(lines?.[2]).toBe('Brook Ltd: 10 h in 4 entries, oldest from 2026-09-30');
    expect(lines?.[3]).toBe('Acme Pty Ltd: 1 h 30 min in 1 entry, oldest from 2026-10-20');
    const empty = buildPracticeSources({ ...none, unbilled: [] }, NOW)[0]?.text.split('\n');
    expect(empty?.[2]).toBe('No unbilled billable time.');
  });

  it('PS8 open engagements text', () => {
    const lines = buildPracticeSources({ ...none, engagements }, NOW)[0]?.text.split('\n');
    expect(lines?.[2]).toBe('Acme Pty Ltd: BAS Q1 (In progress), due 2026-10-28, overdue, 2 of 5 tasks done');
  });

  it('PS9 outstanding requests text', () => {
    const lines = buildPracticeSources({ ...none, requests }, NOW)[0]?.text.split('\n');
    expect(lines?.[2]).toBe('Acme Pty Ltd: Bank statements, no due date');
    expect(lines?.[3]).toBe('Acme Pty Ltd: Payroll report, due 2026-10-31, overdue');
  });

  it('PS10 rows past the cap are cut', () => {
    const rows: UnbilledRow[] = Array.from({ length: 101 }, (_, i) => ({
      clientName: `Client ${i}`, minutes: 60, entries: 1, oldestWorkDate: '2026-10-01',
    }));
    const text = buildPracticeSources({ ...none, unbilled: rows }, NOW)[0]?.text ?? '';
    const lines = text.split('\n');
    expect(lines).toHaveLength(103);
    expect(lines[lines.length - 1]).toBe(PRACTICE_MORE_LINE);
    expect(text).not.toContain('Client 100');
  });

  it('PS11 links and params', () => {
    const entity = buildPracticeSources({ ...none, clientId: 'c1', dueSoon, engagements, requests }, NOW);
    const byKind = Object.fromEntries(entity.map((s) => [s.kind, s]));
    expect(byKind.open_engagements?.sitePath).toBe('/entities/c1/engagements');
    expect(byKind.open_engagements?.params).toEqual({ clientId: 'c1', days: null, weekStart: null });
    expect(byKind.outstanding_requests?.sitePath).toBe('/entities/c1/requests');
    expect(byKind.due_soon?.sitePath).toBe('/entities/c1/calendar');
    expect(byKind.due_soon?.params.days).toBe(30);

    const hub = buildPracticeSources({ ...none, dueSoon, capacity, unbilled, engagements, requests }, NOW);
    const h = Object.fromEntries(hub.map((s) => [s.kind, s]));
    expect(h.due_soon?.sitePath).toBe('/workspace');
    expect(h.outstanding_requests?.sitePath).toBe('/workspace');
    expect(h.open_engagements?.sitePath).toBe('/engagements');
    expect(h.unbilled_time?.sitePath).toBe('/invoices');
    expect(h.over_capacity?.sitePath).toBe('/workload');
    expect(h.over_capacity?.params.weekStart).toBe('2026-11-02');
  });

  it('PS12 order, titles and citations', () => {
    const all = buildPracticeSources({ ...none, dueSoon, capacity, unbilled, engagements, requests }, NOW);
    expect(all.map((s) => s.kind)).toEqual(['due_soon', 'over_capacity', 'unbilled_time', 'open_engagements', 'outstanding_requests']);
    expect(all.map((s) => s.title)).toEqual([
      'Due dates in the next 30 days', 'Workload this week and next', 'Unbilled time', 'Open engagements', 'Outstanding document requests',
    ]);
    expect(all[3]?.citation).toBe('Engagements, as of 2026-11-04 09:30 UTC');
    expect(all.every((s) => s.asOf === '2026-11-04T09:30:00.000Z')).toBe(true);
    expect(asOfLabel(NOW)).toBe('2026-11-04 09:30 UTC');
  });
});
