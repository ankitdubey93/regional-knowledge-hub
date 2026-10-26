import { applyRate, roundDiv } from './money';

export interface DepreciationYear {
  year: number;
  openingCents: number;
  chargeCents: number;
  closingCents: number;
}

/**
 * Straight line: (cost - residual) / life each year. The rounding remainder
 * lands in the final year so the asset ends exactly at its residual value.
 */
export function straightLine(costCents: number, residualCents: number, lifeYears: number): DepreciationYear[] {
  if (lifeYears < 1 || !Number.isInteger(lifeYears)) throw new RangeError('Useful life must be a whole number of years, at least 1');
  if (residualCents > costCents) throw new RangeError('Residual value cannot exceed cost');
  const base = costCents - residualCents;
  const annual = roundDiv(base, lifeYears);
  const rows: DepreciationYear[] = [];
  let opening = costCents;
  for (let year = 1; year <= lifeYears; year++) {
    const charge = year === lifeYears ? opening - residualCents : annual;
    rows.push({ year, openingCents: opening, chargeCents: charge, closingCents: opening - charge });
    opening -= charge;
  }
  return rows;
}

/**
 * Reducing (diminishing) balance: rate x opening carrying amount each year.
 * It never reaches zero on its own; the schedule stops at `years`, and a
 * charge never takes the asset below its residual value.
 */
export function reducingBalance(costCents: number, rateBp: number, years: number, residualCents = 0): DepreciationYear[] {
  if (years < 1 || !Number.isInteger(years)) throw new RangeError('Years must be a whole number, at least 1');
  if (rateBp <= 0 || rateBp > 10_000) throw new RangeError('Rate must be between 0% and 100%');
  const rows: DepreciationYear[] = [];
  let opening = costCents;
  for (let year = 1; year <= years; year++) {
    const charge = Math.min(applyRate(opening, rateBp), Math.max(0, opening - residualCents));
    rows.push({ year, openingCents: opening, chargeCents: charge, closingCents: opening - charge });
    opening -= charge;
  }
  return rows;
}
