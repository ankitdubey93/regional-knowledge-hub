import { describe, expect, it } from 'vitest';
import {
  buildLedgerSources,
  isLedgerQuestion,
  ledgerAccountNames,
  pickComparison,
  redactQuestionAndNames,
  type LedgerImportRef,
  type LedgerSnapshot,
} from '../chat/ledgerSources';

const ref = (id: string, asAt: string, over: Partial<LedgerImportRef> = {}): LedgerImportRef => ({
  id,
  asAt,
  periodStart: '2025-07-01',
  currency: 'AUD',
  source: 'xero',
  status: 'active',
  ...over,
});

const accts = {
  '200': { code: '200', name: 'Sales', accountClass: 'revenue' as const },
  '300': { code: '300', name: 'Purchases', accountClass: 'cost_of_sales' as const },
  '469': { code: '469', name: 'Rent', accountClass: 'operating_expense' as const },
  '404': { code: '404', name: 'Bank Fees', accountClass: 'operating_expense' as const },
  '090': { code: '090', name: 'Bank', accountClass: 'current_asset' as const },
  '800': { code: '800', name: 'Accounts Payable', accountClass: 'current_liability' as const },
  '960': { code: '960', name: 'Capital', accountClass: 'equity' as const },
};

const small: LedgerSnapshot = {
  import: { ...ref('cur', '2026-06-30'), periodStart: '2025-07-01' },
  accounts: [accts['200'], accts['300'], accts['469'], accts['090'], accts['800'], accts['960']],
  balances: [
    { code: '200', debitCents: 0, creditCents: 3000000 },
    { code: '300', debitCents: 900000, creditCents: 0 },
    { code: '469', debitCents: 800000, creditCents: 0 },
    { code: '090', debitCents: 2000000, creditCents: 0 },
    { code: '800', debitCents: 0, creditCents: 220000 },
    { code: '960', debitCents: 0, creditCents: 480000 },
  ],
};

const smallPrior: LedgerSnapshot = {
  import: { ...ref('pri', '2025-06-30'), periodStart: '2024-07-01' },
  accounts: [accts['200'], accts['300'], accts['469'], accts['404'], accts['090'], accts['800'], accts['960']],
  balances: [
    { code: '200', debitCents: 0, creditCents: 2500000 },
    { code: '300', debitCents: 900000, creditCents: 0 },
    { code: '469', debitCents: 800000, creditCents: 0 },
    { code: '404', debitCents: 10000, creditCents: 0 },
    { code: '090', debitCents: 1490000, creditCents: 0 },
    { code: '800', debitCents: 0, creditCents: 220000 },
    { code: '960', debitCents: 0, creditCents: 480000 },
  ],
};

const names = ledgerAccountNames(small, null);

