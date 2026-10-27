import { describe, expect, it } from 'vitest';
import { ACCOUNT_LABELS_VERIFIED_ON, suggestClass, typeOfClass } from '../utils/accountClasses';
import { parseCsv } from '../utils/csv';
import { mapTrialBalance, parseLedgerAmount, suggestMapping } from '../utils/ledgerImport';
import { balanceSheet, movementBetween, profitAndLoss, variance, type Balance, type ReportAccount } from '../utils/reports';
import { AU_TB_CSV, UK_TB_CSV, UK_TB_UNBALANCED_CSV } from './fixtures/tb';

describe('parseCsv', () => {
  it('splits plain rows', () => {
    expect(parseCsv('a,b\nc,d').rows).toEqual([['a', 'b'], ['c', 'd']]);
  });
  it('handles quotes, escaped quotes and commas inside quotes', () => {
    expect(parseCsv('"x, y","say ""hi"""').rows).toEqual([['x, y', 'say "hi"']]);
  });
  it('handles CRLF and a BOM', () => {
    expect(parseCsv('﻿a,b\r\nc,d\r\n').rows).toEqual([['a', 'b'], ['c', 'd']]);
  });
  it('keeps a newline inside quotes', () => {
    expect(parseCsv('"l1\nl2",z').rows).toEqual([['l1\nl2', 'z']]);
  });
  it('keeps blank lines in the middle as one empty field', () => {
    expect(parseCsv('a\n\nb').rows).toEqual([['a'], [''], ['b']]);
  });
  it('reports an unclosed quote', () => {
    expect(parseCsv('"abc').issues).toEqual(['A quoted field is not closed.']);
  });
});

describe('account classes', () => {
  it('maps Xero-style labels case-insensitively', () => {
    expect(suggestClass(' Direct Costs ')).toBe('cost_of_sales');
    expect(suggestClass('OVERHEAD')).toBe('operating_expense');
  });
  it('leaves ambiguous labels unmapped', () => {
    expect(suggestClass('Asset')).toBeNull();
    expect(suggestClass('Liability')).toBeNull();
  });
  it('gives each class its type', () => {
    expect(typeOfClass('other_income')).toBe('revenue');
    expect(typeOfClass('cost_of_sales')).toBe('expense');
  });
  it('is marked unverified', () => {
    expect(ACCOUNT_LABELS_VERIFIED_ON).toBeNull();
  });
});

describe('trial-balance import', () => {
  it('parses accounting amount formats', () => {
    const cases: [string, number | null][] = [
      ['1,234.56', 123456],
      ['(1,234.56)', -123456],
      ['-1234.56', -123456],
      ['1,234.56 CR', -123456],
      ['99 dr', 9900],
      ['$1,234', 123400],
      ['£12.5', 1250],
      ['', 0],
      ['-', 0],
      ['12.345', null],
      ['abc', null],
    ];
    for (const [input, want] of cases) expect(parseLedgerAmount(input)).toBe(want);
  });
  it('finds the Xero-style header under title rows', () => {
    expect(suggestMapping(parseCsv(AU_TB_CSV).rows)).toEqual({ headerRow: 4, code: 1, name: 0, type: 2, debit: 3, credit: 4, balance: null });
  });
  it('maps the AU fixture', () => {
    const rows = parseCsv(AU_TB_CSV).rows;
    const m = suggestMapping(rows);
    expect(m).not.toBeNull();
    if (!m) return;
    const r = mapTrialBalance(rows, m);
    expect(r.rows).toHaveLength(12);
    expect(r.totalDebitCents).toBe(4_130_000);
    expect(r.totalCreditCents).toBe(4_130_000);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]?.code).toBe('skipped-rows');
    expect(r.issues[0]?.message).toBe('1 rows were skipped (blank or total rows).');
    expect(r.rows.find((x) => x.code === '711')?.creditCents).toBe(120_000);
  });
  it('maps the UK fixture with no title rows', () => {
    const rows = parseCsv(UK_TB_CSV).rows;
    const m = suggestMapping(rows);
    expect(m?.headerRow).toBe(0);
    if (!m) return;
    const r = mapTrialBalance(rows, m);
    expect(r.rows).toHaveLength(8);
    expect(r.issues).toEqual([]);
  });
  it('blocks an unbalanced trial balance', () => {
    const rows = parseCsv(UK_TB_UNBALANCED_CSV).rows;
    const m = suggestMapping(rows);
    if (!m) throw new Error('no mapping');
    const r = mapTrialBalance(rows, m);
    expect(r.issues).toContainEqual({
      level: 'block',
      code: 'unbalanced',
      message: 'Debits (16,400.00) do not equal credits (16,700.00).',
      row: null,
    });
  });
  it('blocks a bad amount with its row number', () => {
    const rows = parseCsv(UK_TB_CSV.replace('2400.00', '24OO')).rows;
    const m = suggestMapping(rows);
    if (!m) throw new Error('no mapping');
    const r = mapTrialBalance(rows, m);
    expect(r.issues.some((i) => i.level === 'block' && i.message === 'Row 3: "24OO" is not an amount.')).toBe(true);
  });
  it('blocks a duplicate code', () => {
    const rows = parseCsv(UK_TB_CSV + '\n1200,Petty Cash,Bank,10.00,').rows;
    const m = suggestMapping(rows);
    if (!m) throw new Error('no mapping');
    const r = mapTrialBalance(rows, m);
    const dup = r.issues.find((i) => i.code === 'duplicate-code');
    expect(dup?.level).toBe('block');
    expect(dup?.row).toBe(10);
  });
  it('asks for columns when the mapping has none', () => {
    const rows = parseCsv(UK_TB_CSV).rows;
    const r = mapTrialBalance(rows, { headerRow: 0, code: 0, name: 1, type: 2, debit: null, credit: null, balance: null });
    expect(r.issues).toEqual([
      {
        level: 'block',
        code: 'missing-column',
        message: 'Choose an account name column and either debit and credit columns or a balance column.',
        row: null,
      },
    ]);
  });
});

