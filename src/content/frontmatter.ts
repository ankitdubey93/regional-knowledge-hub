/**
 * A deliberately tiny frontmatter parser: `key: value` lines between two `---`
 * lines, where a value in [brackets] is a comma-separated list. That is all
 * the curriculum docs use, so no YAML library is needed.
 */
export interface Parsed {
  data: Record<string, string | string[]>;
  body: string;
}

export function parseFrontmatter(raw: string): Parsed {
  const text = raw.replace(/^﻿/, '');
  if (!text.startsWith('---\n')) return { data: {}, body: text };
  const end = text.indexOf('\n---', 4);
  if (end === -1) return { data: {}, body: text };
  const data: Record<string, string | string[]> = {};
  for (const line of text.slice(4, end).split('\n')) {
    const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    const [, key, value = ''] = m;
    data[key!] = value.startsWith('[') && value.endsWith(']')
      ? value.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean)
      : value.replace(/^["']|["']$/g, '');
  }
  return { data, body: text.slice(end + 4).replace(/^\n+/, '') };
}
