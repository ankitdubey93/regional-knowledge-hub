// B2 invoices. Integer cents and basis points only; every rounding goes through roundDiv (Hard rule 3).
import { addDays } from './deadlines';
import { applyRate, roundDiv, type Currency } from './money';

export const CURRENCIES = ['AUD', 'GBP'] as const satisfies readonly Currency[];
export type BillingJurisdiction = 'AU' | 'UK';
export const HOME_CURRENCY: Record<BillingJurisdiction, Currency> = { AU: 'AUD', UK: 'GBP' };
export const TAX_SCHEMES = ['au_gst', 'uk_vat', 'none'] as const;
export type TaxScheme = (typeof TAX_SCHEMES)[number];
export const TAX_TREATMENTS = ['standard', 'zero', 'exempt', 'outside'] as const;
export type TaxTreatment = (typeof TAX_TREATMENTS)[number];
export const INVOICE_STATUSES = ['draft', 'issued', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const LINE_KINDS = ['time', 'fixed', 'retainer', 'manual'] as const;
export type LineKind = (typeof LINE_KINDS)[number];
export const PRICING_MODELS = ['hourly', 'fixed', 'retainer'] as const;
export type PricingModel = (typeof PRICING_MODELS)[number];

/** The kb_fact holding each scheme's standard rate. */
export const SCHEME_FACT_KEY: Record<TaxScheme, string | null> = {
  au_gst: 'au.gst.rate',
  uk_vat: 'uk.vat.standardRate',
  none: null,
};
/** When the required invoice content was checked against the official page (engineering/invoice-rules.md). null = not checked. */
export const INVOICE_CONTENT_CHECKED_ON: Record<'au_gst' | 'uk_vat', string | null> = { au_gst: null, uk_vat: null };

export const MAX_LINE_CENTS = 100_000_000;
export const MAX_RATE_CENTS_PER_HOUR = 1_000_000;
export const MAX_INVOICE_TOTAL_CENTS = 500_000_000;
export const MAX_FX_RATE_MICROS = 10_000_000;
export const MAX_LINES_PER_INVOICE = 500;

export function schemeFor(jurisdiction: BillingJurisdiction, taxRegistered: boolean): TaxScheme {
  if (!taxRegistered) return 'none';
  return jurisdiction === 'AU' ? 'au_gst' : 'uk_vat';
}

export function allowedTreatments(scheme: TaxScheme): TaxTreatment[] {
  if (scheme === 'au_gst') return ['standard', 'zero', 'outside'];
  if (scheme === 'uk_vat') return ['standard', 'zero', 'exempt', 'outside'];
  return ['outside'];
}

/** roundDiv(minutes * centsPerHour, 60). */
export function timeLineCents(minutes: number, centsPerHour: number): number {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
    throw new RangeError(`minutes must be an integer 1 to 1440, got ${minutes}`);
  }
  if (!Number.isInteger(centsPerHour) || centsPerHour < 0 || centsPerHour > MAX_RATE_CENTS_PER_HOUR) {
    throw new RangeError(`centsPerHour must be an integer 0 to ${MAX_RATE_CENTS_PER_HOUR}, got ${centsPerHour}`);
  }
  return roundDiv(minutes * centsPerHour, 60);
}

export function lineTaxCents(amountCents: number, treatment: TaxTreatment, rateBp: number): number {
  return treatment === 'standard' ? applyRate(amountCents, rateBp) : 0;
}

