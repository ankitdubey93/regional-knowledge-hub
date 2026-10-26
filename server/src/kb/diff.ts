export interface DiffChunk { ordinal: number; headingPath: string[]; provisionRef: string | null; text: string }

/** provisionRef, else the heading path joined with ' › ', else '#' + ordinal. */
export function diffKey(c: DiffChunk): string {
  if (c.provisionRef) return c.provisionRef;
  if (c.headingPath.length > 0) return c.headingPath.join(' › ');
  return `#${c.ordinal}`;
}

interface Grouped { order: string[]; text: Map<string, string> }

// Keys keep first-appearance order in the input. A key's text joins its chunks in ordinal order.
function group(chunks: DiffChunk[]): Grouped {
  const order: string[] = [];
  const parts = new Map<string, DiffChunk[]>();
  for (const c of chunks) {
    const k = diffKey(c);
    const list = parts.get(k);
    if (list) list.push(c);
    else {
      parts.set(k, [c]);
      order.push(k);
    }
  }
  const text = new Map<string, string>();
  for (const k of order) {
    const list = [...(parts.get(k) ?? [])].sort((a, b) => a.ordinal - b.ordinal);
    text.set(k, list.map((c) => c.text).join('\n'));
  }
  return { order, text };
}

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

export function diffVersions(next: DiffChunk[], prev: DiffChunk[]): { added: string[]; changed: string[]; removed: string[]; unchanged: number } {
  const n = group(next);
  const p = group(prev);
  const added: string[] = [];
  const changed: string[] = [];
  let unchanged = 0;
  for (const k of n.order) {
    const before = p.text.get(k);
    if (before === undefined) {
      added.push(k);
      continue;
    }
    if (norm(n.text.get(k) ?? '') === norm(before)) unchanged++;
    else changed.push(k);
  }
  const removed = p.order.filter((k) => !n.text.has(k));
  return { added, changed, removed, unchanged };
}
