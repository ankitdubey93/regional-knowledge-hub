import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DocumentRejected,
  MAX_DOCUMENT_TEXT_CHARS,
  documentKindOf,
  extractDocument,
} from '../documents/extract';

const fixture = (name: string): Uint8Array => new Uint8Array(readFileSync(join(__dirname, 'fixtures', 'documents', name)));

async function rejection(p: Promise<unknown>): Promise<DocumentRejected> {
  try {
    await p;
  } catch (err) {
    if (err instanceof DocumentRejected) return err;
    throw err;
  }
  throw new Error('expected a DocumentRejected');
}

/** A zip with no entries data, only a central directory entry that claims `claimed` uncompressed bytes. */
function zipClaiming(claimed: number): Uint8Array {
  const local = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt32LE(claimed, 24);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length, 16);
  return new Uint8Array(Buffer.concat([local, central, eocd]));
}

describe('documents extract', () => {
  it('DX1 txt', async () => {
    const r = await extractDocument('text', fixture('sample.txt'), 'sample.txt');
    expect(r.text).toContain('Notes for the client.');
  });

  it('DX2 csv renders tab-separated lines', async () => {
    const r = await extractDocument('csv', fixture('sample.csv'), 'sample.csv');
    expect(r.text).toContain('Sales\t1234.50');
  });

  it('DX3 xlsx reads both sheets in order', async () => {
    const { text } = await extractDocument('xlsx', fixture('two-sheets.xlsx'), 'two-sheets.xlsx');
    expect(text.indexOf('## Sheet: Income')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('## Sheet: Income')).toBeLessThan(text.indexOf('## Sheet: Notes'));
    expect(text).toContain('Sales\t1234.5');
    expect(text).toContain('owner@example.com');
  });

  it('DX4 docx', async () => {
    const r = await extractDocument('docx', fixture('sample.docx'), 'sample.docx');
    expect(r.text).toContain('Engagement letter for Acme Pty Ltd');
  });

  it('DX5 pdf', async () => {
    const r = await extractDocument('pdf', fixture('sample.pdf'), 'sample.pdf');
    expect(r.text).toContain('980.00');
  });

  it('DX6 a .pdf that is text is rejected 415', async () => {
    const err = await rejection(extractDocument('pdf', fixture('sample.txt'), 'x.pdf'));
    expect(err.status).toBe(415);
  });

  it('DX7 a .csv with invalid UTF-8 is rejected 415', async () => {
    const err = await rejection(extractDocument('csv', new Uint8Array([0xff, 0xfe, 0x00]), 'x.csv'));
    expect(err.status).toBe(415);
  });

  it('DX8 a zip whose central directory claims 200 MB is rejected 422', async () => {
    const err = await rejection(extractDocument('xlsx', zipClaiming(200 * 1024 * 1024), 'x.xlsx'));
    expect(err.status).toBe(422);
    expect(err.message).toBe('The file expands to more than 100 MB');
  });

  it('DX9 text over MAX_DOCUMENT_TEXT_CHARS is truncated', async () => {
    const big = new TextEncoder().encode('a'.repeat(MAX_DOCUMENT_TEXT_CHARS + 50));
    const r = await extractDocument('text', big, 'big.txt');
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBe(MAX_DOCUMENT_TEXT_CHARS);
  });

  it('DX10 documentKindOf', () => {
    expect(documentKindOf('a.XLSX')).toBe('xlsx');
    expect(documentKindOf('a.html')).toBeNull();
    expect(documentKindOf('a.markdown')).toBe('markdown');
  });
});
