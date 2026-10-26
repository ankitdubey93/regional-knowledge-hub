import { parseFrontmatter } from './frontmatter';
import type { Jurisdiction } from '../data/schemas';

export type Section = 'core-accounting' | 'standards' | 'australia' | 'uk';

export interface Doc {
  id: string; // "australia/bas-gst-guide"
  section: Section;
  slug: string;
  title: string;
  summary: string;
  jurisdiction: Jurisdiction | 'AU+UK';
  level: 'beginner' | 'intermediate';
  order: number;
  minutes: number;
  facts: string[];
  tools: string[];
  body: string;
}

export const SECTIONS: { id: Section; title: string; blurb: string }[] = [
  { id: 'core-accounting', title: 'Core accounting', blurb: 'Double entry, accruals, policies and the month-end routine. The same everywhere.' },
  { id: 'standards', title: 'Standards', blurb: 'IFRS, UK GAAP (FRS 102 and 105) and the Australian AASB standards, and where they differ.' },
  { id: 'australia', title: 'Australia', blurb: 'GST and the BAS, PAYG and super, company thresholds, and setting up Xero or QBO.' },
  { id: 'uk', title: 'United Kingdom', blurb: 'VAT and Making Tax Digital, PAYE and CIS, the Companies Act, and Xero or QBO setup.' },
];

// Vite inlines every curriculum file at build time. The path is relative to this file.
const files = import.meta.glob('../../docs/*/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

function asList(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

export function buildDocs(source: Record<string, string>): Doc[] {
  const docs: Doc[] = [];
  for (const [path, raw] of Object.entries(source)) {
    const m = /docs\/([a-z-]+)\/([a-z0-9-]+)\.md$/.exec(path);
    if (!m) continue;
    const [, section, slug] = m;
    const { data, body } = parseFrontmatter(raw);
    docs.push({
      id: `${section}/${slug}`,
      section: section as Section,
      slug: slug!,
      title: String(data.title ?? slug),
      summary: String(data.summary ?? ''),
      jurisdiction: (data.jurisdiction ?? 'INTL') as Doc['jurisdiction'],
      level: data.level === 'intermediate' ? 'intermediate' : 'beginner',
      order: Number(data.order ?? 99),
      minutes: Math.max(1, Math.round(body.split(/\s+/).length / 200)),
      facts: asList(data.facts),
      tools: asList(data.tools),
      body,
    });
  }
  return docs.sort((a, b) => a.section.localeCompare(b.section) || a.order - b.order);
}

export const docs: Doc[] = buildDocs(files);

export function docsIn(section: Section): Doc[] {
  return docs.filter((d) => d.section === section).sort((a, b) => a.order - b.order);
}

export function findDoc(id: string): Doc | undefined {
  return docs.find((d) => d.id === id);
}

/** Every {{fact:key}} token used in a doc body. */
export function factTokens(body: string): string[] {
  return [...body.matchAll(/\{\{fact:([a-zA-Z0-9.]+)\}\}/g)].map((m) => m[1]!);
}
