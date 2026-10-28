/**
 * CSV reader for trial-balance exports: an RFC 4180 subset (comma delimiter,
 * double-quoted fields, "" escapes a quote). Text in, rows out. No React, no
 * storage, no Date, no DOM types: the server imports this file too.
 */

export interface CsvResult { rows: string[][]; issues: string[] }

/** RFC 4180 subset: comma delimiter, double-quoted fields, "" escapes a quote, CRLF or LF line ends, leading UTF-8 BOM removed. */
export function parseCsv(text: string): CsvResult {
  const src = text.startsWith('﻿') ? text.slice(1) : text;
  const rows: string[][] = [];
  const issues: string[] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let rowStarted = false;
  let pendingEmpty = 0;

  const endRow = (): void => {
    row.push(field);
    field = '';
    // Empty lines are kept only when a later row follows them (trailing ones are dropped).
    for (let k = 0; k < pendingEmpty; k++) rows.push(['']);
    pendingEmpty = 0;
    rows.push(row);
    row = [];
    rowStarted = false;
  };

  let i = 0;
  while (i < src.length) {
    const ch = src.charAt(i);
    if (inQuotes) {
      if (ch === '"') {
        if (src.charAt(i + 1) === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '\r' && src.charAt(i + 1) === '\n') {
      i += 1;
      continue;
    }
    if (ch === '\n') {
      if (rowStarted) endRow();
      else pendingEmpty += 1;
      i += 1;
      continue;
    }
    rowStarted = true;
    if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '"' && field === '') {
      inQuotes = true;
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (inQuotes) issues.push('A quoted field is not closed.');
  if (rowStarted) endRow();
  return { rows, issues };
}