describe('ledger sources', () => {
  it('L1 recognises a books question', () => {
    expect(isLedgerQuestion('What was our revenue this year?', [])).toBe(true);
    expect(isLedgerQuestion('How much cash is in the bank?', [])).toBe(true);
    expect(isLedgerQuestion('What did purchases come to?', ['Purchases'])).toBe(true);
  });

  it('L2 ignores a question that is not about the books', () => {
    const accountNames = ['Purchases', 'Business Bank Account'];
    expect(isLedgerQuestion('When does the zorbel levy apply to fennimore marmalade?', accountNames)).toBe(false);
    expect(isLedgerQuestion('Who must lodge a BAS?', accountNames)).toBe(false);
  });

  it('L3 pickComparison prefers the same date a year earlier', () => {
    const cur = ref('c', '2026-06-30');
    const picked = pickComparison([ref('a', '2026-03-31'), ref('b', '2025-06-30')], cur);
    expect(picked?.asAt).toBe('2025-06-30');
  });

  it('L4 pickComparison falls back to the latest earlier import', () => {
    const cur = ref('c', '2026-06-30');
    const picked = pickComparison([ref('a', '2025-12-31'), ref('b', '2026-03-31')], cur);
    expect(picked?.asAt).toBe('2026-03-31');
  });

  it('L5 pickComparison returns null when nothing qualifies', () => {
    const cur = ref('c', '2026-06-30');
    expect(pickComparison([ref('g', '2025-06-30', { currency: 'GBP' })], cur)).toBeNull();
    expect(pickComparison([ref('s', '2025-06-30', { status: 'superseded' })], cur)).toBeNull();
    expect(pickComparison([ref('l', '2026-09-30')], cur)).toBeNull();
  });

  it('L6 the profit and loss text, without a prior', () => {
    const [pl] = buildLedgerSources({ clientId: 'c1', current: small, prior: null, displayNames: names });
    expect(pl.text).toBe(
      [
        'Profit and loss for 2025-07-01 to 2026-06-30, in AUD, from the trial balance imported from Xero.',
        'Amounts are as imported and have not been reviewed. Costs and expenses are shown as positive amounts.',
        'Revenue',
        '200 Sales: 30,000.00',
        'Total revenue: 30,000.00',
        'Cost of sales',
        '300 Purchases: 9,000.00',
        'Total cost of sales: 9,000.00',
        'Gross profit: 21,000.00',
        'Operating expense',
        '469 Rent: 8,000.00',
        'Total operating expense: 8,000.00',
        'Net profit: 13,000.00',
      ].join('\n'),
    );
  });

  it('L7 the balance sheet includes current year earnings in equity', () => {
    const [, bs] = buildLedgerSources({ clientId: 'c1', current: small, prior: null, displayNames: names });
    expect(bs.text).toContain('Net assets: 17,800.00');
    expect(bs.text).toContain('Current year earnings: 13,000.00');
    expect(bs.text).toContain('Total equity: 17,800.00');
    expect(bs.text).not.toContain('Total equity: 4,800.00');
  });

  it('L8 a prior adds comparison and change to every line', () => {
    const displayNames = ledgerAccountNames(small, smallPrior);
    const [pl] = buildLedgerSources({ clientId: 'c1', current: small, prior: smallPrior, displayNames });
    expect(pl.text).toContain('200 Sales: 30,000.00 (comparison 25,000.00; change +5,000.00, +20%)');
    expect(pl.text).toContain('404 Bank Fees: 0.00 (comparison 100.00; change -100.00, -100%)');
    expect(pl.text.split('\n')[1]).toMatch(/^Comparison: 2024-07-01 to 2025-06-30/);
  });

  it('L9 a prior of zero gives a change with no percentage', () => {
    const noSales: LedgerSnapshot = {
      ...smallPrior,
      balances: smallPrior.balances.filter((b) => b.code !== '200'),
    };
    const displayNames = ledgerAccountNames(small, noSales);
    const [pl] = buildLedgerSources({ clientId: 'c1', current: small, prior: noSales, displayNames });
    expect(pl.text).toContain('200 Sales: 30,000.00 (comparison 0.00; change +30,000.00)');
    const line = pl.text.split('\n').find((l) => l.startsWith('200 '));
    expect(line).not.toContain('%');
  });

  it('L10 account names come only from displayNames', () => {
    const displayNames = new Map(names);
    displayNames.set('960', 'Capital [NAME_1]');
    const [, bs] = buildLedgerSources({ clientId: 'c1', current: small, prior: null, displayNames });
    expect(bs.text).toContain('960 Capital [NAME_1]: 4,800.00');
    const missing = new Map(names);
    missing.delete('960');
    expect(() => buildLedgerSources({ clientId: 'c1', current: small, prior: null, displayNames: missing })).toThrow(RangeError);
  });

  it('L11 the question and account names are redacted together', () => {
    const out = redactQuestionAndNames('Ask jo@acme.com.au about Acme Pty Ltd', ['Loan Acme Pty Ltd', 'Rent'], ['Acme Pty Ltd']);
    expect(out.question).toBe('Ask [EMAIL_1] about [NAME_1]');
    expect(out.accountNames).toEqual(['Loan [NAME_1]', 'Rent']);
  });

  it('L12 over 400 accounts leaves only totals', () => {
    const accounts = Array.from({ length: 401 }, (_, i) => ({
      code: String(1000 + i),
      name: `Income ${i}`,
      accountClass: 'revenue' as const,
    }));
    const balances = accounts.map((a, i) => ({ code: a.code, debitCents: 0, creditCents: i === 0 ? 12345678901 : 0 }));
    const big: LedgerSnapshot = { import: ref('big', '2026-06-30'), accounts, balances };
    const displayNames = ledgerAccountNames(big, null);
    const [pl] = buildLedgerSources({ clientId: 'c9', current: big, prior: null, displayNames });
    expect(pl.text).toContain('Account lines are left out because this report has more than 400 accounts; only totals are shown.');
    expect(pl.text.split('\n').some((l) => /^\d/.test(l))).toBe(false);
    expect(pl.text).toContain('123,456,789.01');
    expect(pl.sitePath).toBe('/entities/c9/reports?importId=big&tab=pnl');
    expect(pl.excerpt.length).toBeLessThanOrEqual(600);
    expect(pl.excerpt.split('\n')[0]).toBe(pl.text.split('\n')[0]);
  });
});
