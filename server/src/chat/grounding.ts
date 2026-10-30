import type { GroundingFlag } from '@chub/shared/lib/chatWire';
import { NOT_IN_SOURCES } from '@chub/shared/lib/chatWire';
import { stripMarkers } from './prompt';

export interface CitedChunk {
  marker: number;
  text: string;
}
export interface GroundingResult {
  status: 'answered' | 'flagged' | 'not_covered';
  flags: GroundingFlag[];
  usedMarkers: number[];
}

export const MIN_UNCITED_BLOCK_CHARS = 60;

/** Distinct marker numbers in order of first appearance; [1, 2] yields 1 and 2. */
export function parseMarkers(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) {
    for (const part of (m[1] ?? '').split(',')) {
      const n = Number(part.trim());
      if (!out.includes(n)) out.push(n);
    }
  }
  return out;
}

/** Distinct normalised numbers in order of first appearance. */
export function extractNumbers(text: string): string[] {
  const cleaned = stripMarkers(text.replace(/\[[A-Z]+_\d+\]/g, ''));
  const out: string[] = [];
  for (const m of cleaned.matchAll(/\d[\d,]*(?:\.\d+)?%?/g)) {
    let token = m[0].replace(/,/g, '');
    const pct = token.endsWith('%');
    const body = pct ? token.slice(0, -1) : token;
    const decimal = body.includes('.');
    let norm = body;
    if (decimal) norm = norm.replace(/0+$/, '').replace(/\.$/, '');
    if (!pct && !decimal && Number(norm) < 10) continue;
    token = pct ? `${norm}%` : norm;
    if (!out.includes(token)) out.push(token);
  }
  return out;
}

const PREVIEW = 60;
const CITED_LEAD_IN = /\[\d+(?:\s*,\s*\d+)*\]:\s*$/;

/** True when every non-empty line is a list item ("- ", "* " or "1. "). */
function isListBlock(block: string): boolean {
  const lines = block.split('\n').filter((l) => l.trim() !== '');
  return lines.length > 0 && lines.every((l) => /^\s*(?:[-*]|\d+\.)\s+/.test(l));
}

/** True when the block names an attached document by file name or label (D1), whole word, case-insensitive. */
function namesDocument(block: string, documentNames: string[]): boolean {
  return documentNames.some((n) => {
    const name = n.trim();
    if (name === '') return false;
    const body = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'iu').test(block);
  });
}

/** documentNames are the attached documents' file names and labels: a block that names one relays that document, which is never cited, so it skips the uncited check (its numbers are still checked). */
export function checkGrounding(
  answer: string,
  sources: CitedChunk[],
  factValues: string[],
  documentTexts: string[] = [],
  documentNames: string[] = [],
): GroundingResult {
  if (answer.trim() === NOT_IN_SOURCES) return { status: 'not_covered', flags: [], usedMarkers: [] };

  const flags: GroundingFlag[] = [];
  const markers = parseMarkers(answer);
  const usedMarkers: number[] = [];
  for (const n of markers) {
    if (sources.some((s) => s.marker === n)) usedMarkers.push(n);
    else flags.push({ code: 'bad_marker', detail: `[${n}]` });
  }

  if (markers.length === 0) {
    flags.push({ code: 'uncited', detail: 'No citations' });
  } else {
    let prev = '';
    for (const block of answer.split(/\n\s*\n/)) {
      const leadIn = prev;
      prev = block;
      if (parseMarkers(block).length > 0) continue;
      // A list right after a lead-in that ends "[n]:" is cited by that lead-in.
      if (CITED_LEAD_IN.test(leadIn) && isListBlock(block)) continue;
      if (namesDocument(block, documentNames)) continue;
      const plain = block
        .replace(/[#*>]|_(?!\d+\])/g, '')
        .replace(/^\s*(?:[-*]|\d+\.)\s+/gm, '')
        .trim();
      if (plain.length >= MIN_UNCITED_BLOCK_CHARS) {
        flags.push({
          code: 'uncited',
          detail: plain.length > PREVIEW ? `${plain.slice(0, PREVIEW)}…` : plain,
        });
      }
    }
  }

  const allowed = new Set<string>([
    ...extractNumbers(sources.filter((s) => usedMarkers.includes(s.marker)).map((s) => s.text).join(' ')),
    ...extractNumbers(factValues.join(' ')),
  ]);
  const fromDocs = new Set<string>(extractNumbers(documentTexts.join(' ')));
  for (const n of extractNumbers(answer)) {
    if (allowed.has(n)) continue;
    flags.push({ code: fromDocs.has(n) ? 'from_document' : 'unsupported_number', detail: n });
  }

  return { status: flags.length > 0 ? 'flagged' : 'answered', flags, usedMarkers };
}
