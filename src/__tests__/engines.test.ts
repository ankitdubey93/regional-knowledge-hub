import { describe, expect, it } from 'vitest';
import { reducingBalance, straightLine } from '../utils/depreciation';
import { fifo, InsufficientStockError, weightedAverage, type StockEvent } from '../utils/inventory';
import { auProprietarySize, ukBandForYear, ukSizeOverYears } from '../utils/companySize';
import { checkEntry, compareEntries, trialBalance } from '../utils/ledger';
import { addDays, isDue, review } from '../utils/srs';

describe('depreciation', () => {
  it('straight line ends exactly at residual', () => {
    const rows = straightLine(1_000_000, 100_000, 3);
    expect(rows.map((r) => r.chargeCents)).toEqual([300_000, 300_000, 300_000]);
    const odd = straightLine(100_000, 0, 3);
    expect(odd.map((r) => r.chargeCents)).toEqual([33_333, 33_333, 33_334]);
    expect(odd.at(-1)!.closingCents).toBe(0);
  });
  it('reducing balance charges a rate of the opening amount', () => {
    expect(reducingBalance(1_000_000, 2500, 3).map((r) => r.chargeCents)).toEqual([250_000, 187_500, 140_625]);
  });
  it('rejects nonsense', () => {
    expect(() => straightLine(100, 200, 3)).toThrow();
    expect(() => reducingBalance(100, 0, 3)).toThrow();
  });
});

describe('inventory', () => {
  const events: StockEvent[] = [
    { kind: 'purchase', qty: 100, unitCostCents: 1000 },
    { kind: 'purchase', qty: 100, unitCostCents: 1200 },
    { kind: 'sale', qty: 150 },
  ];
  it('FIFO uses the oldest layers', () => {
    const r = fifo(events);
    expect(r.cogsCents).toBe(100 * 1000 + 50 * 1200);
    expect(r.closingQty).toBe(50);
    expect(r.closingValueCents).toBe(50 * 1200);
  });
  it('WAC uses the running average and never drifts', () => {
    const r = weightedAverage(events);
    expect(r.cogsCents).toBe(165_000);
    expect(r.closingValueCents).toBe(55_000);
    const thirds = weightedAverage([{ kind: 'purchase', qty: 3, unitCostCents: 333 }, { kind: 'purchase', qty: 0 + 1, unitCostCents: 1 }, { kind: 'sale', qty: 1 }, { kind: 'sale', qty: 3 }]);
    expect(thirds.cogsCents).toBe(1000);
    expect(thirds.closingValueCents).toBe(0);
  });
  it('refuses to sell stock that is not there', () => {
    expect(() => fifo([{ kind: 'sale', qty: 1 }])).toThrow(InsufficientStockError);
  });
});

describe('company size', () => {
  const limits = {
    micro: { turnoverCents: 100_000_000, balanceSheetCents: 50_000_000, employees: 10 },
    small: { turnoverCents: 1_500_000_000, balanceSheetCents: 750_000_000, employees: 50 },
    medium: { turnoverCents: 5_400_000_000, balanceSheetCents: 2_700_000_000, employees: 250 },
  };
  const small = { turnoverCents: 800_000_000, balanceSheetCents: 300_000_000, employees: 30 };
  const medium = { turnoverCents: 2_000_000_000, balanceSheetCents: 1_000_000_000, employees: 80 };
  it('two of three tests', () => {
    expect(ukBandForYear(small, limits)).toBe('small');
    expect(ukBandForYear({ turnoverCents: 2_000_000_000, balanceSheetCents: 300_000_000, employees: 30 }, limits)).toBe('small');
    expect(ukBandForYear(medium, limits)).toBe('medium');
  });
  it('one big year does not change the size; two do', () => {
    expect(ukSizeOverYears([small, medium, small], limits)).toEqual(['small', 'small', 'small']);
    expect(ukSizeOverYears([small, medium, medium], limits)).toEqual(['small', 'small', 'medium']);
    expect(ukSizeOverYears([medium, small], limits)).toEqual(['medium', 'medium']);
    expect(ukSizeOverYears([medium, small, small], limits)).toEqual(['medium', 'medium', 'small']);
  });
  it('AU large proprietary: two of three, "or more"', () => {
    const lim = { turnoverCents: 5_000_000_000, balanceSheetCents: 2_500_000_000, employees: 100 };
    expect(auProprietarySize({ turnoverCents: 5_000_000_000, balanceSheetCents: 0, employees: 100 }, lim).size).toBe('large');
    expect(auProprietarySize({ turnoverCents: 6_000_000_000, balanceSheetCents: 0, employees: 99 }, lim).size).toBe('small');
  });
});

