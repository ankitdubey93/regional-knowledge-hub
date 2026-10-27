import type { GroundingFlag } from '../../../src/lib/chatWire';
import { NOT_IN_SOURCES } from '../../../src/lib/chatWire';
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

export function checkGrounding(answer: string, sources: CitedChunk[], factValues: string[]): GroundingResult {
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
    for (const block of answer.split(/\n\s*\n/)) {
      if (parseMarkers(block).length > 0) continue;
      const plain = block
        .replace(/[#*_>]/g, '')
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
  for (const n of extractNumbers(answer)) {
    if (!allowed.has(n)) flags.push({ code: 'unsupported_number', detail: n });
  }

  return { status: flags.length > 0 ? 'flagged' : 'answered', flags, usedMarkers };
}
