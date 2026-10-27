import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { Fact } from '../../../src/data/schemas';
import { currentEmbedder } from '../ai/embed';
import { db } from '../db/client';
import { kbFact, kbFactHistory, kbSource, kbVersion, type KbIssue } from '../db/schema';
import type { Tx } from '../db/withOrg';
import { factKeysIn } from '../kb/curriculum';
import { checkFactSave, factsEqual, resolveVerifiedOn } from '../kb/factRules';
import type {
  AdminFactDetail,
  AdminFactRow,
  FactCreate,
  FactHistoryRow,
  FactSaveResult,
  FactUpdate,
  FactUsage,
} from '../types/facts';
import { recordAudit } from './auditService';
import { embedMissing, likeEscape, rechunkVersion, rowToFact } from './kbService';

// Facts are global (no org_id, no RLS), so no withOrg here. Only requireAdmin routes and the seed call this (Hard rule 16).
// Audit detail holds values and counts only (Hard rule 13).

export type FactOutcome = { result: FactSaveResult } | { notFound: true } | { conflict: string } | { blocked: KbIssue[] };

interface CurriculumUse { sourceId: string; title: string; sitePath: string | null; body: string; metaFacts: string[] }

/** Curriculum sources with a published version: the published body and the facts listed in meta. */
async function publishedCurriculum(): Promise<CurriculumUse[]> {
  const rows = await db
    .select({ sourceId: kbSource.id, title: kbSource.title, sitePath: kbSource.sitePath, meta: kbSource.meta, body: kbVersion.bodyMd })
    .from(kbSource)
    .innerJoin(kbVersion, and(eq(kbVersion.sourceId, kbSource.id), eq(kbVersion.status, 'published')))
    .where(eq(kbSource.kind, 'curriculum'))
    .orderBy(asc(kbSource.title));
  return rows.map((r) => ({ sourceId: r.sourceId, title: r.title, sitePath: r.sitePath, body: r.body, metaFacts: r.meta?.facts ?? [] }));
}

function uses(c: CurriculumUse, key: string): boolean {
  return c.metaFacts.includes(key) || factKeysIn(c.body).includes(key);
}

export async function listFacts(q: string, jurisdiction: 'AU' | 'UK' | 'INTL' | undefined): Promise<AdminFactRow[]> {
  const conds: SQL[] = [];
  if (jurisdiction) conds.push(eq(kbFact.jurisdiction, jurisdiction));
  if (q !== '') {
    const pattern = `%${likeEscape(q)}%`;
    const match = or(ilike(kbFact.key, pattern), ilike(kbFact.label, pattern));
    if (match) conds.push(match);
  }
  const rows = await db
    .select()
    .from(kbFact)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(asc(kbFact.key));
  if (rows.length === 0) return [];
  const curriculum = await publishedCurriculum();
  return rows.map((r) => ({
    key: r.key,
    fact: rowToFact(r),
    updatedBy: r.updatedBy,
    updatedAt: r.updatedAt,
    docCount: curriculum.filter((c) => uses(c, r.key)).length,
  }));
}

export async function getFact(key: string): Promise<AdminFactDetail | null> {
  const found = await db.select().from(kbFact).where(eq(kbFact.key, key)).limit(1);
  const row = found[0];
  if (!row) return null;
  const hist = await db
    .select()
    .from(kbFactHistory)
    .where(eq(kbFactHistory.factKey, key))
    .orderBy(desc(kbFactHistory.changedAt))
    .limit(50);
  const history: FactHistoryRow[] = hist.map((h) => ({
    id: h.id, fact: h.fact, changeNote: h.changeNote, changedBy: h.changedBy, changedAt: h.changedAt,
  }));
  const docs: FactUsage[] = (await publishedCurriculum())
    .filter((c) => uses(c, key))
    .map((c) => ({ sourceId: c.sourceId, title: c.title, sitePath: c.sitePath }));
  return { key, fact: rowToFact(row), updatedBy: row.updatedBy, updatedAt: row.updatedAt, docs, history };
}

