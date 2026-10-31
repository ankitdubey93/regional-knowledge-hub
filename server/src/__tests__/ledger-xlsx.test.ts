import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '@chub/shared/utils/csv';
import { mapTrialBalance, suggestMapping } from '@chub/shared/utils/ledgerImport';
import { XERO_AU_DEMO_TB_CSV, XERO_UK_DEMO_TB_CSV } from '@chub/shared/fixtures/tb';
import { DocumentRejected } from '../documents/extract';
import { cellToLedgerText, rowsToCsv, xlsxToCsv } from '../ledger/xlsx';

function importCsv(text: string) {
  const { rows } = parseCsv(text);
  const mapping = suggestMapping(rows);
  if (!mapping) throw new Error('no mapping');
  return mapTrialBalance(rows, mapping);
}

function shape(text: string) {
  const r = importCsv(text);
  return {
    rows: r.rows.map((x) => ({ code: x.code, name: x.name, sourceType: x.sourceType, debitCents: x.debitCents, creditCents: x.creditCents })),
    totals: [r.totalDebitCents, r.totalCreditCents],
  };
}

async function compare(file: string, csv: string, totals: number[]) {
  const bytes = readFileSync(new URL(`./fixtures/${file}`, import.meta.url));
  const out = await xlsxToCsv(new Uint8Array(bytes));
  const a = shape(out.csvText);
  const b = shape(csv);
  expect(a.rows).toEqual(b.rows);
  expect(a.totals).toEqual(totals);
  expect(b.totals).toEqual(totals);
}

describe('xlsx trial balance', () => {
  it('XL1 cellToLedgerText formats each kind', () => {
    expect(cellToLedgerText(null)).toBe('');
    expect(cellToLedgerText('Sales')).toBe('Sales');
    expect(cellToLedgerText(4200)).toBe('4200');
    expect(cellToLedgerText(8703.2)).toBe('8703.20');
    expect(cellToLedgerText(-12.5)).toBe('-12.50');
    expect(cellToLedgerText(0.1 + 0.2)).toBe('0.30');
    expect(cellToLedgerText(1.005)).toBe('1.005');
    expect(cellToLedgerText(12.345)).toBe('12.345');
    expect(cellToLedgerText(new Date(Date.UTC(2026, 5, 30)))).toBe('2026-06-30');
    expect(cellToLedgerText(true)).toBe('TRUE');
  });

  it('XL2 rowsToCsv quotes and round-trips through parseCsv', () => {
    const rows = [['445', 'Light, Power, Heating', 'Say "hi"'], ['', 'a\nb', '1']];
    expect(parseCsv(rowsToCsv(rows)).rows).toEqual(rows);
  });

  it("XL3 the real Xero AU workbook imports to the same rows as Xero's CSV", async () => {
    await compare('xero-au-tb.xlsx', XERO_AU_DEMO_TB_CSV, [1290320, 1290320]);
  });

  it("XL4 the real Xero UK workbook imports to the same rows as Xero's CSV", async () => {
    await compare('xero-uk-tb.xlsx', XERO_UK_DEMO_TB_CSV, [1431184, 1431184]);
  });

  it('XL5 a file that is not a zip is refused with 415', async () => {
    const err: unknown = await xlsxToCsv(new TextEncoder().encode('Account,Debit')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DocumentRejected);
    expect((err as DocumentRejected).status).toBe(415);
    expect((err as DocumentRejected).message).toBe('Choose an Excel workbook (.xlsx).');
  });

  it('XL6 a zip that is not a workbook is refused with 422', async () => {
    const bytes = new Uint8Array(64);
    bytes.set([0x50, 0x4b, 0x03, 0x04]);
    const err: unknown = await xlsxToCsv(bytes).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DocumentRejected);
    expect((err as DocumentRejected).status).toBe(422);
  });

  it('XL7 the result names the sheet', async () => {
    const out = await xlsxToCsv(new Uint8Array(readFileSync(new URL('./fixtures/xero-au-tb.xlsx', import.meta.url))));
    expect(out.sheet.length).toBeGreaterThan(0);
    expect(out.sheetCount).toBeGreaterThanOrEqual(1);
  });
});
