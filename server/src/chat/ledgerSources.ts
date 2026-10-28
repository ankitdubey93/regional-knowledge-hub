import { ACCOUNT_CLASS_LABELS } from '@chub/shared/utils/accountClasses';
import { formatPlain, formatRate } from '@chub/shared/utils/money';
import { balanceSheet, profitAndLoss, variance, type Balance, type ReportAccount, type ReportSection } from '@chub/shared/utils/reports';
import { emptyRedactionMap, redactWith, type RedactionMap } from '../privacy/redact';

export const LEDGER_LINE_CAP = 400;
export const REDACT_SEP = '\n␞\n';
export const LEDGER_TERMS = [
  'revenue', 'income', 'sales', 'turnover', 'profit', 'profits', 'loss', 'losses', 'expense', 'expenses',
  'cost', 'costs', 'spend', 'spent', 'spending', 'earn', 'earned', 'earnings', 'margin', 'gross', 'net',
  'asset', 'assets', 'liability', 'liabilities', 'equity', 'balance sheet', 'cash', 'bank', 'debtors',
  'receivable', 'receivables', 'creditors', 'payable', 'payables', 'owe', 'owed', 'owing', 'wages',
  'salaries', 'rent', 'figures', 'numbers', 'books',
] as const;
export const LEDGER_SOURCE_LABELS = { xero: 'Xero', qbo: 'QuickBooks Online', myob: 'MYOB', other: 'another system' } as const;

export interface LedgerImportRef {
  id: string; asAt: string; periodStart: string;
  currency: 'AUD' | 'GBP'; source: 'xero' | 'qbo' | 'myob' | 'other'; status: 'active' | 'superseded';
}
export interface LedgerSnapshot { import: LedgerImportRef; balances: Balance[]; accounts: ReportAccount[] }
export interface LedgerSource {
  report: 'pnl' | 'bs'; title: string; citation: string; text: string; excerpt: string; sitePath: string;
  importId: string; compareImportId: string | null; asAt: string; jurisdiction: 'AU' | 'UK';
}

const PLACEHOLDER = /\[[A-Z]+_\d+\]/g;
const STOP_WORDS = new Set(['account', 'accounts', 'total', 'other', 'with', 'from', 'into', 'this', 'that', 'general', 'current']);

