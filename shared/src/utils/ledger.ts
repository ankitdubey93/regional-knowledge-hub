export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface JournalLine {
  account: string; // account code
  debitCents: number;
  creditCents: number;
}

export interface EntryCheck {
  balanced: boolean;
  totalDebitCents: number;
  totalCreditCents: number;
  problems: string[];
}

/** The basic rules of a valid journal: two or more lines, one side each, debits = credits. */
export function checkEntry(lines: JournalLine[]): EntryCheck {
  const problems: string[] = [];
  let dr = 0;
  let cr = 0;
  const used = lines.filter((l) => l.account !== '' || l.debitCents !== 0 || l.creditCents !== 0);
  if (used.length < 2) problems.push('A journal needs at least two lines.');
  used.forEach((l, i) => {
    if (l.account === '') problems.push(`Line ${i + 1} has no account.`);
    if (l.debitCents < 0 || l.creditCents < 0) problems.push(`Line ${i + 1} has a negative amount. Use the other column instead.`);
    if (l.debitCents > 0 && l.creditCents > 0) problems.push(`Line ${i + 1} has both a debit and a credit.`);
    if (l.debitCents === 0 && l.creditCents === 0) problems.push(`Line ${i + 1} has no amount.`);
    dr += l.debitCents;
    cr += l.creditCents;
  });
  if (dr !== cr) problems.push(`Debits (${(dr / 100).toFixed(2)}) do not equal credits (${(cr / 100).toFixed(2)}).`);
  return { balanced: dr === cr && dr > 0, totalDebitCents: dr, totalCreditCents: cr, problems };
}

/** Net each account to one signed amount: debit positive, credit negative. */
function netByAccount(lines: JournalLine[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lines) {
    if (l.account === '') continue;
    m.set(l.account, (m.get(l.account) ?? 0) + l.debitCents - l.creditCents);
  }
  return m;
}

export type LineFeedback =
  | { account: string; kind: 'correct' }
  | { account: string; kind: 'wrong-side'; expectedCents: number }
  | { account: string; kind: 'wrong-amount'; expectedCents: number; gotCents: number }
  | { account: string; kind: 'missing'; expectedCents: number }
  | { account: string; kind: 'extra'; gotCents: number };

/**
 * Compare a learner's journal with the answer, account by account. Lines on
 * the same account are netted first, so splitting one debit into two lines is
 * still right. Signed amounts: debit positive, credit negative.
 */
export function compareEntries(got: JournalLine[], expected: JournalLine[]): { correct: boolean; feedback: LineFeedback[] } {
  const g = netByAccount(got);
  const e = netByAccount(expected);
  const feedback: LineFeedback[] = [];
  for (const [account, exp] of e) {
    const have = g.get(account);
    if (have === undefined || have === 0) feedback.push({ account, kind: 'missing', expectedCents: exp });
    else if (have === exp) feedback.push({ account, kind: 'correct' });
    else if (have === -exp) feedback.push({ account, kind: 'wrong-side', expectedCents: exp });
    else feedback.push({ account, kind: 'wrong-amount', expectedCents: exp, gotCents: have });
  }
  for (const [account, have] of g) {
    if (!e.has(account) && have !== 0) feedback.push({ account, kind: 'extra', gotCents: have });
  }
  return { correct: feedback.every((f) => f.kind === 'correct'), feedback };
}

export interface TAccountView {
  account: string;
  debits: number[];
  credits: number[];
  balanceCents: number; // signed: debit positive
}

export function tAccounts(entries: JournalLine[][]): TAccountView[] {
  const m = new Map<string, TAccountView>();
  for (const entry of entries) {
    for (const l of entry) {
      if (l.account === '') continue;
      const t = m.get(l.account) ?? { account: l.account, debits: [], credits: [], balanceCents: 0 };
      if (l.debitCents > 0) t.debits.push(l.debitCents);
      if (l.creditCents > 0) t.credits.push(l.creditCents);
      t.balanceCents += l.debitCents - l.creditCents;
      m.set(l.account, t);
    }
  }
  return [...m.values()];
}

/** Which side increases an account of this type. */
export function normalSide(type: AccountType): 'debit' | 'credit' {
  return type === 'asset' || type === 'expense' ? 'debit' : 'credit';
}

/** A trial balance: each account's balance on its debit or credit side. */
export function trialBalance(entries: JournalLine[][]): { rows: { account: string; debitCents: number; creditCents: number }[]; totalDebitCents: number; totalCreditCents: number } {
  const rows = tAccounts(entries)
    .filter((t) => t.balanceCents !== 0)
    .map((t) => ({
      account: t.account,
      debitCents: t.balanceCents > 0 ? t.balanceCents : 0,
      creditCents: t.balanceCents < 0 ? -t.balanceCents : 0,
    }));
  return {
    rows,
    totalDebitCents: rows.reduce((a, r) => a + r.debitCents, 0),
    totalCreditCents: rows.reduce((a, r) => a + r.creditCents, 0),
  };
}
