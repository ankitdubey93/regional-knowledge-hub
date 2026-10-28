import { applyRate, roundDiv } from '@chub/shared/utils/money';

export type VatSaleTreatment = 'standard' | 'reduced' | 'zero' | 'exempt' | 'outside-scope' | 'reverse-charge-supply';
export type VatPurchaseTreatment = 'standard' | 'reduced' | 'zero' | 'exempt' | 'outside-scope' | 'reverse-charge';

export type VatTransaction =
  | { id: string; kind: 'sale'; netCents: number; treatment: VatSaleTreatment }
  | { id: string; kind: 'purchase'; netCents: number; treatment: VatPurchaseTreatment };

export interface VatRates {
  standardBp: number;
  reducedBp: number;
}

export interface Vat100 {
  box1: number; // VAT due on sales and other outputs (incl. reverse-charge output tax)
  box2: number; // VAT due on acquisitions of goods from the EU (Northern Ireland only; not modelled, always 0)
  box3: number; // box1 + box2
  box4: number; // VAT reclaimed on purchases and other inputs
  box5: number; // net VAT: box3 - box4 (positive = pay HMRC, negative = repayment)
  box6: number; // total sales excluding VAT, whole pounds
  box7: number; // total purchases excluding VAT, whole pounds
  box8: number; // goods supplied to the EU (Northern Ireland only; always 0 here)
  box9: number; // goods acquired from the EU (Northern Ireland only; always 0 here)
}

function vatFor(netCents: number, treatment: string, rates: VatRates): number {
  if (treatment === 'standard' || treatment === 'reverse-charge') return applyRate(netCents, rates.standardBp);
  if (treatment === 'reduced') return applyRate(netCents, rates.reducedBp);
  return 0;
}

/** Whole pounds, pence dropped (boxes 6–9 are whole pounds). Kept in pence units. */
function wholePounds(pence: number): number {
  return Math.trunc(pence / 100) * 100;
}

/**
 * A VAT 100 return (VAT Notice 700/12) from a list of transactions.
 * Construction domestic reverse charge (VAT Notice 735):
 * - the customer puts the output VAT in box 1, reclaims it in box 4 and the net value in box 7;
 * - the supplier puts the net value in box 6 and no VAT in box 1.
 * Exempt and zero-rated values count in boxes 6 and 7; outside-the-scope items
 * (wages, VAT payments, dividends) count nowhere.
 */
export function vat100(transactions: VatTransaction[], rates: VatRates): Vat100 {
  let box1 = 0;
  let box4 = 0;
  let sales = 0;
  let purchases = 0;
  for (const t of transactions) {
    if (t.treatment === 'outside-scope') continue;
    if (t.kind === 'sale') {
      sales += t.netCents;
      box1 += vatFor(t.netCents, t.treatment, rates);
    } else {
      purchases += t.netCents;
      const vat = vatFor(t.netCents, t.treatment, rates);
      box4 += vat;
      if (t.treatment === 'reverse-charge') box1 += vat;
    }
  }
  const box2 = 0;
  const box3 = box1 + box2;
  return {
    box1,
    box2,
    box3,
    box4,
    box5: box3 - box4,
    box6: wholePounds(sales),
    box7: wholePounds(purchases),
    box8: 0,
    box9: 0,
  };
}

/** UK VAT in a VAT-inclusive price at a rate (20% → 1/6). */
export function vatFromGross(grossCents: number, rateBp: number): number {
  return roundDiv(grossCents * rateBp, 10_000 + rateBp);
}
