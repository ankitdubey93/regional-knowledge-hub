import readXlsxFile from 'read-excel-file/node';
import { DocumentRejected, MAX_XLSX_CELLS, checkZipSize } from '../documents/extract';

/** One cell as the text a trial-balance CSV would hold. */
export function cellToLedgerText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return String(v);
    // The one float step: a spreadsheet stores amounts as doubles. Cents are recovered here, before the integer-cent engine sees them (Hard rule 3).
    const c = Math.round(v * 100);
    if (Math.abs(v * 100 - c) < 1e-6) {
      const abs = Math.abs(c);
      const frac = String(abs % 100).padStart(2, '0');
      return `${c < 0 ? '-' : ''}${Math.floor(abs / 100)}.${frac}`;
    }
    return String(v);
  }
  return String(v);
}

/** Rows to CSV: fields joined by commas, a field quoted when it holds a comma, a double quote, CR or LF, quotes doubled; rows joined by \n. */
export function rowsToCsv(rows: string[][]): string {
  const field = (s: string): string => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return rows.map((r) => r.map(field).join(',')).join('\n');
}

export interface XlsxCsv {
  csvText: string;
  sheet: string;
  sheetCount: number;
}

/** The first sheet as CSV text. Throws DocumentRejected. */
export async function xlsxToCsv(bytes: Uint8Array): Promise<XlsxCsv> {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    throw new DocumentRejected(415, 'Choose an Excel workbook (.xlsx).');
  }
  checkZipSize(bytes);
  let sheets: { sheet: string; data: unknown[][] }[];
  try {
    sheets = await readXlsxFile(Buffer.from(bytes));
  } catch {
    throw new DocumentRejected(422, 'The spreadsheet could not be read');
  }
  const first = sheets[0];
  if (!first) throw new DocumentRejected(422, 'The workbook has no sheets');
  const cells = first.data.reduce((n, r) => n + r.length, 0);
  if (cells > MAX_XLSX_CELLS) throw new DocumentRejected(422, 'The sheet has too many cells to be a trial balance');
  if (first.data.length === 0) throw new DocumentRejected(422, 'The first sheet is empty');
  return {
    csvText: rowsToCsv(first.data.map((r) => r.map(cellToLedgerText))),
    sheet: first.sheet,
    sheetCount: sheets.length,
  };
}
