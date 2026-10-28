import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { z } from 'zod';
import { db } from '../db/client';
import { kbFact, kbSource, kbVersion } from '../db/schema';
import type { Fact, SiteDoc } from '@chub/shared/data/schemas';
import { LAW_KINDS, type LawDetail, type LawListItem, type SitePayload, type lawQuerySchema } from '../types/kbPublic';
import { rowToFact } from './kbService';

// Public reads (no session). Every query joins kb_version with status = 'published' (Hard rule 16).

/** All kb_fact rows as Facts, keys sorted; curriculum sources with meta and a published version, as SiteDoc. */
export async function sitePayload(): Promise<SitePayload> {
  const factRows = await db.select().from(kbFact).orderBy(asc(kbFact.key));
  const facts: Record<string, Fact> = {};
  for (const r of [...factRows].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))) facts[r.key] = rowToFact(r);

  const rows = await db
    .select({ title: kbSource.title, meta: kbSource.meta, body: kbVersion.bodyMd })
    .from(kbSource)
    .innerJoin(kbVersion, and(eq(kbVersion.sourceId, kbSource.id), eq(kbVersion.status, 'published')))
    .where(and(eq(kbSource.kind, 'curriculum'), isNotNull(kbSource.meta)));

  const docs: SiteDoc[] = [];
  for (const r of rows) {
    if (!r.meta) continue;
    docs.push({ ...r.meta, id: `${r.meta.section}/${r.meta.slug}`, title: r.title, body: r.body });
  }
  docs.sort((a, b) => (a.section < b.section ? -1 : a.section > b.section ? 1 : a.order - b.order || (a.slug < b.slug ? -1 : 1)));
  return { facts, docs };
}

type LawRow = {
  source: typeof kbSource.$inferSelect;
  version: typeof kbVersion.$inferSelect;
};

async function toItems(rows: LawRow[]): Promise<LawDetail[]> {
  const enactedIds = [...new Set(rows.map((r) => r.source.enactedAsSourceId).filter((x): x is string => x !== null))];
  const enacted = enactedIds.length
    ? await db.select({ id: kbSource.id, title: kbSource.title }).from(kbSource).where(inArray(kbSource.id, enactedIds))
    : [];
  const byId = new Map(enacted.map((e) => [e.id, e]));
  return rows.map(({ source: s, version: v }) => {
    const kind = LAW_KINDS.find((k) => k === s.kind);
    if (!kind) throw new Error(`Not a law kind: ${s.kind}`);
    const e = s.enactedAsSourceId ? byId.get(s.enactedAsSourceId) : undefined;
    return {
      id: s.id,
      title: s.title,
      citation: s.citation,
      jurisdiction: s.jurisdiction,
      kind,
      publisher: s.publisher,
      officialUrl: s.officialUrl,
      billStatus: s.billStatus,
      enactedAs: e ? { id: e.id, title: e.title } : null,
      versionLabel: v.label,
      effectiveFrom: v.effectiveFrom,
      retrievedOn: v.retrievedOn,
      publishedAt: (v.publishedAt ?? v.updatedAt).toISOString(),
      bodyMd: v.bodyMd,
    };
  });
}

/** Published sources of LAW_KINDS only, ordered jurisdiction, title. */
export async function listLaws(filter: z.infer<typeof lawQuerySchema>): Promise<LawListItem[]> {
  const kinds = filter.kind ? [filter.kind] : [...LAW_KINDS];
  const conds = [inArray(kbSource.kind, kinds)];
  if (filter.jurisdiction) conds.push(eq(kbSource.jurisdiction, filter.jurisdiction));
  const rows = await db
    .select({ source: kbSource, version: kbVersion })
    .from(kbSource)
    .innerJoin(kbVersion, and(eq(kbVersion.sourceId, kbSource.id), eq(kbVersion.status, 'published')))
    .where(and(...conds))
    .orderBy(asc(kbSource.jurisdiction), asc(kbSource.title));
  const items = await toItems(rows);
  return items.map(({ bodyMd: _body, ...item }) => item);
}

/** null when the source is not a LAW_KIND or has no published version. */
export async function getLaw(id: string): Promise<LawDetail | null> {
  const rows = await db
    .select({ source: kbSource, version: kbVersion })
    .from(kbSource)
    .innerJoin(kbVersion, and(eq(kbVersion.sourceId, kbSource.id), eq(kbVersion.status, 'published')))
    .where(and(eq(kbSource.id, id), inArray(kbSource.kind, [...LAW_KINDS])))
    .limit(1);
  const items = await toItems(rows);
  return items[0] ?? null;
}
