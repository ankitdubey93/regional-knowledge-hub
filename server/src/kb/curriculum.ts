import { and, eq } from 'drizzle-orm';
import { parseFrontmatter } from '../../../src/content/frontmatter'; // pure, no imports of its own
import type { Embedder } from '../ai/embed';
import { db } from '../db/client';
import { kbSource, kbVersion } from '../db/schema';
import { recordAudit } from '../services/auditService';
import { createDraft, publishVersion } from '../services/kbService';
import { normaliseText, sha256Hex } from './normalise';

export const SEED_ACTOR = 'system:seed';
export interface CurriculumFile { relPath: string; raw: string } // 'australia/bas-gst-guide.md'
export type RenderFact = (key: string) => string;
export interface SeedReport { created: number; published: number; unchanged: number }

const JURISDICTIONS = ['AU', 'UK', 'INTL'] as const;

/** Replaces every {{fact:key}} with renderFact(key). */
export function renderFactTokens(body: string, renderFact: RenderFact): string {
  return body.replace(/\{\{fact:([a-zA-Z0-9.]+)\}\}/g, (_m, key: string) => renderFact(key));
}

export async function seedCurriculum(
  files: CurriculumFile[],
  renderFact: RenderFact,
  embedder: Embedder | null,
  today: string,
): Promise<SeedReport> {
  const report: SeedReport = { created: 0, published: 0, unchanged: 0 };
  for (const { relPath, raw } of files) {
    const { data, body } = parseFrontmatter(raw);
    const [section, file = ''] = relPath.split('/');
    const slug = file.replace(/\.md$/, '');
    const sitePath = `/knowledge/learn/${section}/${slug}`;
    const jurisdiction = JURISDICTIONS.find((j) => j === data.jurisdiction);
    if (!jurisdiction) throw new Error(`Unknown jurisdiction in ${relPath}`);
    const title = String(data.title);
    const text = `# ${title}\n\n${renderFactTokens(body, renderFact)}`;
    const sha = sha256Hex(normaliseText(text));

    let source = (await db.select().from(kbSource).where(eq(kbSource.sitePath, sitePath)).limit(1))[0];
    if (!source) {
      const rows = await db
        .insert(kbSource)
        .values({
          kind: 'curriculum',
          jurisdiction,
          title,
          citation: `Compliance Hub guide: ${title}`,
          officialUrl: null,
          publisher: 'Compliance Hub',
          sitePath,
          createdBy: SEED_ACTOR,
        })
        .returning();
      source = rows[0];
      if (!source) throw new Error(`kb_source insert returned no row for ${relPath}`);
      report.created += 1;
    }

    const published = (
      await db
        .select({ sha256: kbVersion.sha256 })
        .from(kbVersion)
        .where(and(eq(kbVersion.sourceId, source.id), eq(kbVersion.status, 'published')))
        .limit(1)
    )[0];
    if (published?.sha256 === sha) {
      report.unchanged += 1;
      continue;
    }

    const draft = await createDraft(
      SEED_ACTOR,
      source.id,
      { label: `Site ${today}`, effectiveFrom: null, effectiveTo: null, retrievedOn: today, changeNote: 'Seeded from docs/' },
      { method: 'seed', text, originalName: relPath },
    );
    if (!('detail' in draft)) throw new Error(`Could not publish ${relPath}: ${JSON.stringify(draft)}`);
    const outcome = await publishVersion(SEED_ACTOR, draft.detail.version.id, embedder);
    if (!('detail' in outcome)) throw new Error(`Could not publish ${relPath}: ${JSON.stringify(outcome)}`);
    report.published += 1;
  }
  await recordAudit(db, {
    actorId: SEED_ACTOR,
    action: 'kb.seed',
    targetType: 'kb',
    targetId: 'curriculum',
    detail: { ...report },
  });
  return report;
}