describe('ledger', () => {
  const bought = [
    { account: '1-ASSET', debitCents: 200_000, creditCents: 0 },
    { account: 'GST', debitCents: 20_000, creditCents: 0 },
    { account: 'AP', debitCents: 0, creditCents: 220_000 },
  ];
  it('accepts a balanced entry', () => {
    expect(checkEntry(bought)).toMatchObject({ balanced: true, problems: [] });
  });
  it('rejects an unbalanced or two-sided line', () => {
    expect(checkEntry([{ account: 'A', debitCents: 100, creditCents: 0 }, { account: 'B', debitCents: 0, creditCents: 90 }]).balanced).toBe(false);
    expect(checkEntry([{ account: 'A', debitCents: 100, creditCents: 100 }, { account: 'B', debitCents: 0, creditCents: 0 }]).problems.length).toBeGreaterThan(0);
  });
  it('explains what is wrong with an answer', () => {
    const got = [
      { account: '1-ASSET', debitCents: 220_000, creditCents: 0 },
      { account: 'AP', debitCents: 0, creditCents: 220_000 },
    ];
    const r = compareEntries(got, bought);
    expect(r.correct).toBe(false);
    expect(r.feedback).toContainEqual({ account: '1-ASSET', kind: 'wrong-amount', expectedCents: 200_000, gotCents: 220_000 });
    expect(r.feedback).toContainEqual({ account: 'GST', kind: 'missing', expectedCents: 20_000 });
    const flipped = compareEntries(bought.map((l) => ({ ...l, debitCents: l.creditCents, creditCents: l.debitCents })), bought);
    expect(flipped.feedback.every((f) => f.kind === 'wrong-side')).toBe(true);
  });
  it('a split line still matches', () => {
    const split = [{ account: '1-ASSET', debitCents: 100_000, creditCents: 0 }, { account: '1-ASSET', debitCents: 100_000, creditCents: 0 }, bought[1]!, bought[2]!];
    expect(compareEntries(split, bought).correct).toBe(true);
  });
  it('trial balance balances', () => {
    const tb = trialBalance([bought, [{ account: 'AP', debitCents: 220_000, creditCents: 0 }, { account: 'BANK', debitCents: 0, creditCents: 220_000 }]]);
    expect(tb.totalDebitCents).toBe(tb.totalCreditCents);
    expect(tb.rows.find((r) => r.account === 'AP')).toBeUndefined();
  });
});

describe('spaced repetition', () => {
  it('moves up on right, back to box 1 on wrong', () => {
    const a = review(undefined, true, '2026-10-26');
    expect(a).toEqual({ box: 1, due: '2026-10-27' });
    const b = review({ box: 3, due: '2026-10-26' }, true, '2026-10-26');
    expect(b).toEqual({ box: 4, due: '2026-11-09' });
    expect(review(b, false, '2026-11-09')).toEqual({ box: 1, due: '2026-11-10' });
    expect(review({ box: 5, due: '2026-10-26' }, true, '2026-10-26').box).toBe(5);
  });
  it('due dates', () => {
    expect(isDue(undefined, '2026-10-26')).toBe(true);
    expect(isDue({ box: 2, due: '2026-10-27' }, '2026-10-26')).toBe(false);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});
