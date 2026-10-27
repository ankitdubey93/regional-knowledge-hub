import factsJson from '../data/facts.json';
import { factsSchema, type SiteDoc } from '../data/schemas';
import { buildDocs } from '../content/docs';

const files = import.meta.glob('../../docs/*/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export const seedFacts = factsSchema.parse(factsJson);
export const seedSiteDocs: SiteDoc[] = buildDocs(files).map(({ minutes: _m, ...d }) => d);
