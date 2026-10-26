export interface SizeInputs {
  turnoverCents: number;
  balanceSheetCents: number;
  employees: number;
}

export interface SizeLimits {
  turnoverCents: number;
  balanceSheetCents: number;
  employees: number;
}

export type UkSize = 'micro' | 'small' | 'medium' | 'large';

/** How many of the three UK tests ("not more than") a year's figures meet. */
export function ukTestsMet(year: SizeInputs, limits: SizeLimits): number {
  return (
    Number(year.turnoverCents <= limits.turnoverCents) +
    Number(year.balanceSheetCents <= limits.balanceSheetCents) +
    Number(year.employees <= limits.employees)
  );
}

/** One year on its own: the smallest band where at least two of three tests are met. */
export function ukBandForYear(year: SizeInputs, limits: Record<Exclude<UkSize, 'large'>, SizeLimits>): UkSize {
  if (ukTestsMet(year, limits.micro) >= 2) return 'micro';
  if (ukTestsMet(year, limits.small) >= 2) return 'small';
  if (ukTestsMet(year, limits.medium) >= 2) return 'medium';
  return 'large';
}

type Band = Exclude<UkSize, 'large'>;
const bands: Band[] = ['micro', 'small', 'medium'];

/**
 * Companies Act 2006 s.382 (small), s.384A (micro) and s.465 (medium), all
 * worded the same way. In its first financial year a company qualifies for a
 * band if it meets the conditions that year. In a later year it qualifies if:
 *   (a) it meets the conditions this year and last year, or
 *   (b) it meets them this year and qualified last year, or
 *   (c) it met them last year and qualified last year.
 * So one unusual year never changes a company's size on its own.
 * `years` is oldest first, starting with the company's first financial year.
 */
export function ukSizeOverYears(years: SizeInputs[], limits: Record<Band, SizeLimits>): UkSize[] {
  const qualified: Record<Band, boolean[]> = { micro: [], small: [], medium: [] };
  for (const band of bands) {
    years.forEach((year, i) => {
      const meetsNow = ukTestsMet(year, limits[band]) >= 2;
      if (i === 0) {
        qualified[band].push(meetsNow);
        return;
      }
      const meetsBefore = ukTestsMet(years[i - 1]!, limits[band]) >= 2;
      const qualifiedBefore = qualified[band][i - 1]!;
      qualified[band].push((meetsNow && meetsBefore) || (meetsNow && qualifiedBefore) || (meetsBefore && qualifiedBefore));
    });
  }
  return years.map((_, i) => bands.find((band) => qualified[band][i]) ?? 'large');
}

/** Corporations Act 2001 s.45A: large if at least two of three tests are met ("or more"). */
export function auProprietarySize(year: SizeInputs, limits: SizeLimits): { size: 'small' | 'large'; testsMet: number } {
  const met =
    Number(year.turnoverCents >= limits.turnoverCents) +
    Number(year.balanceSheetCents >= limits.balanceSheetCents) +
    Number(year.employees >= limits.employees);
  return { size: met >= 2 ? 'large' : 'small', testsMet: met };
}
