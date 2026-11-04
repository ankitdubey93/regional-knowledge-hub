import { describe, expect, it } from 'vitest';
import {
  allowedTreatments,
  convertCents,
  documentTitle,
  formatFxRate,
  formatInvoiceNumber,
  invoiceTotals,
  lineTaxCents,
  normaliseTaxNumber,
  parseFxMicros,
  previousMonth,
  schemeFor,
  taxLabel,
  taxNumberLabel,
  taxNumberProblem,
  timeLineCents,
  treatmentLabel,
  type TotalsLine,
} from '@chub/shared/utils/invoice';
import {
  XERO_INVOICE_COLUMNS,
  centsToDecimal,
  csvCell,
  invoiceToXeroCsv,
  isoToDmy,
  safeText,
  type XeroCsvInvoice,
} from '@chub/shared/utils/invoiceCsv';

describe('invoice engine', () => {
  it('IE1 timeLineCents', () => {
    expect(timeLineCents(90, 15000)).toBe(22500);
    expect(timeLineCents(20, 10000)).toBe(3333);
    expect(timeLineCents(1, 12500)).toBe(208);
    expect(timeLineCents(7, 15000)).toBe(1750);
    expect(timeLineCents(1, 30)).toBe(1);
    expect(() => timeLineCents(0, 100)).toThrow(RangeError);
    expect(() => timeLineCents(1441, 100)).toThrow(RangeError);
    expect(() => timeLineCents(1.5, 100)).toThrow(RangeError);
    expect(() => timeLineCents(10, -1)).toThrow(RangeError);
    expect(() => timeLineCents(10, 1_000_001)).toThrow(RangeError);
  });

  it('IE2 lineTaxCents', () => {
    expect(lineTaxCents(22500, 'standard', 1000)).toBe(2250);
    expect(lineTaxCents(3333, 'standard', 1000)).toBe(333);
    expect(lineTaxCents(5, 'standard', 1000)).toBe(1);
    expect(lineTaxCents(12345, 'standard', 2000)).toBe(2469);
    expect(lineTaxCents(22500, 'zero', 1000)).toBe(0);
    expect(lineTaxCents(22500, 'outside', 2000)).toBe(0);
  });

  it('IE3 invoiceTotals sums per-line tax', () => {
    const lines: TotalsLine[] = [
      { amountCents: 22500, treatment: 'standard' },
      { amountCents: 3333, treatment: 'standard' },
      { amountCents: 10000, treatment: 'zero' },
    ];
    expect(invoiceTotals(lines, 'au_gst', 1000)).toEqual({
      lineTaxCents: [2250, 333, 0],
      subtotalCents: 35833,
      taxCents: 2583,
      totalCents: 38416,
      noTaxSubtotalCents: 10000,
    });
  });

  it('IE4 rounds each line, then sums', () => {
    const lines: TotalsLine[] = [1, 2, 3].map(() => ({ amountCents: 5, treatment: 'standard' as const }));
    expect(invoiceTotals(lines, 'au_gst', 1000).taxCents).toBe(3);
  });

  it('IE5 scheme none has no tax', () => {
    const t = invoiceTotals([{ amountCents: 22500, treatment: 'standard' }], 'none', 1000);
    expect(t.taxCents).toBe(0);
    expect(t.noTaxSubtotalCents).toBe(22500);
    expect(t.totalCents).toBe(22500);
  });

  it('IE6 invoiceTotals limits', () => {
    const big = (n: number): TotalsLine[] =>
      Array.from({ length: n }, () => ({ amountCents: 100_000_000, treatment: 'outside' as const }));
    expect(invoiceTotals(big(5), 'none', 0).totalCents).toBe(500_000_000);
    expect(() => invoiceTotals(big(6), 'none', 0)).toThrow(RangeError);
    expect(() => invoiceTotals([{ amountCents: -1, treatment: 'standard' }], 'none', 0)).toThrow(RangeError);
    expect(() => invoiceTotals([{ amountCents: 100_000_001, treatment: 'standard' }], 'none', 0)).toThrow(RangeError);
    const zeros: TotalsLine[] = Array.from({ length: 501 }, () => ({ amountCents: 0, treatment: 'standard' as const }));
    expect(() => invoiceTotals(zeros, 'none', 0)).toThrow(RangeError);
    expect(() => invoiceTotals([], 'au_gst', 10001)).toThrow(RangeError);
  });

  it('IE7 convertCents', () => {
    expect(convertCents(2583, 1_950_000)).toBe(5037);
    expect(convertCents(38416, 1_950_000)).toBe(74911);
    expect(convertCents(1, 500_000)).toBe(1);
    expect(() => convertCents(100, 0)).toThrow(RangeError);
    expect(() => convertCents(100, 10_000_001)).toThrow(RangeError);
    expect(() => convertCents(500_000_001, 1_000_000)).toThrow(RangeError);
  });

  it('IE8 labels', () => {
    expect(formatInvoiceNumber(1)).toBe('INV-0001');
    expect(formatInvoiceNumber(12345)).toBe('INV-12345');
    expect(schemeFor('AU', true)).toBe('au_gst');
    expect(schemeFor('UK', true)).toBe('uk_vat');
    expect(schemeFor('AU', false)).toBe('none');
    expect(allowedTreatments('au_gst')).toEqual(['standard', 'zero', 'outside']);
    expect(allowedTreatments('uk_vat')).toEqual(['standard', 'zero', 'exempt', 'outside']);
    expect(allowedTreatments('none')).toEqual(['outside']);
    expect(treatmentLabel('au_gst', 'zero')).toBe('GST-free');
    expect(treatmentLabel('uk_vat', 'outside')).toBe('Outside the scope of VAT');
    expect(treatmentLabel('none', 'standard')).toBe('No tax');
    expect(documentTitle('au_gst')).toBe('Tax invoice');
    expect(documentTitle('uk_vat')).toBe('VAT invoice');
    expect(documentTitle('none')).toBe('Invoice');
    expect(taxLabel('none')).toBeNull();
    expect(taxLabel('au_gst')).toBe('GST');
    expect(taxLabel('uk_vat')).toBe('VAT');
    expect(taxNumberLabel('UK')).toBe('VAT registration number');
    expect(taxNumberLabel('AU')).toBe('ABN');
  });

  it('IE9 tax numbers', () => {
    expect(normaliseTaxNumber(' 12 345 678 901 ')).toBe('12345678901');
    expect(normaliseTaxNumber('gb 123 4567 89')).toBe('GB123456789');
    expect(taxNumberProblem('AU', '12345678901')).toBeNull();
    expect(taxNumberProblem('AU', '1234567890')).toBe('Enter an 11-digit ABN');
    expect(taxNumberProblem('UK', 'GB123456789')).toBeNull();
    expect(taxNumberProblem('UK', '123456789012')).toBeNull();
    expect(taxNumberProblem('UK', 'GB12345')).toBe('Enter a UK VAT number: 9 or 12 digits, with or without GB');
  });

  it('IE10 FX text', () => {
    expect(parseFxMicros('1.95')).toBe(1950000);
    expect(parseFxMicros('0.512345')).toBe(512345);
    expect(parseFxMicros('2')).toBe(2000000);
    expect(parseFxMicros('10')).toBe(10000000);
    expect(parseFxMicros('10.000001')).toBeNull();
    expect(parseFxMicros('1.1234567')).toBeNull();
    expect(parseFxMicros('0')).toBeNull();
    expect(parseFxMicros('-1')).toBeNull();
    expect(parseFxMicros('abc')).toBeNull();
    expect(formatFxRate(1950000)).toBe('1.95');
    expect(formatFxRate(512345)).toBe('0.512345');
    expect(formatFxRate(2000000)).toBe('2');
  });

  it('IE11 previousMonth', () => {
    expect(previousMonth('2026-11-15')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(previousMonth('2026-01-03')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(previousMonth('2024-03-01')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  });
});

describe('xero csv', () => {
  it('XC1 centsToDecimal', () => {
    expect(centsToDecimal(0)).toBe('0.00');
    expect(centsToDecimal(5)).toBe('0.05');
    expect(centsToDecimal(123456)).toBe('1234.56');
    expect(() => centsToDecimal(-1)).toThrow(RangeError);
  });

  it('XC2 cells', () => {
    expect(isoToDmy('2026-11-02')).toBe('02/11/2026');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('plain')).toBe('plain');
    expect(safeText('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(safeText('Bank rec')).toBe('Bank rec');
  });

  it('XC3 one row per line', () => {
    const inv: XeroCsvInvoice = {
      contactName: 'Harbour Co',
      address: '1 George St\nSydney NSW 2000',
      displayNumber: 'INV-0002',
      reference: 'PO 7',
      issuedOn: '2026-11-02',
      dueOn: '2026-11-16',
      currency: 'AUD',
      accountCode: '200',
      jurisdiction: 'AU',
      lines: [
        { description: 'Bank rec', amountCents: 22500, taxCents: 2250, taxTreatment: 'standard' },
        { description: 'ASIC fee, filing', amountCents: 6700, taxCents: 0, taxTreatment: 'outside' },
      ],
    };
    const parts = invoiceToXeroCsv(inv).split('\r\n');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe(XERO_INVOICE_COLUMNS.join(','));
    expect(parts[1]).toBe('Harbour Co,,1 George St,Sydney NSW 2000,,,,,,,INV-0002,PO 7,02/11/2026,16/11/2026,,,Bank rec,1,225.00,,200,GST on Income,22.50,,,,,AUD,');
    expect(parts[2]).toContain(',"ASIC fee, filing",1,67.00,,200,BAS Excluded,0.00,');
  });

  it('XC4 exempt in AU throws', () => {
    const inv: XeroCsvInvoice = {
      contactName: 'Harbour Co',
      address: '',
      displayNumber: 'INV-0003',
      reference: '',
      issuedOn: '2026-11-02',
      dueOn: '2026-11-16',
      currency: 'AUD',
      accountCode: '200',
      jurisdiction: 'AU',
      lines: [{ description: 'Input taxed item', amountCents: 1000, taxCents: 0, taxTreatment: 'exempt' }],
    };
    expect(() => invoiceToXeroCsv(inv)).toThrow('No Xero tax type for exempt in AU');
  });
});
