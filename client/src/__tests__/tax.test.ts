import { describe, expect, it } from 'vitest';
import { basWorksheet, gstFromInclusive, gstOnExclusive } from '../utils/gst';
import { vat100, vatFromGross } from '../utils/vat';
import { cisDeduction, employerNic, superGuarantee } from '../utils/payroll';

describe('GST', () => {
  it('takes 1/11 of a GST-inclusive price at 10%', () => {
    expect(gstFromInclusive(110_000, 1000)).toBe(10_000);
    expect(gstFromInclusive(220_000, 1000)).toBe(20_000);
    expect(gstFromInclusive(1000, 1000)).toBe(91); // 90.909… rounds to 91
  });
  it('adds 10% to an exclusive price', () => {
    expect(gstOnExclusive(100_000, 1000)).toBe(10_000);
  });
  it('fills the BAS labels', () => {
    const w = basWorksheet(
      [
        { id: '1', kind: 'sale', inclusiveCents: 1_100_000, treatment: 'taxable' },
        { id: '2', kind: 'sale', inclusiveCents: 200_000, treatment: 'export' },
        { id: '3', kind: 'sale', inclusiveCents: 50_000, treatment: 'gst-free' },
        { id: '4', kind: 'sale', inclusiveCents: 30_000, treatment: 'input-taxed' },
        { id: '5', kind: 'purchase', inclusiveCents: 330_000, treatment: 'taxable', capital: true },
        { id: '6', kind: 'purchase', inclusiveCents: 220_000, treatment: 'taxable', capital: false },
        { id: '7', kind: 'purchase', inclusiveCents: 40_000, treatment: 'gst-free', capital: false },
        { id: '8', kind: 'purchase', inclusiveCents: 500_000, treatment: 'bas-excluded', capital: false },
      ],
      1000,
    );
    expect(w).toEqual({ G1: 1_380_000, G2: 200_000, G3: 50_000, G4: 30_000, G10: 330_000, G11: 260_000, '1A': 100_000, '1B': 50_000, net: 50_000 });
  });
});

describe('VAT 100', () => {
  const rates = { standardBp: 2000, reducedBp: 500 };
  it('fills boxes 1 to 9', () => {
    const r = vat100(
      [
        { id: '1', kind: 'sale', netCents: 1_000_000, treatment: 'standard' },
        { id: '2', kind: 'sale', netCents: 200_050, treatment: 'zero' },
        { id: '3', kind: 'sale', netCents: 100_000, treatment: 'exempt' },
        { id: '4', kind: 'purchase', netCents: 300_000, treatment: 'standard' },
        { id: '5', kind: 'purchase', netCents: 40_000, treatment: 'reduced' },
        { id: '6', kind: 'purchase', netCents: 900_000, treatment: 'outside-scope' },
      ],
      rates,
    );
    expect(r.box1).toBe(200_000);
    expect(r.box4).toBe(62_000);
    expect(r.box5).toBe(138_000);
    expect(r.box6).toBe(1_300_000); // £13,000.50 → £13,000
    expect(r.box7).toBe(340_000);
  });
  it('puts construction reverse charge in boxes 1, 4 and 7 for the customer', () => {
    const r = vat100([{ id: '1', kind: 'purchase', netCents: 1_000_000, treatment: 'reverse-charge' }], rates);
    expect(r).toMatchObject({ box1: 200_000, box4: 200_000, box5: 0, box6: 0, box7: 1_000_000 });
  });
  it('the supplier of a reverse-charge supply has box 6 but no box 1', () => {
    const r = vat100([{ id: '1', kind: 'sale', netCents: 1_000_000, treatment: 'reverse-charge-supply' }], rates);
    expect(r).toMatchObject({ box1: 0, box6: 1_000_000 });
  });
  it('takes 1/6 of a gross price at 20%', () => {
    expect(vatFromGross(12_000, 2000)).toBe(2000);
  });
});

describe('payroll', () => {
  it('super guarantee at 12%, capped at the annual base', () => {
    expect(superGuarantee({ qualifyingEarningsCents: 500_000, earningsSoFarThisYearCents: 0, rateBp: 1200, maxContributionBaseAnnualCents: 27_083_000 }).superCents).toBe(60_000);
    const capped = superGuarantee({ qualifyingEarningsCents: 1_000_000, earningsSoFarThisYearCents: 26_583_000, rateBp: 1200, maxContributionBaseAnnualCents: 27_083_000 });
    expect(capped).toEqual({ liableEarningsCents: 500_000, superCents: 60_000, cappedCents: 500_000 });
  });
  it('employer NIC above £5,000 at 15%, less the Employment Allowance', () => {
    const r = employerNic({ annualEarningsCents: [3_000_000, 400_000], secondaryThresholdAnnualCents: 500_000, rateBp: 1500, employmentAllowanceCents: 1_050_000, claimsAllowance: true });
    expect(r.perEmployeeCents).toEqual([375_000, 0]);
    expect(r.payableCents).toBe(0);
    expect(employerNic({ annualEarningsCents: [3_000_000], secondaryThresholdAnnualCents: 500_000, rateBp: 1500, employmentAllowanceCents: 1_050_000, claimsAllowance: false }).payableCents).toBe(375_000);
  });
  it('CIS deducts from labour only', () => {
    expect(cisDeduction({ grossExVatCents: 200_000, materialsCents: 50_000, vatCents: 0, rateBp: 2000 })).toEqual({ labourCents: 150_000, deductionCents: 30_000, payToSubcontractorCents: 170_000 });
  });
});
