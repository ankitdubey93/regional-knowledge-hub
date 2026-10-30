/**
 * Account classes for the ledger: the kind of account a trial-balance line is
 * (current asset, cost of sales, ...), and the label each export uses for it.
 * Pure data and lookups. No React, no storage, no DOM types.
 */
import type { AccountType } from './ledger';

export const ACCOUNT_CLASSES = [
  'current_asset',
  'non_current_asset',
  'current_liability',
  'non_current_liability',
  'equity',
  'revenue',
  'other_income',
  'cost_of_sales',
  'operating_expense',
  'other_expense',
] as const;

export type AccountClass = (typeof ACCOUNT_CLASSES)[number];

export const ACCOUNT_CLASS_LABELS: Record<AccountClass, string> = {
  current_asset: 'Current asset',
  non_current_asset: 'Non-current asset',
  current_liability: 'Current liability',
  non_current_liability: 'Non-current liability',
  equity: 'Equity',
  revenue: 'Revenue',
  other_income: 'Other income',
  cost_of_sales: 'Cost of sales',
  operating_expense: 'Operating expense',
  other_expense: 'Other expense',
};

/** The accounting type (asset, liability, ...) that each class belongs to. */
export function typeOfClass(c: AccountClass): AccountType {
  switch (c) {
    case 'current_asset':
    case 'non_current_asset':
      return 'asset';
    case 'current_liability':
    case 'non_current_liability':
      return 'liability';
    case 'equity':
      return 'equity';
    case 'revenue':
    case 'other_income':
      return 'revenue';
    case 'cost_of_sales':
    case 'operating_expense':
    case 'other_expense':
      return 'expense';
  }
}

/**
 * Lower-case Xero labels → class. Every label here was seen in a real Xero export on 2026-10-31: the
 * Account Type column of the AU and UK demo companies' Trial Balance reports, or the Type column of
 * their chart of accounts exports. Where a chart type (Accounts Receivable, GST, Historical) is a system
 * account, its class is the one Xero's own trial balance shows for it. Rounding, Tracking and the three
 * currency revaluation types were seen too but are left out: neither export shows their class, so the
 * wizard asks.
 */
export const XERO_LABEL_CLASSES: Readonly<Record<string, AccountClass>> = {
  bank: 'current_asset',
  'current asset': 'current_asset',
  'accounts receivable': 'current_asset',
  inventory: 'current_asset',
  'fixed asset': 'non_current_asset',
  'current liability': 'current_liability',
  'accounts payable': 'current_liability',
  'unpaid expense claims': 'current_liability',
  'wages payable': 'current_liability',
  gst: 'current_liability',
  vat: 'current_liability',
  historical: 'current_liability',
  'non-current liability': 'non_current_liability',
  equity: 'equity',
  'retained earnings': 'equity',
  revenue: 'revenue',
  'other income': 'other_income',
  'direct costs': 'cost_of_sales',
  expense: 'operating_expense',
  overhead: 'operating_expense',
  depreciation: 'operating_expense',
};

/**
 * Lower-case labels from other software (QuickBooks Online, MYOB) and Xero types not seen in the demo
 * exports (Prepayment, Non-current Asset, Sales). Not checked against a real export (Hard rule 2).
 */
export const OTHER_LABEL_CLASSES: Readonly<Record<string, AccountClass>> = {
  'current assets': 'current_asset',
  prepayment: 'current_asset',
  'accounts receivable (a/r)': 'current_asset',
  'other current assets': 'current_asset',
  'fixed assets': 'non_current_asset',
  'non-current asset': 'non_current_asset',
  'other assets': 'non_current_asset',
  'current liabilities': 'current_liability',
  'accounts payable (a/p)': 'current_liability',
  'credit card': 'current_liability',
  'other current liabilities': 'current_liability',
  'long term liabilities': 'non_current_liability',
  sales: 'revenue',
  income: 'revenue',
  'cost of goods sold': 'cost_of_sales',
  'cost of sales': 'cost_of_sales',
  expenses: 'operating_expense',
  overheads: 'operating_expense',
  'other expense': 'other_expense',
};

/** The day each source's labels were checked against a real export; null when not checked. */
export const ACCOUNT_LABELS_CHECKED_ON: Readonly<Record<'xero' | 'qbo' | 'myob' | 'other', string | null>> = {
  xero: '2026-10-31',
  qbo: null,
  myob: null,
  other: null,
};

/** Trim and lower-case the label, then look it up. Unknown or ambiguous labels give null. */
export function suggestClass(sourceType: string): AccountClass | null {
  const key = sourceType.trim().toLowerCase();
  if (Object.hasOwn(XERO_LABEL_CLASSES, key)) return XERO_LABEL_CLASSES[key] ?? null;
  return Object.hasOwn(OTHER_LABEL_CLASSES, key) ? (OTHER_LABEL_CLASSES[key] ?? null) : null;
}
