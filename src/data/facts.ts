import { facts } from './index';
import type { Fact } from './schemas';
import { formatMoney, formatRate } from '../utils/money';

export class UnknownFactError extends Error {}

export function fact(key: string): Fact {
  const f = facts[key];
  if (!f) throw new UnknownFactError(`Unknown fact "${key}"`);
  return f;
}

/** A rate fact in basis points. Throws if the fact is not a rate, so a calculator can never read the wrong kind. */
export function rateBp(key: string): number {
  const f = fact(key);
  if (f.unit !== 'bp' || typeof f.value !== 'number') throw new TypeError(`Fact "${key}" is not a rate`);
  return f.value;
}

export function cents(key: string): number {
  const f = fact(key);
  if (f.unit !== 'cents' || typeof f.value !== 'number') throw new TypeError(`Fact "${key}" is not an amount`);
  return f.value;
}

export function count(key: string): number {
  const f = fact(key);
  if (f.unit !== 'count' || typeof f.value !== 'number') throw new TypeError(`Fact "${key}" is not a count`);
  return f.value;
}

/** Human text for any fact: "10%", "A$75,000.00", "1 July 2026". */
export function formatFact(f: Fact): string {
  if (typeof f.value === 'string') {
    if (f.unit === 'date') {
      return new Date(`${f.value}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    }
    return f.value;
  }
  if (f.unit === 'bp') return formatRate(f.value);
  if (f.unit === 'cents') {
    const s = formatMoney(f.value, f.jurisdiction === 'UK' ? 'GBP' : 'AUD');
    return s.endsWith('.00') ? s.slice(0, -3) : s;
  }
  return f.value.toLocaleString('en-GB');
}

export type FactStatus = 'verified' | 'stale' | 'unverified';

/** Verified within the last 365 days, verified longer ago, or never checked. */
export function factStatus(f: Fact, today: string): FactStatus {
  if (f.verifiedOn === null) return 'unverified';
  const ageDays = (Date.parse(today) - Date.parse(f.verifiedOn)) / 86_400_000;
  return ageDays > 365 ? 'stale' : 'verified';
}
