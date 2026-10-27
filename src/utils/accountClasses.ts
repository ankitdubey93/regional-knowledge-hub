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
 * Lower-case export labels → class. Not checked against a live Xero, QBO or MYOB export.
 * Hard rule 2: until that check is done, ACCOUNT_LABELS_VERIFIED_ON stays null.
 */
export const ACCOUNT_LABEL_CLASSES: Readonly<Record<string, AccountClass>> = {
  bank: 'current_asset',
  'current asset': 'current_asset',
  'current assets': 'current_asset',
  inventory: 'current_asset',
  prepayment: 'current_asset',
  'accounts receivable (a/r)': 'current_asset',
  'other current assets': 'current_asset',
  'fixed asset': 'non_current_asset',
  'fixed assets': 'non_current_asset',
  'non-current asset': 'non_current_asset',
  'other assets': 'non_current_asset',
  'current liability': 'current_liability',
  'current liabilities': 'current_liability',
  'accounts payable (a/p)': 'current_liability',
  'credit card': 'current_liability',
  'other current liabilities': 'current_liability',
  'non-current liability': 'non_current_liability',
  'long term liabilities': 'non_current_liability',
  equity: 'equity',
  revenue: 'revenue',
  sales: 'revenue',
  income: 'revenue',
  'other income': 'other_income',
  'direct costs': 'cost_of_sales',
  'cost of goods sold': 'cost_of_sales',
  'cost of sales': 'cost_of_sales',
  expense: 'operating_expense',
  expenses: 'operating_expense',
  overhead: 'operating_expense',
  overheads: 'operating_expense',
  depreciation: 'operating_expense',
  'other expense': 'other_expense',
};

/** null while the labels above are unchecked. Set to a date (YYYY-MM-DD) only after a real export check. */
export const ACCOUNT_LABELS_VERIFIED_ON: string | null = null;

/** Trim and lower-case the label, then look it up. Unknown or ambiguous labels give null. */
export function suggestClass(sourceType: string): AccountClass | null {
  const key = sourceType.trim().toLowerCase();
  return Object.hasOwn(ACCOUNT_LABEL_CLASSES, key) ? (ACCOUNT_LABEL_CLASSES[key] ?? null) : null;
}
