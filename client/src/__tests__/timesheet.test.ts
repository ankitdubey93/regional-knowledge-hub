import { describe, expect, it } from 'vitest';
import {
  MAX_ENTRY_MINUTES,
  MAX_NOTE_CHARS,
  dayTotals,
  formatElapsed,
  sumMinutes,
  type TimedEntry,
} from '@chub/shared/utils/timesheet';

const entries: TimedEntry[] = [
  { workDate: '2026-11-02', minutes: 90, billable: true },
  { workDate: '2026-11-02', minutes: 30, billable: false },
  { workDate: '2026-11-08', minutes: 15, billable: true },
  { workDate: '2026-11-09', minutes: 60, billable: true },
  { workDate: '2026-11-03', minutes: null, billable: true },
];

describe('timesheet', () => {
  it('TS1 formatElapsed', () => {
    const start = '2026-11-02T00:00:00.000Z';
    expect(formatElapsed(start, Date.parse(start))).toBe('0:00:00');
    expect(formatElapsed(start, Date.parse('2026-11-02T01:02:03.900Z'))).toBe('1:02:03');
    expect(formatElapsed(start, Date.parse('2026-11-01T23:59:00.000Z'))).toBe('0:00:00');
    expect(formatElapsed(start, Date.parse('2026-11-03T02:00:05.000Z'))).toBe('26:00:05');
  });

  it('TS2 dayTotals gives seven days', () => {
    const result = dayTotals(entries, '2026-11-02');
    expect(result).toHaveLength(7);
    expect(result[0]).toEqual({ day: '2026-11-02', minutes: 120, billableMinutes: 90 });
    expect(result[1]).toEqual({ day: '2026-11-03', minutes: 0, billableMinutes: 0 });
    expect(result[6]).toEqual({ day: '2026-11-08', minutes: 15, billableMinutes: 15 });
  });

  it('TS3 sumMinutes ignores running entries', () => {
    expect(sumMinutes(entries)).toEqual({ minutes: 195, billableMinutes: 165 });
  });

  it('TS4 the limits', () => {
    expect(MAX_ENTRY_MINUTES).toBe(1440);
    expect(MAX_NOTE_CHARS).toBe(500);
  });
});
