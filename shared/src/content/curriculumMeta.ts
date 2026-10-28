import type { Parsed } from './frontmatter';
import { curriculumMetaSchema, type CurriculumMeta } from '../data/schemas';

export function asList(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/** Frontmatter → the metadata the web needs. Same defaults buildDocs always used. Throws (zod) on a bad section, jurisdiction or slug. */
export function curriculumMeta(section: string, slug: string, data: Parsed['data']): CurriculumMeta {
  return curriculumMetaSchema.parse({
    section,
    slug,
    summary: String(data.summary ?? ''),
    jurisdiction: data.jurisdiction ?? 'INTL',
    level: data.level === 'intermediate' ? 'intermediate' : 'beginner',
    order: Number(data.order ?? 99),
    facts: asList(data.facts),
    tools: asList(data.tools),
  });
}
