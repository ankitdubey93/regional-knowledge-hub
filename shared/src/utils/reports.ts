/**
 * Reports from trial-balance balances: a profit and loss and a balance sheet,
 * in integer cents. Pure: no React, no storage, no DOM types.
 */
import { ACCOUNT_CLASS_LABELS, typeOfClass, type AccountClass } from './accountClasses';
import { formatPlain, roundDiv } from './money';

export interface Balance { code: string; debitCents: number; creditCents: number }
export interface ReportAccount { code: string; name: string; accountClass: AccountClass }
/** natural sign: income, liabilities and equity are positive when in credit */
export interface ReportLine { code: string; name: string; amountCents: number }
export interface ReportSection { accountClass: AccountClass; title: string; lines: ReportLine[]; totalCents: number }
export interface ProfitAndLoss {
  revenue: ReportSection;
  costOfSales: ReportSection;
  grossProfitCents: number;
  otherIncome: ReportSection;
  operatingExpenses: ReportSection;
  otherExpenses: ReportSection;
  netProfitCents: number;
}
export interface BalanceSheet {
  currentAssets: ReportSection;
  nonCurrentAssets: ReportSection;
  totalAssetsCents: number;
  currentLiabilities: ReportSection;
  nonCurrentLiabilities: ReportSection;
  totalLiabilitiesCents: number;
  netAssetsCents: number;
  equity: ReportSection;
  currentYearEarningsCents: number;
  totalEquityCents: number;
  balances: boolean;
  issues: string[];
}
export interface Variance { changeCents: number; changeBp: number | null }

function buildSections(balances: Balance[], accounts: ReportAccount[]): Map<AccountClass, ReportSection> {
  const byCode = new Map<string, ReportAccount>();
  for (const a of accounts) byCode.set(a.code, a);
  const sections = new Map<AccountClass, ReportSection>();
  const get = (c: AccountClass): ReportSection => {
    let s = sections.get(c);
    if (!s) {
      s = { accountClass: c, title: ACCOUNT_CLASS_LABELS[c], lines: [], totalCents: 0 };
      sections.set(c, s);
    }
    return s;
  };
  for (const b of balances) {
    const acct = byCode.get(b.code);
    if (!acct) throw new RangeError(`No account for code ${b.code}`);
    const net = b.debitCents - b.creditCents;
    const t = typeOfClass(acct.accountClass);
    const amountCents = t === 'asset' || t === 'expense' ? net : -net;
    get(acct.accountClass).lines.push({ code: acct.code, name: acct.name, amountCents });
  }
  return sections;
}

function finish(sections: Map<AccountClass, ReportSection>, c: AccountClass): ReportSection {
  const s = sections.get(c) ?? { accountClass: c, title: ACCOUNT_CLASS_LABELS[c], lines: [], totalCents: 0 };
  s.lines.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  s.totalCents = s.lines.reduce((sum, l) => sum + l.amountCents, 0);
  return s;
}

export function profitAndLoss(balances: Balance[], accounts: ReportAccount[]): ProfitAndLoss {
  const sections = buildSections(balances, accounts);
  const revenue = finish(sections, 'revenue');
  const costOfSales = finish(sections, 'cost_of_sales');
  const otherIncome = finish(sections, 'other_income');
  const operatingExpenses = finish(sections, 'operating_expense');
  const otherExpenses = finish(sections, 'other_expense');
  const grossProfitCents = revenue.totalCents - costOfSales.totalCents;
  const netProfitCents = grossProfitCents + otherIncome.totalCents - operatingExpenses.totalCents - otherExpenses.totalCents;
  return { revenue, costOfSales, grossProfitCents, otherIncome, operatingExpenses, otherExpenses, netProfitCents };
}

export function balanceSheet(balances: Balance[], accounts: ReportAccount[]): BalanceSheet {
  const sections = buildSections(balances, accounts);
  const currentAssets = finish(sections, 'current_asset');
  const nonCurrentAssets = finish(sections, 'non_current_asset');
  const currentLiabilities = finish(sections, 'current_liability');
  const nonCurrentLiabilities = finish(sections, 'non_current_liability');
  const equity = finish(sections, 'equity');
  const totalAssetsCents = currentAssets.totalCents + nonCurrentAssets.totalCents;
  const totalLiabilitiesCents = currentLiabilities.totalCents + nonCurrentLiabilities.totalCents;
  const netAssetsCents = totalAssetsCents - totalLiabilitiesCents;
  const currentYearEarningsCents = profitAndLoss(balances, accounts).netProfitCents;
  const totalEquityCents = equity.totalCents + currentYearEarningsCents;
  const balances_ = netAssetsCents === totalEquityCents;
  return {
    currentAssets,
    nonCurrentAssets,
    totalAssetsCents,
    currentLiabilities,
    nonCurrentLiabilities,
    totalLiabilitiesCents,
    netAssetsCents,
    equity,
    currentYearEarningsCents,
    totalEquityCents,
    balances: balances_,
    issues: balances_
      ? []
      : [`The balance sheet does not balance: net assets and equity differ by ${formatPlain(Math.abs(netAssetsCents - totalEquityCents))}.`],
  };
}

export function variance(currentCents: number, priorCents: number): Variance {
  return {
    changeCents: currentCents - priorCents,
    changeBp: priorCents === 0 ? null : roundDiv((currentCents - priorCents) * 10_000, Math.abs(priorCents)),
  };
}

export function movementBetween(later: Balance[], earlier: Balance[]): Balance[] {
  const net = new Map<string, number>();
  for (const b of later) net.set(b.code, (net.get(b.code) ?? 0) + b.debitCents - b.creditCents);
  for (const b of earlier) net.set(b.code, (net.get(b.code) ?? 0) - b.debitCents + b.creditCents);
  const out: Balance[] = [];
  for (const [code, n] of net) {
    if (n === 0) continue;
    out.push({ code, debitCents: Math.max(n, 0), creditCents: Math.max(-n, 0) });
  }
  return out.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}
