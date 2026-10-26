import { and, asc, count, desc, eq, ilike, inArray, ne, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client';
import { kbChunk, kbSource, kbVersion } from '../db/schema';
import type { Tx } from '../db/withOrg';
import { chunkText, type RawChunk } from '../kb/chunk';
import { diffVersions } from '../kb/diff';
import { normaliseText, sha256Hex } from '../kb/normalise';
import { validateVersion } from '../kb/validate';
import type {
  DraftText,
  KbChunkView,
  KbDiff,
  KbIssue,
  KbSource,
  KbSourceListItem,
  KbVersionDetail,
  KbVersionSummary,
  SourceFilter,
  SourceInput,
  SourcePatch,
  VersionMeta,
  VersionPatch,
} from '../types/kb';
import { EmbeddingError, type Embedder } from '../ai/embed';
import type { KbOverviewCounts } from '../types/kb';
import { recordAudit } from './auditService';

// The knowledge base is global (no org_id, no RLS), so no withOrg here. Only requireAdmin routes and the seed script call this.
// Audit detail holds ids, labels and counts only, never text (Hard rule 13).

const INSERT_BATCH = 500;

function likeEscape(q: string): string {
  return q.replace(/[\\%_]/g, '\\$&');
}

export async function listSources(filter: SourceFilter): Promise<KbSourceListItem[]> {
  const conds: SQL[] = [];
  if (filter.jurisdiction) conds.push(eq(kbSource.jurisdiction, filter.jurisdiction));
  if (filter.kind) conds.push(eq(kbSource.kind, filter.kind));
  if (filter.q !== '') {
    const pattern = `%${likeEscape(filter.q)}%`;
    const match = or(ilike(kbSource.title, pattern), ilike(kbSource.citation, pattern));
    if (match) conds.push(match);
  }
  const sources = await db
    .select()
    .from(kbSource)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(asc(kbSource.title));
  if (sources.length === 0) return [];
  const ids = sources.map((s) => s.id);

  const published = await db
    .select({ id: kbVersion.id, sourceId: kbVersion.sourceId, label: kbVersion.label, effectiveFrom: kbVersion.effectiveFrom })
    .from(kbVersion)
    .where(and(inArray(kbVersion.sourceId, ids), eq(kbVersion.status, 'published')));
  const drafts = await db
    .select({ sourceId: kbVersion.sourceId, n: count() })
    .from(kbVersion)
    .where(and(inArray(kbVersion.sourceId, ids), eq(kbVersion.status, 'draft')))
    .groupBy(kbVersion.sourceId);

  const publishedBySource = new Map(published.map((p) => [p.sourceId, p]));
  const draftsBySource = new Map(drafts.map((d) => [d.sourceId, d.n]));
  return sources.map((s) => {
    const p = publishedBySource.get(s.id);
    return {
      ...s,
      publishedVersion: p ? { id: p.id, label: p.label, effectiveFrom: p.effectiveFrom } : null,
      draftCount: draftsBySource.get(s.id) ?? 0,
    };
  });
}

export async function getSource(id: string): Promise<{ source: KbSource; versions: KbVersionSummary[] } | null> {
  const found = await db.select().from(kbSource).where(eq(kbSource.id, id)).limit(1);
  const source = found[0];
  if (!source) return null;
  const rows = await db.select().from(kbVersion).where(eq(kbVersion.sourceId, id)).orderBy(desc(kbVersion.createdAt));
  const counts =
    rows.length === 0
      ? []
      : await db
          .select({ versionId: kbChunk.versionId, n: count() })
          .from(kbChunk)
          .where(inArray(kbChunk.versionId, rows.map((r) => r.id)))
          .groupBy(kbChunk.versionId);
  const countByVersion = new Map(counts.map((c) => [c.versionId, c.n]));
  const versions: KbVersionSummary[] = rows.map((v) => ({
    id: v.id,
    label: v.label,
    status: v.status,
    effectiveFrom: v.effectiveFrom,
    effectiveTo: v.effectiveTo,
    retrievedOn: v.retrievedOn,
    inputMethod: v.inputMethod,
    chunkCount: countByVersion.get(v.id) ?? 0,
    createdAt: v.createdAt,
    publishedAt: v.publishedAt,
  }));
  return { source, versions };
}

export async function createSource(actorId: string, input: SourceInput): Promise<KbSource> {
  return db.transaction(async (tx) => {
    const rows = await tx.insert(kbSource).values({ ...input, createdBy: actorId }).returning();
    const row = rows[0];
    if (!row) throw new Error('kb_source insert returned no row');
    await recordAudit(tx, { actorId, action: 'kb.source.create', targetType: 'kb_source', targetId: row.id, detail: { title: row.title } });
    return row;
  });
}

export async function updateSource(actorId: string, id: string, patch: SourcePatch): Promise<KbSource | null> {
  return db.transaction(async (tx) => {
    const rows = await tx.update(kbSource).set({ ...patch, updatedAt: new Date() }).where(eq(kbSource.id, id)).returning();
    const row = rows[0];
    if (!row) return null;
    await recordAudit(tx, { actorId, action: 'kb.source.update', targetType: 'kb_source', targetId: id, detail: { title: row.title } });
    return row;
  });
}

export async function setOfficialUrlIfMissing(sourceId: string, url: string): Promise<void> {
  await db
    .update(kbSource)
    .set({ officialUrl: url, updatedAt: new Date() })
    .where(and(eq(kbSource.id, sourceId), sql`${kbSource.officialUrl} is null`));
}

export async function publishedBody(sourceId: string): Promise<string | null> {
  const rows = await db
    .select({ bodyMd: kbVersion.bodyMd })
    .from(kbVersion)
    .where(and(eq(kbVersion.sourceId, sourceId), eq(kbVersion.status, 'published')))
    .limit(1);
  return rows[0]?.bodyMd ?? null;
}

export type DraftOutcome = { detail: KbVersionDetail } | { notFound: true } | { conflict: string };

function chunkContext(citation: string, headingPath: string[]): string {
  return citation + (headingPath.length > 0 ? ` › ${headingPath.join(' › ')}` : '');
}

async function insertChunks(tx: Tx, versionId: string, citation: string, chunks: RawChunk[]): Promise<void> {
  for (let i = 0; i < chunks.length; i += INSERT_BATCH) {
    const slice = chunks.slice(i, i + INSERT_BATCH);
    await tx.insert(kbChunk).values(
      slice.map((c) => ({
        versionId,
        ordinal: c.ordinal,
        headingPath: c.headingPath,
        provisionRef: c.provisionRef,
        context: chunkContext(citation, c.headingPath),
        text: c.text,
        tokens: c.tokens,
      })),
    );
  }
}

export async function createDraft(actorId: string, sourceId: string, meta: VersionMeta, input: DraftText): Promise<DraftOutcome> {
  const id = await db.transaction(async (tx): Promise<string | null> => {
    const found = await tx.select().from(kbSource).where(eq(kbSource.id, sourceId)).limit(1);
    const source = found[0];
    if (!source) return null;

    const body = normaliseText(input.text);
    const sha = sha256Hex(body);
    const chunks = chunkText(body);
    const dup = await tx
      .select({ label: kbVersion.label })
      .from(kbVersion)
      .where(and(eq(kbVersion.sourceId, sourceId), eq(kbVersion.sha256, sha)))
      .limit(1);
    const issues = validateVersion({
      kind: source.kind,
      officialUrl: source.officialUrl,
      billStatus: source.billStatus,
      effectiveFrom: meta.effectiveFrom,
      bodyMd: body,
      chunks,
      duplicateOfLabel: dup[0]?.label ?? null,
    });

    const rows = await tx
      .insert(kbVersion)
      .values({
        sourceId,
        label: meta.label,
        status: 'draft',
        effectiveFrom: meta.effectiveFrom,
        effectiveTo: meta.effectiveTo,
        retrievedOn: meta.retrievedOn,
        inputMethod: input.method,
        originalName: input.originalName,
        bodyMd: body,
        sha256: sha,
        changeNote: meta.changeNote,
        issues,
        createdBy: actorId,
      })
      .returning({ id: kbVersion.id });
    const row = rows[0];
    if (!row) throw new Error('kb_version insert returned no row');

    await insertChunks(tx, row.id, source.citation, chunks);
    await recordAudit(tx, {
      actorId,
      action: 'kb.version.create',
      targetType: 'kb_version',
      targetId: row.id,
      detail: { sourceId, label: meta.label, method: input.method, chunks: chunks.length },
    });
    return row.id;
  });
  if (id === null) return { notFound: true };
  const detail = await getVersionDetail(id);
  if (!detail) return { notFound: true };
  return { detail };
}

export async function updateDraft(actorId: string, id: string, patch: VersionPatch): Promise<DraftOutcome> {
  const outcome = await db.transaction(async (tx): Promise<'notFound' | { conflict: string } | 'ok'> => {
    const found = await tx.select().from(kbVersion).where(eq(kbVersion.id, id)).limit(1);
    const version = found[0];
    if (!version) return 'notFound';
    if (version.status !== 'draft') return { conflict: 'Only a draft can be edited' };
    const srcRows = await tx.select().from(kbSource).where(eq(kbSource.id, version.sourceId)).limit(1);
    const source = srcRows[0];
    if (!source) return 'notFound';

    const { bodyMd: newBody, ...metaPatch } = patch;
    let body = version.bodyMd;
    let sha = version.sha256;
    let chunks: RawChunk[] | null = null;
    if (newBody !== undefined) {
      body = normaliseText(newBody);
      sha = sha256Hex(body);
      chunks = chunkText(body);
      await tx.delete(kbChunk).where(eq(kbChunk.versionId, id));
      await insertChunks(tx, id, source.citation, chunks);
    }
    const effectiveFrom = metaPatch.effectiveFrom !== undefined ? metaPatch.effectiveFrom : version.effectiveFrom;
    const raw = chunks ?? chunkText(body);
    const dup = await tx
      .select({ label: kbVersion.label })
      .from(kbVersion)
      .where(and(eq(kbVersion.sourceId, version.sourceId), eq(kbVersion.sha256, sha), ne(kbVersion.id, id)))
      .limit(1);
    const issues = validateVersion({
      kind: source.kind,
      officialUrl: source.officialUrl,
      billStatus: source.billStatus,
      effectiveFrom,
      bodyMd: body,
      chunks: raw,
      duplicateOfLabel: dup[0]?.label ?? null,
    });

    await tx
      .update(kbVersion)
      .set({ ...metaPatch, bodyMd: body, sha256: sha, issues, updatedAt: new Date() })
      .where(eq(kbVersion.id, id));
    await recordAudit(tx, {
      actorId,
      action: 'kb.version.update',
      targetType: 'kb_version',
      targetId: id,
      detail: { sourceId: version.sourceId, label: metaPatch.label ?? version.label, bodyChanged: newBody !== undefined },
    });
    return 'ok';
  });
  if (outcome === 'notFound') return { notFound: true };
  if (outcome !== 'ok') return outcome;
  const detail = await getVersionDetail(id);
  if (!detail) return { notFound: true };
  return { detail };
}

export async function getVersionDetail(id: string): Promise<KbVersionDetail | null> {
  const found = await db.select().from(kbVersion).where(eq(kbVersion.id, id)).limit(1);
  const version = found[0];
  if (!version) return null;
  const srcRows = await db.select().from(kbSource).where(eq(kbSource.id, version.sourceId)).limit(1);
  const source = srcRows[0];
  if (!source) return null;

  const rows = await db
    .select({
      id: kbChunk.id,
      ordinal: kbChunk.ordinal,
      headingPath: kbChunk.headingPath,
      provisionRef: kbChunk.provisionRef,
      tokens: kbChunk.tokens,
      text: kbChunk.text,
      embedded: sql<boolean>`${kbChunk.embedding} is not null`,
    })
    .from(kbChunk)
    .where(eq(kbChunk.versionId, id))
    .orderBy(asc(kbChunk.ordinal));
  const chunks: KbChunkView[] = rows.map((r) => ({ ...r, embedded: r.embedded === true }));

  const next = chunks.map((c) => ({ ordinal: c.ordinal, headingPath: c.headingPath, provisionRef: c.provisionRef, text: c.text }));
  let diff: KbDiff = { against: null, ...diffVersions(next, []) };
  const pubRows = await db
    .select({ id: kbVersion.id, label: kbVersion.label })
    .from(kbVersion)
    .where(and(eq(kbVersion.sourceId, version.sourceId), eq(kbVersion.status, 'published')))
    .limit(1);
  const pub = pubRows[0];
  if (pub && pub.id !== id) {
    const prevRows = await db
      .select({ ordinal: kbChunk.ordinal, headingPath: kbChunk.headingPath, provisionRef: kbChunk.provisionRef, text: kbChunk.text })
      .from(kbChunk)
      .where(eq(kbChunk.versionId, pub.id))
      .orderBy(asc(kbChunk.ordinal));
    diff = { against: { id: pub.id, label: pub.label }, ...diffVersions(next, prevRows) };
  }
  return { version, source, chunks, diff };
}

export type PublishOutcome =
  | { detail: KbVersionDetail } | { notFound: true } | { conflict: string } | { blocked: KbIssue[] } | { embedFailed: true };

export const EMBED_BATCH = 100;

export async function publishVersion(actorId: string, id: string, embedder: Embedder | null): Promise<PublishOutcome> {
  const found = await db.select().from(kbVersion).where(eq(kbVersion.id, id)).limit(1);
  const version = found[0];
  if (!version) return { notFound: true };
  if (version.status !== 'draft') return { conflict: 'Only a draft can be published' };
  const blocking = version.issues.filter((i) => i.level === 'block');
  if (blocking.length > 0) return { blocked: blocking };

  // Embed first, outside any transaction (no AI call inside a transaction).
  const vectors = new Map<string, number[]>();
  if (embedder !== null) {
    const rows = await db
      .select({ id: kbChunk.id, context: kbChunk.context, text: kbChunk.text })
      .from(kbChunk)
      .where(eq(kbChunk.versionId, id))
      .orderBy(asc(kbChunk.ordinal));
    try {
      for (let i = 0; i < rows.length; i += EMBED_BATCH) {
        const slice = rows.slice(i, i + EMBED_BATCH);
        const out = await embedder.embed(slice.map((r) => `${r.context}\n\n${r.text}`), 'RETRIEVAL_DOCUMENT');
        if (out.length !== slice.length) throw new Error('embedder returned the wrong number of vectors');
        slice.forEach((r, j) => {
          const v = out[j];
          if (v) vectors.set(r.id, v);
        });
      }
    } catch {
      return { embedFailed: true };
    }
  }

  const outcome = await db.transaction(async (tx): Promise<{ conflict: string } | 'ok'> => {
    const again = await tx
      .select({ id: kbVersion.id })
      .from(kbVersion)
      .where(and(eq(kbVersion.id, id), eq(kbVersion.status, 'draft'), eq(kbVersion.sha256, version.sha256)))
      .limit(1);
    if (again.length === 0) return { conflict: 'The draft changed while publishing; try again' };
    if (embedder !== null) {
      const now = new Date();
      for (const [chunkId, embedding] of vectors) {
        await tx
          .update(kbChunk)
          .set({ embedding, embedModel: embedder.model, embeddedAt: now })
          .where(and(eq(kbChunk.id, chunkId), eq(kbChunk.versionId, id)));
      }
    }
    // Supersede the old version first: kb_version_one_published allows only one published per source.
    await tx
      .update(kbVersion)
      .set({ status: 'superseded', updatedAt: new Date() })
      .where(and(eq(kbVersion.sourceId, version.sourceId), eq(kbVersion.status, 'published')));
    const now = new Date();
    await tx
      .update(kbVersion)
      .set({ status: 'published', publishedAt: now, publishedBy: actorId, updatedAt: now })
      .where(eq(kbVersion.id, id));
    await recordAudit(tx, {
      actorId,
      action: 'kb.version.publish',
      targetType: 'kb_version',
      targetId: id,
      detail: { sourceId: version.sourceId, label: version.label, embedded: embedder !== null },
    });
    return 'ok';
  });
  if (outcome !== 'ok') return outcome;
  const detail = await getVersionDetail(id);
  if (!detail) return { notFound: true };
  return { detail };
}

export async function withdrawVersion(actorId: string, id: string): Promise<DraftOutcome> {
  const outcome = await db.transaction(async (tx): Promise<'notFound' | { conflict: string } | 'ok'> => {
    const found = await tx.select().from(kbVersion).where(eq(kbVersion.id, id)).limit(1);
    const version = found[0];
    if (!version) return 'notFound';
    if (version.status === 'superseded' || version.status === 'withdrawn') {
      return { conflict: `This version is already ${version.status}` };
    }
    await tx.update(kbVersion).set({ status: 'withdrawn', updatedAt: new Date() }).where(eq(kbVersion.id, id));
    await recordAudit(tx, {
      actorId,
      action: 'kb.version.withdraw',
      targetType: 'kb_version',
      targetId: id,
      detail: { sourceId: version.sourceId, label: version.label },
    });
    return 'ok';
  });
  if (outcome === 'notFound') return { notFound: true };
  if (outcome !== 'ok') return outcome;
  const detail = await getVersionDetail(id);
  if (!detail) return { notFound: true };
  return { detail };
}

export async function kbOverviewCounts(): Promise<KbOverviewCounts> {
  const sources = await db.select({ n: count() }).from(kbSource);
  const byStatus = await db.select({ status: kbVersion.status, n: count() }).from(kbVersion).groupBy(kbVersion.status);
  const missing = await db
    .select({ n: count() })
    .from(kbChunk)
    .innerJoin(kbVersion, eq(kbVersion.id, kbChunk.versionId))
    .where(and(eq(kbVersion.status, 'published'), sql`${kbChunk.embedding} is null`));
  const n = (s: string): number => byStatus.find((r) => r.status === s)?.n ?? 0;
  return {
    sources: sources[0]?.n ?? 0,
    publishedVersions: n('published'),
    drafts: n('draft'),
    chunksWithoutEmbedding: missing[0]?.n ?? 0,
  };
}

/** Embeds published chunks that have no embedding, up to 500 per call. Embedding happens outside any transaction. */
export async function embedMissing(actorId: string, embedder: Embedder): Promise<{ embedded: number; remaining: number }> {
  const missingWhere = and(eq(kbVersion.status, 'published'), sql`${kbChunk.embedding} is null`);
  const rows = await db
    .select({ id: kbChunk.id, context: kbChunk.context, text: kbChunk.text })
    .from(kbChunk)
    .innerJoin(kbVersion, eq(kbVersion.id, kbChunk.versionId))
    .where(missingWhere)
    .orderBy(asc(kbChunk.id))
    .limit(500);

  let embedded = 0;
  for (let i = 0; i < rows.length; i += EMBED_BATCH) {
    const slice = rows.slice(i, i + EMBED_BATCH);
    const out = await embedder.embed(slice.map((r) => `${r.context}\n\n${r.text}`), 'RETRIEVAL_DOCUMENT');
    if (out.length !== slice.length) throw new EmbeddingError('embedder returned the wrong number of vectors');
    const now = new Date();
    for (let j = 0; j < slice.length; j++) {
      const row = slice[j];
      const embedding = out[j];
      if (!row || !embedding) continue;
      await db
        .update(kbChunk)
        .set({ embedding, embedModel: embedder.model, embeddedAt: now })
        .where(eq(kbChunk.id, row.id));
      embedded += 1;
    }
  }
  await recordAudit(db, { actorId, action: 'kb.embed_missing', targetType: 'kb', targetId: 'embeddings', detail: { embedded } });
  const left = await db
    .select({ n: count() })
    .from(kbChunk)
    .innerJoin(kbVersion, eq(kbVersion.id, kbChunk.versionId))
    .where(missingWhere);
  return { embedded, remaining: left[0]?.n ?? 0 };
}
