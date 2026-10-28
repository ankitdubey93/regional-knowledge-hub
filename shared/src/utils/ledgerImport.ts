/**
 * Trial-balance import: turns parsed CSV rows plus a column mapping into
 * validated rows in integer cents. Pure: no React, no storage, no DOM types.
 * Amounts are parsed from digit strings, never through floats (Hard rule 3).
 */
import { formatPlain } from './money';

/** "1,234.56", "(1,234.56)", "-1234.56", "1,234.56 CR", "$1,234", "£12.5", "" → integer cents (debit positive). null if not an amount. */
export function parseLedgerAmount(input: string): number | null {
  let s = input.trim();
  if (s === '' || s === '-' || s === '–') return 0;
  let negative = false;
  const suffix = /\s*(cr|dr)$/i.exec(s);
  if (suffix) {
    if ((suffix[1] ?? '').toLowerCase() === 'cr') negative = true;
    s = s.slice(0, suffix.index).trim();
  }
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/A\$|AUD|GBP|\$|£|\s|,/gi, '');
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole = '0', frac = ''] = s.split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return null;
  return negative && cents !== 0 ? -cents : cents;
}

export interface TbMapping {
  headerRow: number;
  code: number | null;
  name: number;
  type: number | null;
  debit: number | null;
  credit: number | null;
  balance: number | null;
}

export function suggestMapping(rows: string[][]): TbMapping | null {
  const limit = Math.min(rows.length, 20);
  for (let r = 0; r < limit; r++) {
    const cells = (rows[r] ?? []).map((c) => c.trim().toLowerCase());
    const find = (test: (c: string) => boolean): number | null => {
      const i = cells.findIndex(test);
      return i === -1 ? null : i;
    };
    const name = find((c) => c === 'account' || c === 'account name' || c === 'name');
    if (name === null) continue;
    const code = find((c) => ['account code', 'code', 'account #', 'account no', 'account no.', 'account number'].includes(c));
    const type = find((c) => c === 'account type' || c === 'type');
    const debit = find((c) => c.startsWith('debit'));
    const credit = find((c) => c.startsWith('credit'));
    const balance = find((c) => c === 'balance' || c === 'net' || c === 'closing balance');
    const both = debit !== null && credit !== null;
    if (!both && balance === null) continue;
    return { headerRow: r, code, name, type, debit, credit, balance: both ? null : balance };
  }
  return null;
}

export interface TbRow {
  code: string;
  name: string;
  sourceType: string;
  debitCents: number;
  creditCents: number;
  sourceRow: number;
}

export interface ImportIssue {
  level: 'block' | 'warn';
  code: 'no-rows' | 'bad-amount' | 'duplicate-code' | 'unbalanced' | 'missing-column' | 'unmapped-class' | 'skipped-rows' | 'zero-balance';
  message: string;
  row: number | null;
}

export interface TbResult {
  rows: TbRow[];
  totalDebitCents: number;
  totalCreditCents: number;
  issues: ImportIssue[];
}

export function mapTrialBalance(rows: string[][], mapping: TbMapping): TbResult {
  const hasDebitCredit = mapping.debit !== null && mapping.credit !== null;
  if (!hasDebitCredit && mapping.balance === null) {
    return {
      rows: [],
      totalDebitCents: 0,
      totalCreditCents: 0,
      issues: [
        {
          level: 'block',
          code: 'missing-column',
          message: 'Choose an account name column and either debit and credit columns or a balance column.',
          row: null,
        },
      ],
    };
  }
  const issues: ImportIssue[] = [];
  const out: TbRow[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let zero = 0;
  const cell = (r: string[], i: number | null): string => (i === null ? '' : (r[i] ?? ''));

  for (let i = mapping.headerRow + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const n = i + 1;
    const name = cell(r, mapping.name).trim();
    if (name === '' || name.toLowerCase().startsWith('total')) {
      skipped++;
      continue;
    }
    const codeCell = cell(r, mapping.code).trim();
    const code = codeCell === '' ? name : codeCell;

    let net: number | null;
    let badRaw: string | null = null;
    if (hasDebitCredit) {
      const dRaw = cell(r, mapping.debit);
      const cRaw = cell(r, mapping.credit);
      const d = parseLedgerAmount(dRaw);
      const c = parseLedgerAmount(cRaw);
      if (d === null) badRaw = dRaw;
      else if (c === null) badRaw = cRaw;
      net = d === null || c === null ? null : d - c;
    } else {
      const bRaw = cell(r, mapping.balance);
      net = parseLedgerAmount(bRaw);
      if (net === null) badRaw = bRaw;
    }
    if (net === null) {
      issues.push({ level: 'block', code: 'bad-amount', message: `Row ${n}: "${badRaw ?? ''}" is not an amount.`, row: n });
      continue;
    }
    if (net === 0) {
      zero++;
      continue;
    }
    if (seen.has(code)) {
      issues.push({ level: 'block', code: 'duplicate-code', message: `Row ${n}: account code "${code}" appears more than once.`, row: n });
    }
    seen.add(code);
    out.push({
      code,
      name,
      sourceType: cell(r, mapping.type).trim(),
      debitCents: Math.max(net, 0),
      creditCents: Math.max(-net, 0),
      sourceRow: n,
    });
  }

  if (out.length === 0) {
    issues.push({ level: 'block', code: 'no-rows', message: 'No account rows were found under the header row.', row: null });
  }
  const totalDebitCents = out.reduce((s, r) => s + r.debitCents, 0);
  const totalCreditCents = out.reduce((s, r) => s + r.creditCents, 0);
  if (totalDebitCents !== totalCreditCents) {
    issues.push({
      level: 'block',
      code: 'unbalanced',
      message: `Debits (${formatPlain(totalDebitCents)}) do not equal credits (${formatPlain(totalCreditCents)}).`,
      row: null,
    });
  }
  if (skipped > 0) issues.push({ level: 'warn', code: 'skipped-rows', message: `${skipped} rows were skipped (blank or total rows).`, row: null });
  if (zero > 0) issues.push({ level: 'warn', code: 'zero-balance', message: `${zero} accounts have a zero balance and were left out.`, row: null });
  return { rows: out, totalDebitCents, totalCreditCents, issues };
}
