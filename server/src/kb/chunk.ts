export const CHUNK_TARGET_TOKENS = 600;
export const CHUNK_SINGLE_MAX_TOKENS = 700;
export const OVERLAP_MAX_TOKENS = 120;
export const SPLIT_PARAGRAPH_TOKENS = 1000;
export const LONG_CHUNK_TOKENS = 1500;

export interface RawChunk {
  ordinal: number;
  headingPath: string[];
  provisionRef: string | null;
  text: string;
  tokens: number;
}
export interface Heading {
  level: number;
  title: string;
  ref: string | null;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const MONTHS = /^\d+\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b/;
const STRUCTURAL = /^(Chapter|Part|Division|Subdivision|Schedule)\s+(\d+[A-Z]*(?:[-.]\d+[A-Z]*)*)\b/;
const PROVISION_WORD = /^(Section|Regulation|Rule|Article)\s+(\d+[A-Z]*(?:-\d+[A-Z]*)?)\b/;
const AU_SECTION = /^(\d+-\d+[A-Z]*)\s+([A-Z].{2,})$/;
const NUMBERED = /^(\d+[A-Z]{0,2})\s+([A-Z][^.;:]{2,})$/;
const STRUCTURAL_LEVEL: Record<string, number> = { Chapter: 1, Part: 2, Schedule: 2, Division: 3, Subdivision: 4 };
const WORD_REF: Record<string, string> = { Section: 's', Regulation: 'reg', Rule: 'r', Article: 'art' };

function refOf(title: string): string | null {
  const t = title.trim();
  const w = PROVISION_WORD.exec(t);
  if (w) return `${WORD_REF[g(w, 1)] ?? ''} ${g(w, 2)}`;
  const a = AU_SECTION.exec(t);
  if (a) return `s ${g(a, 1)}`;
  const n = NUMBERED.exec(t);
  if (n) return `s ${g(n, 1)}`;
  const s = STRUCTURAL.exec(t);
  if (s && g(s, 1) === 'Schedule') return `sch ${g(s, 2)}`;
  return null;
}

const g = (m: RegExpExecArray, i: number): string => m[i] ?? '';

const plainEnough = (t: string): boolean => t.length <= 120 && !/[.,;:]$/.test(t);

export function detectHeading(line: string, nextNonEmptyLine: string | null): Heading | null {
  const t = line.trim();
  const md = /^(#{1,6})\s+(.+)$/.exec(t);
  if (md) return { level: g(md, 1).length, title: g(md, 2), ref: refOf(g(md, 2)) };
  if (plainEnough(t)) {
    const s = STRUCTURAL.exec(t);
    if (s) return { level: STRUCTURAL_LEVEL[g(s, 1)] ?? 2, title: t, ref: g(s, 1) === 'Schedule' ? `sch ${g(s, 2)}` : null };
    const w = PROVISION_WORD.exec(t);
    if (w) return { level: 5, title: t, ref: `${WORD_REF[g(w, 1)] ?? ''} ${g(w, 2)}` };
    const a = AU_SECTION.exec(t);
    if (a) return { level: 5, title: t, ref: `s ${g(a, 1)}` };
  }
  if (t.length <= 100 && nextNonEmptyLine !== null && !MONTHS.test(t)) {
    const n = NUMBERED.exec(t);
    if (n) return { level: 5, title: t, ref: `s ${g(n, 1)}` };
  }
  return null;
}

interface Section {
  path: string[];
  ref: string | null;
  titleLine: string | null;
  body: string;
}

function splitLong(paragraph: string): string[] {
  if (estimateTokens(paragraph) <= SPLIT_PARAGRAPH_TOKENS) return [paragraph];
  const sentences = paragraph.split(/(?<=[.;:])\s+/);
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    const next = cur ? `${cur} ${s}` : s;
    if (cur && estimateTokens(next) > CHUNK_TARGET_TOKENS) {
      out.push(cur);
      cur = s;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

export function chunkText(body: string): RawChunk[] {
  const lines = body.split('\n');
  const sections: Section[] = [];
  let stack: Heading[] = [];
  let current: Section = { path: [], ref: null, titleLine: null, body: '' };
  let buf: string[] = [];
  const flush = (): void => {
    current.body = buf.join('\n').trim();
    sections.push(current);
    buf = [];
  };
  for (let i = 0; i < lines.length; i++) {
    let next: string | null = null;
    for (let j = i + 1; j < lines.length; j++) {
      const candidate = lines[j] ?? '';
      if (candidate.trim() !== '') {
        next = candidate;
        break;
      }
    }
    const line = lines[i] ?? '';
    const h = detectHeading(line, next);
    if (h) {
      flush();
      stack = stack.filter((s) => s.level < h.level);
      stack.push(h);
      const ref = [...stack].reverse().find((s) => s.ref !== null)?.ref ?? null;
      current = { path: stack.map((s) => s.title), ref, titleLine: line.trim(), body: '' };
    } else buf.push(line);
  }
  flush();

  const chunks: RawChunk[] = [];
  const push = (s: Section, text: string): void => {
    chunks.push({ ordinal: chunks.length, headingPath: s.path, provisionRef: s.ref, text, tokens: estimateTokens(text) });
  };
  for (const s of sections) {
    if (s.body === '') continue;
    const whole = s.titleLine ? `${s.titleLine}\n\n${s.body}` : s.body;
    if (estimateTokens(whole) <= CHUNK_SINGLE_MAX_TOKENS) {
      push(s, whole);
      continue;
    }
    const paras = s.body
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p !== '')
      .flatMap(splitLong);
    const head = s.titleLine ? [s.titleLine] : [];
    let cur: string[] = [];
    let own = 0;
    for (const p of paras) {
      const candidate = [...head, ...cur, p].join('\n\n');
      if (estimateTokens(candidate) > CHUNK_TARGET_TOKENS && own >= 1) {
        push(s, [...head, ...cur].join('\n\n'));
        const last = cur[cur.length - 1] ?? '';
        cur = estimateTokens(last) <= OVERLAP_MAX_TOKENS ? [last] : [];
        own = 0;
      }
      cur.push(p);
      own++;
    }
    if (own >= 1) push(s, [...head, ...cur].join('\n\n'));
  }
  return chunks;
}
