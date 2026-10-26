import { applyRate, roundDiv } from './money';

/** GST in a GST-inclusive price: price x rate / (1 + rate). At 10% that is 1/11. */
export function gstFromInclusive(inclusiveCents: number, rateBp: number): number {
  return roundDiv(inclusiveCents * rateBp, 10_000 + rateBp);
}

/** GST to add to a GST-exclusive price. */
export function gstOnExclusive(exclusiveCents: number, rateBp: number): number {
  return applyRate(exclusiveCents, rateBp);
}

export type SaleTreatment = 'taxable' | 'export' | 'gst-free' | 'input-taxed' | 'bas-excluded';
export type PurchaseTreatment = 'taxable' | 'gst-free' | 'input-taxed' | 'bas-excluded';

export type BasTransaction =
  | { id: string; kind: 'sale'; inclusiveCents: number; treatment: SaleTreatment }
  | { id: string; kind: 'purchase'; inclusiveCents: number; treatment: PurchaseTreatment; capital: boolean };

export interface BasWorksheet {
  G1: number; // total sales, GST-inclusive
  G2: number; // export sales
  G3: number; // other GST-free sales
  G4: number; // input-taxed sales
  G10: number; // capital purchases, GST-inclusive
  G11: number; // non-capital purchases, GST-inclusive
  '1A': number; // GST on sales
  '1B': number; // GST on purchases
  net: number; // 1A - 1B: positive is payable to the ATO, negative is a refund
}

/**
 * The GST labels of a full BAS from a list of transactions (accruals basis).
 * GST is worked out per transaction and then summed, the way accounting
 * software does it. BAS-excluded items (wages, super, loans, owner drawings)
 * appear on no GST label at all.
 * Simplified: G13 (purchases for input-taxed sales) and G14/G15 are not modelled;
 * an input-taxed purchase is counted in G10/G11 with no GST credit.
 */
export function basWorksheet(transactions: BasTransaction[], rateBp: number): BasWorksheet {
  const w: BasWorksheet = { G1: 0, G2: 0, G3: 0, G4: 0, G10: 0, G11: 0, '1A': 0, '1B': 0, net: 0 };
  for (const t of transactions) {
    if (t.treatment === 'bas-excluded') continue;
    if (t.kind === 'sale') {
      w.G1 += t.inclusiveCents;
      if (t.treatment === 'export') w.G2 += t.inclusiveCents;
      if (t.treatment === 'gst-free') w.G3 += t.inclusiveCents;
      if (t.treatment === 'input-taxed') w.G4 += t.inclusiveCents;
      if (t.treatment === 'taxable') w['1A'] += gstFromInclusive(t.inclusiveCents, rateBp);
    } else {
      if (t.capital) w.G10 += t.inclusiveCents;
      else w.G11 += t.inclusiveCents;
      if (t.treatment === 'taxable') w['1B'] += gstFromInclusive(t.inclusiveCents, rateBp);
    }
  }
  w.net = w['1A'] - w['1B'];
  return w;
}
