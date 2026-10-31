/**
 * Time entries (B1). Pure: no clock (callers pass nowMs), no network, integer minutes only.
 */
import { addDays } from './deadlines';

/** A single entry is at most a day; a timer that ran longer stops here (server). */
export const MAX_ENTRY_MINUTES = 1440;
export const MAX_NOTE_CHARS = 500;

export interface TimedEntry {
  workDate: string;
  minutes: number | null;
  billable: boolean;
}
export interface DayTotal {
  day: string;
  minutes: number;
  billableMinutes: number;
}

/** Seven rows, weekStart to weekStart + 6 (yyyy-mm-dd). Running entries (minutes null) and days outside the week are ignored. */
export function dayTotals(entries: TimedEntry[], weekStart: string): DayTotal[] {
  const rows: DayTotal[] = [];
  for (let i = 0; i < 7; i += 1) {
    rows.push({ day: addDays(weekStart, i), minutes: 0, billableMinutes: 0 });
  }
  for (const e of entries) {
    if (e.minutes === null) continue;
    const row = rows.find((r) => r.day === e.workDate);
    if (!row) continue;
    row.minutes += e.minutes;
    if (e.billable) row.billableMinutes += e.minutes;
  }
  return rows;
}

/** Sum over entries with minutes not null. */
export function sumMinutes(entries: TimedEntry[]): { minutes: number; billableMinutes: number } {
  let minutes = 0;
  let billableMinutes = 0;
  for (const e of entries) {
    if (e.minutes === null) continue;
    minutes += e.minutes;
    if (e.billable) billableMinutes += e.minutes;
  }
  return { minutes, billableMinutes };
}

/** 'h:mm:ss' of whole seconds from startedAtIso to nowMs; never negative (clock skew shows 0:00:00). Hours are not padded and not capped. */
export function formatElapsed(startedAtIso: string, nowMs: number): string {
  const s = Math.max(0, Math.floor((nowMs - Date.parse(startedAtIso)) / 1000));
  const sec = s % 60;
  const totalMinutes = (s - sec) / 60;
  const min = totalMinutes % 60;
  const hours = (totalMinutes - min) / 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${hours}:${pad(min)}:${pad(sec)}`;
}