export interface TotalsLine {
  amountCents: number;
  treatment: TaxTreatment;
}
export interface InvoiceTotals {
  lineTaxCents: number[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  noTaxSubtotalCents: number;
}

/** Each line's tax is rounded once, then summed (HMRC Notice 700 17.5.1 allows per-line rounding). */
export function invoiceTotals(lines: TotalsLine[], scheme: TaxScheme, rateBp: number): InvoiceTotals {
  if (lines.length > MAX_LINES_PER_INVOICE) {
    throw new RangeError(`An invoice has at most ${MAX_LINES_PER_INVOICE} lines`);
  }
  if (!Number.isInteger(rateBp) || rateBp < 0 || rateBp > 10_000) {
    throw new RangeError(`rateBp must be an integer 0 to 10000, got ${rateBp}`);
  }
  const effectiveRate = scheme === 'none' ? 0 : rateBp;
  const perLine: number[] = [];
  let subtotal = 0;
  let tax = 0;
  let noTax = 0;
  for (const line of lines) {
    const a = line.amountCents;
    if (!Number.isInteger(a) || a < 0 || a > MAX_LINE_CENTS) {
      throw new RangeError(`A line amount must be an integer 0 to ${MAX_LINE_CENTS}, got ${a}`);
    }
    const t = scheme === 'none' ? 0 : lineTaxCents(a, line.treatment, effectiveRate);
    perLine.push(t);
    subtotal += a;
    tax += t;
    if (scheme === 'none' || line.treatment !== 'standard') noTax += a;
  }
  const total = subtotal + tax;
  if (total > MAX_INVOICE_TOTAL_CENTS) {
    throw new RangeError(`An invoice total is at most ${MAX_INVOICE_TOTAL_CENTS} cents, got ${total}`);
  }
  return { lineTaxCents: perLine, subtotalCents: subtotal, taxCents: tax, totalCents: total, noTaxSubtotalCents: noTax };
}

/** Home-currency units per 1 invoice-currency unit, times 1,000,000. */
export function convertCents(amountCents: number, fxRateMicros: number): number {
  if (!Number.isInteger(amountCents) || amountCents < 0 || amountCents > MAX_INVOICE_TOTAL_CENTS) {
    throw new RangeError(`amountCents must be an integer 0 to ${MAX_INVOICE_TOTAL_CENTS}, got ${amountCents}`);
  }
  if (!Number.isInteger(fxRateMicros) || fxRateMicros < 1 || fxRateMicros > MAX_FX_RATE_MICROS) {
    throw new RangeError(`fxRateMicros must be an integer 1 to ${MAX_FX_RATE_MICROS}, got ${fxRateMicros}`);
  }
  return roundDiv(amountCents * fxRateMicros, 1_000_000);
}

export function formatInvoiceNumber(n: number): string {
  return `INV-${String(n).padStart(4, '0')}`;
}

export function treatmentLabel(scheme: TaxScheme, t: TaxTreatment): string {
  if (scheme === 'none') return 'No tax';
  if (scheme === 'au_gst') {
    return { standard: 'GST', zero: 'GST-free', exempt: 'Input taxed', outside: 'Not a taxable supply' }[t];
  }
  return { standard: 'Standard rate', zero: 'Zero rated', exempt: 'Exempt', outside: 'Outside the scope of VAT' }[t];
}

export function taxLabel(scheme: TaxScheme): 'GST' | 'VAT' | null {
  if (scheme === 'au_gst') return 'GST';
  if (scheme === 'uk_vat') return 'VAT';
  return null;
}

export function documentTitle(scheme: TaxScheme): 'Tax invoice' | 'VAT invoice' | 'Invoice' {
  if (scheme === 'au_gst') return 'Tax invoice';
  if (scheme === 'uk_vat') return 'VAT invoice';
  return 'Invoice';
}

export function taxNumberLabel(j: BillingJurisdiction): 'ABN' | 'VAT registration number' {
  return j === 'AU' ? 'ABN' : 'VAT registration number';
}

export function normaliseTaxNumber(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

export function taxNumberProblem(j: BillingJurisdiction, normalised: string): string | null {
  if (j === 'AU') return /^\d{11}$/.test(normalised) ? null : 'Enter an 11-digit ABN';
  return /^(GB)?(\d{9}|\d{12})$/.test(normalised)
    ? null
    : 'Enter a UK VAT number: 9 or 12 digits, with or without GB';
}

export function parseFxMicros(input: string): number | null {
  const m = /^\s*(\d{1,2})(?:\.(\d{1,6}))?\s*$/.exec(input);
  if (!m) return null;
  const micros = Number(m[1]) * 1_000_000 + Number((m[2] ?? '').padEnd(6, '0'));
  if (micros < 1 || micros > MAX_FX_RATE_MICROS) return null;
  return micros;
}

export function formatFxRate(micros: number): string {
  const whole = Math.trunc(micros / 1_000_000);
  const frac = String(micros % 1_000_000).padStart(6, '0').replace(/0+$/, '');
  return frac === '' ? String(whole) : `${whole}.${frac}`;
}

/** First and last day of the calendar month before `today` (yyyy-mm-dd). */
export function previousMonth(today: string): { from: string; to: string } {
  const to = addDays(`${today.slice(0, 7)}-01`, -1);
  return { from: `${to.slice(0, 7)}-01`, to };
}