function hasWord(haystack: string, word: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{N}])${word}(?![\\p{L}\\p{N}])`, 'u').test(haystack);
}

export function isLedgerQuestion(question: string, accountNames: string[]): boolean {
  const q = question.replace(PLACEHOLDER, ' ').toLowerCase();
  for (const term of LEDGER_TERMS) {
    if (hasWord(q, term)) return true;
  }
  for (const name of accountNames) {
    const words = name.replace(PLACEHOLDER, ' ').toLowerCase().split(/[^\p{L}]+/u);
    for (const w of words) {
      if (w.length >= 4 && !STOP_WORDS.has(w) && hasWord(q, w)) return true;
    }
  }
  return false;
}

export function pickComparison(imports: LedgerImportRef[], current: LedgerImportRef): LedgerImportRef | null {
  const candidates = imports.filter(
    (i) => i.status === 'active' && i.currency === current.currency && i.id !== current.id && i.asAt < current.asAt,
  );
  if (candidates.length === 0) return null;
  const [y, mm, dd] = current.asAt.split('-');
  const yearEarlier = `${Number(y) - 1}-${mm}-${dd}`;
  const exact = candidates.find((i) => i.asAt === yearEarlier);
  if (exact) return exact;
  let best: LedgerImportRef | null = null;
  for (const c of candidates) {
    if (best === null || c.asAt > best.asAt) best = c;
  }
  return best;
}

export function ledgerAccountNames(current: LedgerSnapshot, prior: LedgerSnapshot | null): Map<string, string> {
  const byCode = new Map<string, string>();
  for (const a of current.accounts) byCode.set(a.code, a.name);
  if (prior) {
    for (const a of prior.accounts) {
      if (!byCode.has(a.code)) byCode.set(a.code, a.name);
    }
  }
  return new Map([...byCode.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));
}

export function redactQuestionAndNames(
  question: string,
  accountNames: string[],
  names: string[],
  map: RedactionMap = emptyRedactionMap(),
): { question: string; accountNames: string[]; map: RedactionMap } {
  const out = redactWith([question, ...accountNames].join(REDACT_SEP), { names }, map);
  const parts = out.text.split(REDACT_SEP);
  if (parts.length !== accountNames.length + 1) throw new Error('redaction changed the account name count');
  const [q, ...rest] = parts;
  return { question: q ?? '', accountNames: rest, map: out.map };
}

interface Row { code: string; cur: number; pri: number }

function suffix(cur: number, pri: number): string {
  const v = variance(cur, pri);
  const sign = v.changeCents > 0 ? '+' : v.changeCents < 0 ? '-' : '';
  const s = `${sign}${formatPlain(Math.abs(v.changeCents))}`;
  if (v.changeBp === null) return ` (comparison ${formatPlain(pri)}; change ${s})`;
  const r = `${v.changeBp > 0 ? '+' : ''}${formatRate(v.changeBp)}`;
  return ` (comparison ${formatPlain(pri)}; change ${s}, ${r})`;
}

function amount(cur: number, pri: number | null): string {
  return pri === null ? formatPlain(cur) : `${formatPlain(cur)}${suffix(cur, pri)}`;
}

function unionRows(cur: ReportSection, pri: ReportSection | null): Row[] {
  const map = new Map<string, Row>();
  for (const l of cur.lines) map.set(l.code, { code: l.code, cur: l.amountCents, pri: 0 });
  if (pri) {
    for (const l of pri.lines) {
      const r = map.get(l.code);
      if (r) r.pri = l.amountCents;
      else map.set(l.code, { code: l.code, cur: 0, pri: l.amountCents });
    }
  }
  return [...map.values()].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

function sectionLines(
  cur: ReportSection,
  pri: ReportSection | null,
  displayNames: Map<string, string>,
  withTotal: boolean,
  omitLines: boolean,
): string[] {
  const rows = unionRows(cur, pri);
  if (rows.length === 0) return [];
  const label = ACCOUNT_CLASS_LABELS[cur.accountClass];
  const out: string[] = [];
  if (!omitLines) {
    out.push(label);
    for (const r of rows) {
      const name = displayNames.get(r.code);
      if (name === undefined) throw new RangeError(`No display name for ${r.code}`);
      out.push(`${r.code} ${name}: ${amount(r.cur, pri ? r.pri : null)}`);
    }
  }
  if (withTotal) out.push(`Total ${label.toLowerCase()}: ${amount(cur.totalCents, pri ? pri.totalCents : null)}`);
  return out;
}

function countRows(pairs: Array<[ReportSection, ReportSection | null]>): number {
  return pairs.reduce((n, [c, p]) => n + unionRows(c, p).length, 0);
}

const CAP_LINE = `Account lines are left out because this report has more than ${LEDGER_LINE_CAP} accounts; only totals are shown.`;
const REVIEW_PNL = 'Amounts are as imported and have not been reviewed. Costs and expenses are shown as positive amounts.';
const REVIEW_BS = 'Amounts are as imported and have not been reviewed. Liabilities and equity are shown as positive amounts when in credit.';

function labelOf(i: LedgerImportRef): string {
  return LEDGER_SOURCE_LABELS[i.source];
}

function finishSource(
  report: 'pnl' | 'bs',
  lines: string[],
  clientId: string,
  current: LedgerSnapshot,
  prior: LedgerSnapshot | null,
): LedgerSource {
  const label = labelOf(current.import);
  const first = lines[0] ?? '';
  const keep = lines.filter(
    (l, i) =>
      i > 0 &&
      (l.startsWith('Total ') || l.startsWith('Gross profit:') || l.startsWith('Net profit:') || l.startsWith('Net assets:') || l.startsWith('Current year earnings:')),
  );
  return {
    report,
    title: report === 'pnl' ? 'Profit and loss' : 'Balance sheet',
    citation: `Trial balance as at ${current.import.asAt}, imported from ${label}`,
    text: lines.join('\n'),
    excerpt: [first, ...keep].join('\n').slice(0, 600),
    sitePath: `/entities/${clientId}/reports?importId=${current.import.id}${prior ? `&compareId=${prior.import.id}` : ''}&tab=${report}`,
    importId: current.import.id,
    compareImportId: prior ? prior.import.id : null,
    asAt: current.import.asAt,
    jurisdiction: current.import.currency === 'GBP' ? 'UK' : 'AU',
  };
}

export function buildLedgerSources(input: {
  clientId: string; current: LedgerSnapshot; prior: LedgerSnapshot | null; displayNames: Map<string, string>;
}): [LedgerSource, LedgerSource] {
  const { clientId, current, prior, displayNames } = input;
  const cPl = profitAndLoss(current.balances, current.accounts);
  const pPl = prior ? profitAndLoss(prior.balances, prior.accounts) : null;
  const cBs = balanceSheet(current.balances, current.accounts);
  const pBs = prior ? balanceSheet(prior.balances, prior.accounts) : null;
  const ci = current.import;

  // Profit and loss
  type Pair = [ReportSection, ReportSection | null];
  const pRev: Pair = [cPl.revenue, pPl ? pPl.revenue : null];
  const pCos: Pair = [cPl.costOfSales, pPl ? pPl.costOfSales : null];
  const pOth: Pair = [cPl.otherIncome, pPl ? pPl.otherIncome : null];
  const pOpx: Pair = [cPl.operatingExpenses, pPl ? pPl.operatingExpenses : null];
  const pOex: Pair = [cPl.otherExpenses, pPl ? pPl.otherExpenses : null];
  const plPairs: Pair[] = [pRev, pCos, pOth, pOpx, pOex];
  const plCapped = countRows(plPairs) > LEDGER_LINE_CAP;
  const sec = (p: Pair, total: boolean, capped: boolean): string[] =>
    sectionLines(p[0], p[1], displayNames, total, capped);
  const plHead = [`Profit and loss for ${ci.periodStart} to ${ci.asAt}, in ${ci.currency}, from the trial balance imported from ${labelOf(ci)}.`];
  if (prior) plHead.push(`Comparison: ${prior.import.periodStart} to ${prior.import.asAt}, from the trial balance imported from ${labelOf(prior.import)}.`);
  plHead.push(REVIEW_PNL);
  if (plCapped) plHead.push(CAP_LINE);
  const plLines = [
    ...plHead,
    ...sec(pRev, true, plCapped),
    ...sec(pCos, true, plCapped),
    `Gross profit: ${amount(cPl.grossProfitCents, pPl ? pPl.grossProfitCents : null)}`,
    ...sec(pOth, true, plCapped),
    ...sec(pOpx, true, plCapped),
    ...sec(pOex, true, plCapped),
    `Net profit: ${amount(cPl.netProfitCents, pPl ? pPl.netProfitCents : null)}`,
  ];

  // Balance sheet
  const bCa: Pair = [cBs.currentAssets, pBs ? pBs.currentAssets : null];
  const bNca: Pair = [cBs.nonCurrentAssets, pBs ? pBs.nonCurrentAssets : null];
  const bCl: Pair = [cBs.currentLiabilities, pBs ? pBs.currentLiabilities : null];
  const bNcl: Pair = [cBs.nonCurrentLiabilities, pBs ? pBs.nonCurrentLiabilities : null];
  const bEq: Pair = [cBs.equity, pBs ? pBs.equity : null];
  const bsPairs: Pair[] = [bCa, bNca, bCl, bNcl, bEq];
  const bsCapped = countRows(bsPairs) > LEDGER_LINE_CAP;
  const bsHead = [`Balance sheet as at ${ci.asAt}, in ${ci.currency}, from the trial balance imported from ${labelOf(ci)}.`];
  if (prior) bsHead.push(`Comparison: as at ${prior.import.asAt}, from the trial balance imported from ${labelOf(prior.import)}.`);
  bsHead.push(REVIEW_BS);
  if (bsCapped) bsHead.push(CAP_LINE);
  const bsLines = [
    ...bsHead,
    ...sec(bCa, true, bsCapped),
    ...sec(bNca, true, bsCapped),
    `Total assets: ${amount(cBs.totalAssetsCents, pBs ? pBs.totalAssetsCents : null)}`,
    ...sec(bCl, true, bsCapped),
    ...sec(bNcl, true, bsCapped),
    `Total liabilities: ${amount(cBs.totalLiabilitiesCents, pBs ? pBs.totalLiabilitiesCents : null)}`,
    `Net assets: ${amount(cBs.netAssetsCents, pBs ? pBs.netAssetsCents : null)}`,
    ...sec(bEq, false, bsCapped),
    `Current year earnings: ${amount(cBs.currentYearEarningsCents, pBs ? pBs.currentYearEarningsCents : null)}`,
    `Total equity: ${amount(cBs.totalEquityCents, pBs ? pBs.totalEquityCents : null)}`,
    ...cBs.issues,
  ];

  return [finishSource('pnl', plLines, clientId, current, prior), finishSource('bs', bsLines, clientId, current, prior)];
}
