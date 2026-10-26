import { createHash } from 'node:crypto';

/** Tidies extracted or pasted text. Pure: no I/O, no clock. */
export function normaliseText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/­/g, '')
    .replace(/ /g, ' ')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const keyOf = (line: string): string => line.trim().replace(/\d+/g, '#');

/** Removes running headers, footers and page numbers that repeat on most pages. Does not de-hyphenate. */
export function stripRepeatedPageLines(pages: string[]): string {
  if (pages.length < 3) return pages.join('\n\n');
  const edges = (page: string): { first: number; last: number; lines: string[] } => {
    const lines = page.split('\n');
    const idx = lines.map((l, i) => (l.trim() === '' ? -1 : i)).filter((i) => i >= 0);
    return { first: idx[0] ?? -1, last: idx[idx.length - 1] ?? -1, lines };
  };
  const counts = new Map<string, number>();
  const parsed = pages.map(edges);
  for (const p of parsed) {
    const keys = new Set<string>();
    if (p.first >= 0) keys.add(keyOf(p.lines[p.first] ?? ''));
    if (p.last >= 0) keys.add(keyOf(p.lines[p.last] ?? ''));
    for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const min = Math.ceil(pages.length * 0.6);
  const repeated = new Set([...counts].filter(([, n]) => n >= min).map(([k]) => k));
  const cleaned = parsed.map((p) =>
    p.lines
      .filter((l, i) => !((i === p.first || i === p.last) && repeated.has(keyOf(l))))
      .join('\n'),
  );
  return cleaned.join('\n\n');
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