/** The one write path (routes and seed). Inside tx: upsert kb_fact, insert history, re-chunk, audit. Returns versions re-chunked. */
export async function writeFactInTx(tx: Tx, actorId: string, key: string, prev: Fact | null, next: Fact, changeNote: string): Promise<number> {
  const values = {
    label: next.label,
    jurisdiction: next.jurisdiction,
    unit: next.unit,
    valueNum: typeof next.value === 'number' ? next.value : null,
    valueText: typeof next.value === 'number' ? null : next.value,
    effectiveFrom: next.effectiveFrom,
    source: next.source,
    verifiedOn: next.verifiedOn,
    note: next.note ?? null,
    updatedBy: actorId,
    updatedAt: new Date(),
  };
  await tx.insert(kbFact).values({ key, ...values }).onConflictDoUpdate({ target: kbFact.key, set: values });
  await tx.insert(kbFactHistory).values({ factKey: key, fact: next, changeNote, changedBy: actorId });

  const tokenPattern = `%{{fact:${likeEscape(key)}}}%`;
  const affected = await tx
    .select({ version: kbVersion, source: kbSource })
    .from(kbVersion)
    .innerJoin(kbSource, eq(kbSource.id, kbVersion.sourceId))
    .where(
      and(
        inArray(kbVersion.status, ['published', 'draft']),
        eq(kbSource.kind, 'curriculum'),
        or(sql`${kbVersion.bodyMd} like ${tokenPattern}`, sql`${kbSource.meta} -> 'facts' ? ${key}`),
      ),
    );
  let rechunked = 0;
  for (const a of affected) {
    await rechunkVersion(tx, a.version.id, a.source, a.version.bodyMd);
    rechunked += 1;
  }

  await recordAudit(tx, {
    actorId,
    action: prev ? 'kb.fact.update' : 'kb.fact.create',
    targetType: 'kb_fact',
    targetId: key,
    detail: { unit: next.unit, from: prev ? String(prev.value) : null, to: String(next.value), verified: next.verifiedOn !== null, rechunked },
  });
  return rechunked;
}

/** After the commit, never inside a transaction: embed what the re-chunk cleared. */
async function embedAfter(actorId: string, rechunked: number): Promise<number | null> {
  const embedder = currentEmbedder();
  if (embedder === null || rechunked === 0) return null;
  try {
    return (await embedMissing(actorId, embedder)).embedded;
  } catch {
    return null;
  }
}

type TxOutcome = { rechunked: number } | { conflict: string } | { blocked: KbIssue[] } | { notFound: true };

async function finish(actorId: string, key: string, tx: TxOutcome): Promise<FactOutcome> {
  if (!('rechunked' in tx)) return tx;
  const detail = await getFact(key);
  if (!detail) return { notFound: true };
  const embedded = await embedAfter(actorId, tx.rechunked);
  return { result: { detail, rechunked: tx.rechunked, embedded } };
}

export async function createFact(actorId: string, input: FactCreate, today: string): Promise<FactOutcome> {
  const key = input.key;
  const outcome = await db.transaction(async (tx): Promise<TxOutcome> => {
    const existing = await tx.select({ key: kbFact.key }).from(kbFact).where(eq(kbFact.key, key)).limit(1);
    if (existing.length > 0) return { conflict: 'A fact with this key already exists' };
    const next: Fact = { ...input.fact, verifiedOn: resolveVerifiedOn(null, input.fact, input.confirmVerified, today) };
    const issues = checkFactSave(null, next, today);
    if (issues.length > 0) return { blocked: issues };
    return { rechunked: await writeFactInTx(tx, actorId, key, null, next, input.changeNote) };
  });
  return finish(actorId, key, outcome);
}

export async function updateFact(actorId: string, key: string, input: FactUpdate, today: string): Promise<FactOutcome> {
  const outcome = await db.transaction(async (tx): Promise<TxOutcome> => {
    const found = await tx.select().from(kbFact).where(eq(kbFact.key, key)).for('update').limit(1);
    const row = found[0];
    if (!row) return { notFound: true };
    const prev = rowToFact(row);
    const next: Fact = { ...input.fact, verifiedOn: resolveVerifiedOn(prev, input.fact, input.confirmVerified, today) };
    if (factsEqual(prev, next)) return { conflict: 'Nothing changed' };
    const issues = checkFactSave(prev, next, today);
    if (issues.length > 0) return { blocked: issues };
    return { rechunked: await writeFactInTx(tx, actorId, key, prev, next, input.changeNote) };
  });
  return finish(actorId, key, outcome);
}
