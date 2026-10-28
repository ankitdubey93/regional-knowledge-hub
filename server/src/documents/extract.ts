import readXlsxFile from 'read-excel-file/node';
import { parseCsv } from '@chub/shared/utils/csv';
import type { DOCUMENT_KINDS } from '../db/schema';
import { ExtractError, extractFile } from '../kb/extract';

// Untrusted input in, plain text out. Nothing here logs a name, bytes or text (Hard rule 13).
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const MAX_DOCUMENT_TEXT_CHARS = 400_000; // untuned
export const MAX_XLSX_CELLS = 200_000; // untuned
export const MAX_ZIP_UNCOMPRESSED_BYTES = 100 * 1024 * 1024; // untuned

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export class DocumentRejected extends Error {
  constructor(
    readonly status: 415 | 422,
    message: string,
  ) {
    super(message);
  }
}

const EXTENSIONS: Record<string, DocumentKind> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.xlsx': 'xlsx',
  '.csv': 'csv',
  '.txt': 'text',
  '.md': 'markdown',
  '.markdown': 'markdown',
};

/** .pdf pdf; .docx docx; .xlsx xlsx; .csv csv; .txt text; .md/.markdown markdown; anything else null. Case-insensitive. */
export function documentKindOf(name: string): DocumentKind | null {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return null;
  return EXTENSIONS[name.slice(dot).toLowerCase()] ?? null;
}

const MISMATCH = 'The file does not match its extension';

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  return bytes.length >= prefix.length && prefix.every((b, i) => bytes[i] === b);
}

/** Decodes strict UTF-8 text with no NUL bytes, or throws a 415. */
function decodeStrict(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new DocumentRejected(415, MISMATCH);
  }
  if (text.includes('\u0000')) throw new DocumentRejected(415, MISMATCH);
  return text;
}

function checkKindMatchesContent(kind: DocumentKind, bytes: Uint8Array): string | null {
  switch (kind) {
    case 'pdf':
      if (!startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) throw new DocumentRejected(415, MISMATCH);
      return null;
    case 'docx':
    case 'xlsx':
      if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) throw new DocumentRejected(415, MISMATCH);
      return null;
    default:
      return decodeStrict(bytes);
  }
}

/** Sums the uncompressed sizes in the zip central directory without inflating anything. */
function checkZipSize(bytes: Uint8Array): void {
  const unreadable = new DocumentRejected(422, 'The file could not be read');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  const lowest = Math.max(0, bytes.length - 65_557);
  for (let i = bytes.length - 22; i >= lowest; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw unreadable;
  const entries = view.getUint16(eocd + 10, true);
  let pos = view.getUint32(eocd + 16, true);
  let total = 0;
  for (let n = 0; n < entries; n += 1) {
    if (pos + 46 > bytes.length || view.getUint32(pos, true) !== 0x02014b50) throw unreadable;
    total += view.getUint32(pos + 24, true);
    if (total > MAX_ZIP_UNCOMPRESSED_BYTES) throw new DocumentRejected(422, 'The file expands to more than 100 MB');
    pos += 46 + view.getUint16(pos + 28, true) + view.getUint16(pos + 30, true) + view.getUint16(pos + 32, true);
  }
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

async function extractXlsx(bytes: Uint8Array): Promise<{ text: string; truncated: boolean }> {
  let sheets: { sheet: string; data: unknown[][] }[];
  try {
    sheets = await readXlsxFile(Buffer.from(bytes));
  } catch {
    throw new DocumentRejected(422, 'The spreadsheet could not be read');
  }
  const lines: string[] = [];
  let cells = 0;
  let truncated = false;
  outer: for (const sheet of sheets) {
    lines.push(`## Sheet: ${sheet.sheet}`);
    for (const row of sheet.data) {
      const out: string[] = [];
      for (const cell of row) {
        if (cells >= MAX_XLSX_CELLS) {
          truncated = true;
          if (out.length > 0) lines.push(out.join('\t'));
          break outer;
        }
        out.push(cellText(cell));
        cells += 1;
      }
      lines.push(out.join('\t'));
    }
  }
  if (truncated) lines.push(`[Stopped after ${MAX_XLSX_CELLS} cells]`);
  return { text: lines.join('\n'), truncated };
}

export async function extractDocument(
  kind: DocumentKind,
  bytes: Uint8Array,
  name: string,
): Promise<{ text: string; truncated: boolean }> {
  const decoded = checkKindMatchesContent(kind, bytes);
  if (kind === 'docx' || kind === 'xlsx') checkZipSize(bytes);

  let text: string;
  let truncated = false;
  if (kind === 'csv') {
    const rows = parseCsv(decoded ?? '').rows;
    text = [`## ${name}`, ...rows.map((r) => r.join('\t'))].join('\n');
  } else if (kind === 'xlsx') {
    ({ text, truncated } = await extractXlsx(bytes));
  } else {
    try {
      text = await extractFile(kind, bytes);
    } catch (err) {
      if (err instanceof ExtractError) throw new DocumentRejected(422, err.message);
      throw err;
    }
  }

  if (text.trim() === '') throw new DocumentRejected(422, 'No text could be read from this file');
  if (text.length > MAX_DOCUMENT_TEXT_CHARS) {
    text = text.slice(0, MAX_DOCUMENT_TEXT_CHARS);
    truncated = true;
  }
  return { text, truncated };
}
