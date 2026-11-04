// B2. Xero sales-invoice import CSV. Column names and tax types are NOT checked against a real Xero import until
// XERO_CSV_CHECKED_ON is set (owner's release check). Tax type names must equal client/src/data/tax-codes.json (data.test.ts checks).
import type { Currency } from './money';
import type { BillingJurisdiction, TaxTreatment } from './invoice';

export const XERO_CSV_CHECKED_ON: string | null = null;
export const XERO_INVOICE_COLUMNS = [
  '*ContactName', 'EmailAddress', 'POAddressLine1', 'POAddressLine2', 'POAddressLine3', 'POAddressLine4',
  'POCity', 'PORegion', 'POPostalCode', 'POCountry', '*InvoiceNumber', 'Reference', '*InvoiceDate', '*DueDate',
  'Total', 'InventoryItemCode', '*Description', '*Quantity', '*UnitAmount', 'Discount', '*AccountCode', '*TaxType',
  'TaxAmount', 'TrackingName1', 'TrackingOption1', 'TrackingName2', 'TrackingOption2', 'Currency', 'BrandingTheme',
] as const;
export const XERO_TAX_TYPES: Record<BillingJurisdiction, Record<TaxTreatment, string | null>> = {
  AU: { standard: 'GST on Income', zero: 'GST Free Income', exempt: null, outside: 'BAS Excluded' },
  UK: { standard: '20% (VAT on Income)', zero: 'Zero Rated Income', exempt: 'Exempt Income', outside: 'No VAT' },
};
export interface XeroCsvLine { description: string; amountCents: number; taxCents: number; taxTreatment: TaxTreatment }
export interface XeroCsvInvoice {
  contactName: string; address: string; displayNumber: string; reference: string;
  issuedOn: string; dueOn: string; currency: Currency; accountCode: string; jurisdiction: BillingJurisdiction; lines: XeroCsvLine[];
}

/** Non-negative integer cents to a decimal string with two places, using integer maths only. */
export function centsToDecimal(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new RangeError(`cents must be a non-negative integer, got ${cents}`);
  }
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

/** '2026-11-02' to '02/11/2026'. */
export function isoToDmy(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Wrap in double quotes (doubling inner quotes) when the value holds a delimiter, a quote, a line break or edge spaces. */
export function csvCell(value: string): string {
  if (/[,"\r\n]/.test(value) || value.startsWith(' ') || value.endsWith(' ')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Prefix a single quote when a spreadsheet would read the value as a formula (= + - @ tab or CR). */
export function safeText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function invoiceToXeroCsv(inv: XeroCsvInvoice): string {
  const taxType = (t: TaxTreatment): string => {
    const name = XERO_TAX_TYPES[inv.jurisdiction][t];
    if (name === null) throw new Error(`No Xero tax type for ${t} in ${inv.jurisdiction}`);
    return name;
  };
  const addressLines = inv.address
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
    .slice(0, 4);
  const address = [0, 1, 2, 3].map((i) => (addressLines[i] !== undefined ? safeText(addressLines[i]) : ''));
  const rows = inv.lines.map((line) => {
    const cells = [
      safeText(inv.contactName),
      '',
      ...address,
      '', '', '', '',
      inv.displayNumber,
      safeText(inv.reference),
      isoToDmy(inv.issuedOn),
      isoToDmy(inv.dueOn),
      '',
      '',
      safeText(line.description),
      '1',
      centsToDecimal(line.amountCents),
      '',
      inv.accountCode,
      taxType(line.taxTreatment),
      centsToDecimal(line.taxCents),
      '', '', '', '',
      inv.currency,
      '',
    ];
    return cells.map(csvCell).join(',');
  });
  const header = XERO_INVOICE_COLUMNS.join(',');
  return [header, ...rows].map((r) => `${r}\r\n`).join('');
}
