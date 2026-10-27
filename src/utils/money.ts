/**
 * Money is integer cents (or pence) everywhere in this app. A rate is integer
 * basis points (10% = 1000). Every rounding goes through roundDiv, so there is
 * exactly one rounding rule: half away from zero.
 */

export type Currency = 'AUD' | 'GBP';

/** n / d rounded half away from zero. Both are integers; d > 0. */
export function roundDiv(n: number, d: number): number {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || d <= 0) {
    throw new RangeError(`roundDiv needs safe integers and d > 0, got ${n} / ${d}`);
  }
  const sign = n < 0 ? -1 : 1;
  const abs = Math.abs(n);
  return sign * Math.floor((abs * 2 + d) / (d * 2));
}

/** amount x rate, rounded once. 1000 bp of 12345 cents = 1235 cents. */
export function applyRate(cents: number, rateBp: number): number {
  return roundDiv(cents * rateBp, 10_000);
}

/**
 * Parse what a learner types ("1,100", "1100.5", "$2,200.00", "-15") into cents.
 * Returns null for anything that is not a plain amount with at most 2 decimals.
 */
export function parseMoney(input: string): number | null {
  const cleaned = input.trim().replace(/[\s,$£A]/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const negative = cleaned.startsWith('-');
  const [whole = '0', frac = ''] = cleaned.replace('-', '').split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

/** "10" → 1000, "10.5" → 1050, "10.25%" → 1025, " 0.75 % " → 75. More than 2 decimals, negatives, empty, or > 100% → null. Digits only, no floats. */
export function parseRateBp(input: string): number | null {
  const m = /^\s*(\d{1,3})(?:\.(\d{1,2}))?\s*%?\s*$/.exec(input);
  if (!m) return null;
  const bp = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return bp > 10_000 ? null : bp;
}

/** 1000 → "10", 1050 → "10.5", 1025 → "10.25", 75 → "0.75". Integer maths only. */
export function formatRateInput(bp: number): string {
  const whole = Math.trunc(bp / 100);
  const frac = String(bp % 100).padStart(2, '0').replace(/0+$/, '');
  return frac === '' ? String(whole) : `${whole}.${frac}`;
}

const formatters: Record<Currency, Intl.NumberFormat> = {
  AUD: new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }),
  GBP: new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }),
};

export function formatMoney(cents: number, currency: Currency): string {
  return formatters[currency].format(cents / 100);
}

/** "12.00%" style text for a basis-point rate. */
export function formatRate(bp: number): string {
  const whole = Math.trunc(bp / 100);
  const frac = Math.abs(bp % 100);
  return frac === 0 ? `${whole}%` : `${whole}.${String(frac).padStart(2, '0').replace(/0$/, '')}%`;
}

/** Plain number with thousands separators, for amounts shown without a symbol. */
export function formatPlain(cents: number): string {
  return (cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