function load(csv: string): { balances: Balance[]; accts: ReportAccount[] } {
  const rows = parseCsv(csv).rows;
  const m = suggestMapping(rows);
  if (!m) throw new Error('no mapping');
  const r = mapTrialBalance(rows, m);
  const accts: ReportAccount[] = r.rows.map((x) => {
    const accountClass = suggestClass(x.sourceType);
    if (!accountClass) throw new Error(`unmapped ${x.sourceType}`);
    return { code: x.code, name: x.name, accountClass };
  });
  const balances: Balance[] = r.rows.map((x) => ({ code: x.code, debitCents: x.debitCents, creditCents: x.creditCents }));
  return { balances, accts };
}

describe('reports', () => {
  it('builds the AU profit and loss', () => {
    const { balances, accts } = load(AU_TB_CSV);
    const pl = profitAndLoss(balances, accts);
    expect(pl.revenue.totalCents).toBe(3_000_000);
    expect(pl.costOfSales.totalCents).toBe(900_000);
    expect(pl.grossProfitCents).toBe(2_100_000);
    expect(pl.operatingExpenses.totalCents).toBe(940_000);
    expect(pl.netProfitCents).toBe(1_160_000);
  });
  it('builds the AU balance sheet and it balances', () => {
    const { balances, accts } = load(AU_TB_CSV);
    const bs = balanceSheet(balances, accts);
    expect(bs.currentAssets.totalCents).toBe(1_690_000);
    expect(bs.nonCurrentAssets.totalCents).toBe(480_000);
    expect(bs.totalAssetsCents).toBe(2_170_000);
    expect(bs.totalLiabilitiesCents).toBe(330_000);
    expect(bs.netAssetsCents).toBe(1_840_000);
    expect(bs.currentYearEarningsCents).toBe(1_160_000);
    expect(bs.totalEquityCents).toBe(1_840_000);
    expect(bs.balances).toBe(true);
    expect(bs.issues).toEqual([]);
  });
  it('builds the UK reports', () => {
    const { balances, accts } = load(UK_TB_CSV);
    expect(profitAndLoss(balances, accts).netProfitCents).toBe(870_000);
    const bs = balanceSheet(balances, accts);
    expect(bs.netAssetsCents).toBe(880_000);
    expect(bs.balances).toBe(true);
  });
  it('flags a balance sheet that does not balance', () => {
    const { balances, accts } = load(AU_TB_CSV);
    const bs = balanceSheet(balances.filter((b) => b.code !== '090'), accts);
    expect(bs.balances).toBe(false);
    expect(bs.issues).toEqual(['The balance sheet does not balance: net assets and equity differ by 12,500.00.']);
  });
  it('throws on a balance with no account', () => {
    expect(() => profitAndLoss([{ code: 'X', debitCents: 1, creditCents: 0 }], [])).toThrow(RangeError);
  });
  it('rounds variance half away from zero', () => {
    expect(variance(1_150, 1_000)).toEqual({ changeCents: 150, changeBp: 1500 });
    expect(variance(2, 3)).toEqual({ changeCents: -1, changeBp: -3333 });
    expect(variance(5, 0).changeBp).toBeNull();
  });
  it('the P&L of a movement equals the difference of two YTD P&Ls', () => {
    const { balances: later, accts } = load(AU_TB_CSV);
    const earlier: Balance[] = later
      .filter((b) => b.code !== '090')
      .map((b) => {
        if (b.code === '200') return { code: '200', debitCents: 0, creditCents: 1_000_000 };
        if (b.code === '300') return { code: '300', debitCents: 150_000, creditCents: 0 };
        return b;
      });
    const pe = profitAndLoss(earlier, accts).netProfitCents;
    expect(pe).toBe(-90_000);
    const pm = profitAndLoss(movementBetween(later, earlier), accts).netProfitCents;
    expect(pm).toBe(1_250_000);
    expect(pm).toBe(profitAndLoss(later, accts).netProfitCents - pe);
  });
});
