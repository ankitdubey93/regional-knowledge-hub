import { and, eq, inArray } from 'drizzle-orm';
import { curriculumMeta } from '../../../src/content/curriculumMeta';
import { parseFrontmatter } from '../../../src/content/frontmatter'; // pure, no imports of its own
import type { Embedder } from '../ai/embed';
import { db } from '../db/client';
import { kbFact, kbSource, kbVersion } from '../db/schema';
import { recordAudit } from '../services/auditService';
import { createDraft, publishVersion } from '../services/kbService';
import { formatFact } from '../../../src/data/factFormat';
import type { Fact } from '../../../src/data/schemas';
import { normaliseText, sha256Hex } from './normalise';

export const SEED_ACTOR = 'system:seed';
export interface CurriculumFile { relPath: string; raw: string } // 'australia/bas-gst-guide.md'
export interface SeedReport { created: number; published: number; unchanged: number; skipped: number }

const JURISDICTIONS = ['AU', 'UK', 'INTL'] as const;

/** Replaces every {{fact:key}} with renderFact(key). */
export function renderFactTokens(body: string, renderFact: (key: string) => string): string {
  return body.replace(/\{\{fact:([a-zA-Z0-9.]+)\}\}/g, (_m, key: string) => renderFact(key));
}

/** "10%"; "10% (unverified)" when verifiedOn is null. Same text the seed always wrote. */
export function renderFactForKb(f: Fact): string {
  return f.verifiedOn === null ? `${formatFact(f)} (unverified)` : formatFact(f);
}

/** Every distinct {{fact:key}} key in a body, in first-seen order. */
export function factKeysIn(body: string): string[] {
  const seen = new Set<string>();
  for (const m of body.matchAll(/\{\{fact:([a-zA-Z0-9.]+)\}\}/g)) {
    if (m[1] !== undefined) seen.add(m[1]);
  }
  return [...seen];
}

export async function seedCurriculum(files: CurriculumFile[], embedder: Embedder | null, today: string): Promise<SeedReport> {
  const report: SeedReport = { created: 0, published: 0, unchanged: 0, skipped: 0 };
  for (const { relPath, raw } of files) {
    const { data, body } = parseFrontmatter(raw);
    const [section = '', file = ''] = relPath.split('/');
    const slug = file.replace(/\.md$/, '');
    const sitePath = `/knowledge/learn/${section}/${slug}`;
    const jurisdiction = JURISDICTIONS.find((j) => j === data.jurisdiction);
    if (!jurisdiction) throw new Error(`Unknown jurisdiction in ${relPath}`);
    const title = String(data.title);
    const meta = curriculumMeta(section, slug, data);
    const text = normaliseText(body);
    const sha = sha256Hex(text);

    const keys = [...new Set([...factKeysIn(text), ...meta.facts])];
    if (keys.length > 0) {
      const known = new Set(
        (await db.select({ key: kbFact.key }).from(kbFact).where(inArray(kbFact.key, keys))).map((r) => r.key),
      );
      const missing = keys.filter((k) => !known.has(k));
      if (missing.length > 0) {
        throw new Error(`Run kb:seed-facts first: ${relPath} uses unknown fact(s) ${missing.join(', ')}`);
      }
    }

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
          meta,
          createdBy: SEED_ACTOR,
        })
        .returning();
      source = rows[0];
      if (!source) throw new Error(`kb_source insert returned no row for ${relPath}`);
      report.created += 1;
    }

    const published = (
      await db
        .select({ sha256: kbVersion.sha256, publishedBy: kbVersion.publishedBy })
        .from(kbVersion)
        .where(and(eq(kbVersion.sourceId, source.id), eq(kbVersion.status, 'published')))
        .limit(1)
    )[0];
    if (published && published.publishedBy !== SEED_ACTOR) {
      report.skipped += 1;
      continue;
    }
    await db.update(kbSource).set({ title, meta, updatedAt: new Date() }).where(eq(kbSource.id, source.id));
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
