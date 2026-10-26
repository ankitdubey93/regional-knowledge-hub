/**
 * Leitner spaced repetition. A card sits in box 1–5; a right answer moves it
 * up one box, a wrong one sends it back to box 1. Each box has a review gap.
 * Dates are ISO yyyy-mm-dd strings so they survive JSON and localStorage.
 */
export const BOX_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30] as const; // index = box; box 0 unused

export interface CardState {
  box: number; // 1..5
  due: string; // yyyy-mm-dd
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function review(state: CardState | undefined, correct: boolean, today: string): CardState {
  const box = correct ? Math.min(5, (state?.box ?? 0) + 1) : 1;
  return { box, due: addDays(today, BOX_INTERVAL_DAYS[box]!) };
}

/** A card never seen is due now. */
export function isDue(state: CardState | undefined, today: string): boolean {
  return state === undefined || state.due <= today;
}

export function todayIso(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
