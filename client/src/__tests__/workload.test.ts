import { describe, expect, it } from 'vitest';
import {
  currentWeekStart,
  formatLoad,
  formatMinutes,
  weekStartOf,
  workloadFor,
  type WorkloadTask,
} from '@chub/shared/utils/workload';

const A = { userId: 'u1', name: 'Ann Owner', email: 'a@x.test' };
const B = { userId: 'u2', name: 'Bo Member', email: 'b@x.test' };
const task = (assigneeId: string, estimateMinutes: number | null, dueOn: string): WorkloadTask => ({
  assigneeId,
  estimateMinutes,
  dueOn,
});

describe('workload engine (W2)', () => {
  it('WK1 weekStartOf returns the Monday on or before', () => {
    expect(weekStartOf('2026-10-29')).toBe('2026-10-26');
    expect(weekStartOf('2026-10-26')).toBe('2026-10-26');
    expect(weekStartOf('2027-01-03')).toBe('2026-12-28');
  });

  it('WK2 Sydney weeks across the end of daylight saving', () => {
    expect(currentWeekStart('Australia/Sydney', new Date('2026-04-05T13:30:00Z'))).toBe('2026-03-30');
    expect(currentWeekStart('Australia/Sydney', new Date('2026-04-05T14:30:00Z'))).toBe('2026-04-06');
  });

  it('WK3 Sydney weeks across the start of daylight saving', () => {
    expect(currentWeekStart('Australia/Sydney', new Date('2026-10-04T12:30:00Z'))).toBe('2026-09-28');
    expect(currentWeekStart('Australia/Sydney', new Date('2026-10-04T13:30:00Z'))).toBe('2026-10-05');
  });

  it('WK4 London weeks across the start of summer time', () => {
    expect(currentWeekStart('Europe/London', new Date('2026-03-29T22:30:00Z'))).toBe('2026-03-23');
    expect(currentWeekStart('Europe/London', new Date('2026-03-29T23:30:00Z'))).toBe('2026-03-30');
  });

  it('WK5 London weeks across the end of summer time', () => {
    expect(currentWeekStart('Europe/London', new Date('2026-10-25T23:30:00Z'))).toBe('2026-10-19');
    expect(currentWeekStart('Europe/London', new Date('2026-10-26T00:30:00Z'))).toBe('2026-10-26');
  });

  it('WE1 the worked example', () => {
    const rows = workloadFor(
      [
        { ...A, weeklyMinutes: 1800 },
        { ...B, weeklyMinutes: null },
      ],
      [
        task('u1', 120, '2026-10-30'),
        task('u1', 300, '2026-11-02'),
        task('u1', null, '2026-11-08'),
        task('u1', 600, '2026-11-09'),
        task('u1', 90, '2026-11-16'),
        task('u2', 240, '2026-11-12'),
        task('gone', 500, '2026-11-03'),
      ],
      '2026-11-02',
    );
    expect(rows).toEqual([
      {
        ...A,
        capacityMinutes: 1800,
        capacityIsDefault: false,
        overdueMinutes: 120,
        thisWeek: { openMinutes: 300, loadBp: 2333 },
        nextWeek: { openMinutes: 600, loadBp: 3333 },
        unestimatedCount: 1,
      },
      {
        ...B,
        capacityMinutes: 2250,
        capacityIsDefault: true,
        overdueMinutes: 0,
        thisWeek: { openMinutes: 0, loadBp: 0 },
        nextWeek: { openMinutes: 240, loadBp: 1067 },
        unestimatedCount: 0,
      },
    ]);
  });

  it('WE2 week boundaries', () => {
    const [row] = workloadFor(
      [{ ...A, weeklyMinutes: 6000 }],
      ['2026-11-01', '2026-11-08', '2026-11-09', '2026-11-15', '2026-11-16'].map((d) => task('u1', 60, d)),
      '2026-11-02',
    );
    expect(row?.overdueMinutes).toBe(60);
    expect(row?.thisWeek).toEqual({ openMinutes: 60, loadBp: 200 });
    expect(row?.nextWeek).toEqual({ openMinutes: 120, loadBp: 200 });
  });

  it('WE3 zero capacity gives no load', () => {
    const [row] = workloadFor([{ ...A, weeklyMinutes: 0 }], [task('u1', 60, '2026-11-03')], '2026-11-02');
    expect(row?.capacityMinutes).toBe(0);
    expect(row?.capacityIsDefault).toBe(false);
    expect(row?.thisWeek).toEqual({ openMinutes: 60, loadBp: null });
    expect(row?.nextWeek).toEqual({ openMinutes: 0, loadBp: null });
  });

  it('WE4 rows keep member order, not load order', () => {
    const rows = workloadFor(
      [
        { userId: 'u9', name: 'Zed', email: 'z@x.test', weeklyMinutes: 600 },
        { ...A, weeklyMinutes: null },
      ],
      [task('u9', 600, '2026-11-03')],
      '2026-11-02',
    );
    expect(rows.map((r) => r.userId)).toEqual(['u9', 'u1']);
  });

  it('WE5 load rounds half away from zero', () => {
    const [a] = workloadFor([{ ...A, weeklyMinutes: 4000 }], [task('u1', 3, '2026-11-03')], '2026-11-02');
    expect(a?.thisWeek.loadBp).toBe(8);
    const [b] = workloadFor([{ ...B, weeklyMinutes: 3 }], [task('u2', 1, '2026-11-03')], '2026-11-02');
    expect(b?.thisWeek.loadBp).toBe(3333);
  });

  it('WE6 only counted tasks are unestimated', () => {
    const [row] = workloadFor(
      [{ ...A, weeklyMinutes: 2250 }],
      [task('u1', null, '2026-11-16'), task('u1', null, '2026-10-01')],
      '2026-11-02',
    );
    expect(row?.unestimatedCount).toBe(1);
    expect(row?.overdueMinutes).toBe(0);
  });

  it('WF1 formats minutes and load', () => {
    expect(formatMinutes(0)).toBe('0 min');
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(2250)).toBe('37 h 30 min');
    expect(formatLoad(null)).toBe('—');
    expect(formatLoad(12500)).toBe('125%');
    expect(formatLoad(2333)).toBe('23%');
    expect(formatLoad(50)).toBe('1%');
  });
});
