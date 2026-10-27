import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { kbChunk, kbSource, kbVersion } from '../db/schema';
import type { KbSearchResponse, KbSearchResult, SearchInput } from '../types/kb';
import { fuseRankings } from './rrf';

export const CANDIDATES = 30;

/** AU → AU and INTL; UK → UK and INTL; none → all three. */
export function jurisdictionsFor(j: 'AU' | 'UK' | undefined): ('AU' | 'UK' | 'INTL')[] {
  if (j === 'AU') return ['AU', 'INTL'];
  if (j === 'UK') return ['UK', 'INTL'];
  return ['AU', 'UK', 'INTL'];
}

const idRows = z.object({ id: z.string() });

function parseIds(result: { rows: unknown[] }): string[] {
  return result.rows.map((r) => idRows.parse(r).id);
}

/** Published chunks only. queryEmbedding null → keyword search only (mode 'fts'). */
export async function searchKb(input: SearchInput, queryEmbedding: number[] | null): Promise<KbSearchResponse> {
  const mode: KbSearchResponse['mode'] = queryEmbedding !== null ? 'hybrid' : 'fts';
  const jurs = `{${jurisdictionsFor(input.jurisdiction).join(',')}}`;

  const ftsResult = await db.execute(sql`
    select c.id from kb_chunk c
      join kb_version v on v.id = c.version_id
      join kb_source s on s.id = v.source_id,
      websearch_to_tsquery('english', ${input.query}) q
    where v.status = 'published' and c.tsv @@ q
      and s.jurisdiction = any(${jurs}::text[])
      and (${input.includeBills} or s.kind <> 'bill')
    order by ts_rank_cd(c.tsv, q) desc, c.id
    limit ${CANDIDATES}
  `);
  const ftsIds = parseIds(ftsResult);

  const lists: string[][] = [ftsIds];
  if (queryEmbedding !== null) {
    const vecResult = await db.execute(sql`
      select c.id from kb_chunk c
        join kb_version v on v.id = c.version_id
        join kb_source s on s.id = v.source_id
      where v.status = 'published' and c.embedding is not null
        and s.jurisdiction = any(${jurs}::text[])
        and (${input.includeBills} or s.kind <> 'bill')
      order by c.embedding <=> ${JSON.stringify(queryEmbedding)}::vector, c.id
      limit ${CANDIDATES}
    `);
    lists.push(parseIds(vecResult));
  }

  const fused = fuseRankings(lists).slice(0, input.limit);
  return { mode, results: await hydrate(fused) };
}

async function hydrate(fused: ReturnType<typeof fuseRankings>): Promise<KbSearchResult[]> {
  if (fused.length === 0) return [];
  const rows = await db
    .select({
      chunkId: kbChunk.id,
      headingPath: kbChunk.headingPath,
      provisionRef: kbChunk.provisionRef,
      text: kbChunk.text,
      sourceId: kbSource.id,
      title: kbSource.title,
      citation: kbSource.citation,
      kind: kbSource.kind,
      jurisdiction: kbSource.jurisdiction,
      billStatus: kbSource.billStatus,
      officialUrl: kbSource.officialUrl,
      sitePath: kbSource.sitePath,
      versionId: kbVersion.id,
      versionLabel: kbVersion.label,
      effectiveFrom: kbVersion.effectiveFrom,
    })
    .from(kbChunk)
    .innerJoin(kbVersion, eq(kbVersion.id, kbChunk.versionId))
    .innerJoin(kbSource, eq(kbSource.id, kbVersion.sourceId))
    .where(and(inArray(kbChunk.id, fused.map((f) => f.id)), eq(kbVersion.status, 'published')));
  const byId = new Map(rows.map((r) => [r.chunkId, r]));

  const results: KbSearchResult[] = [];
  fused.forEach((f, i) => {
    const r = byId.get(f.id);
    if (!r) return;
    results.push({
      ...r,
      rank: i + 1,
      score: f.score,
      ftsRank: f.ranks[0] ?? null,
      vectorRank: f.ranks[1] ?? null,
    });
  });
  return results;
}

export interface ChatRetrieval {
  mode: 'hybrid' | 'fts';
  results: KbSearchResult[];
  lexemeCount: number;
  bestLexemeMatches: number;
  bestSimilarityBp: number | null;
}

const ftsChatRows = z.object({ id: z.string(), matched: z.number() });
const vecChatRows = z.object({ id: z.string(), sim_bp: z.number() });
const countRow = z.object({ n: z.number() });

/** Published chunks only. FTS matches ANY of the question's lexemes and reports how many each chunk matched. */
export async function searchKbForChat(input: SearchInput, queryEmbedding: number[] | null): Promise<ChatRetrieval> {
  const mode: ChatRetrieval['mode'] = queryEmbedding !== null ? 'hybrid' : 'fts';
  const jurs = `{${jurisdictionsFor(input.jurisdiction).join(',')}}`;

  const countResult = await db.execute(sql`
    select coalesce(cardinality(array_agg(distinct lexeme)), 0)::int as n
    from unnest(tsvector_to_array(to_tsvector('english', ${input.query}))) as lexeme
  `);
  const lexemeCount = countRow.parse(countResult.rows[0]).n;

  const ftsResult = await db.execute(sql`
    with q as (
      select coalesce(array_agg(distinct lexeme), '{}') as lx
      from unnest(tsvector_to_array(to_tsvector('english', ${input.query}))) as lexeme
    ), oq as (
      select lx, to_tsquery('simple', array_to_string(array(select quote_literal(l) from unnest(lx) l), ' | ')) as tq from q
    )
    select c.id,
      (select count(*) from unnest(oq.lx) l where c.tsv @@ to_tsquery('simple', quote_literal(l)))::int as matched
    from kb_chunk c
      join kb_version v on v.id = c.version_id
      join kb_source s on s.id = v.source_id,
      oq
    where v.status = 'published' and cardinality(oq.lx) > 0 and c.tsv @@ oq.tq
      and s.jurisdiction = any(${jurs}::text[])
      and (${input.includeBills} or s.kind <> 'bill')
    order by matched desc, ts_rank_cd(c.tsv, oq.tq) desc, c.id
    limit ${CANDIDATES}
  `);
  const ftsRows = ftsResult.rows.map((r) => ftsChatRows.parse(r));
  const bestLexemeMatches = ftsRows[0]?.matched ?? 0;

  const lists: string[][] = [ftsRows.map((r) => r.id)];
  let bestSimilarityBp: number | null = null;
  if (queryEmbedding !== null) {
    const vec = JSON.stringify(queryEmbedding);
    const vecResult = await db.execute(sql`
      select c.id, round((1 - (c.embedding <=> ${vec}::vector)) * 10000)::int as sim_bp
      from kb_chunk c
        join kb_version v on v.id = c.version_id
        join kb_source s on s.id = v.source_id
      where v.status = 'published' and c.embedding is not null
        and s.jurisdiction = any(${jurs}::text[])
        and (${input.includeBills} or s.kind <> 'bill')
      order by c.embedding <=> ${vec}::vector, c.id
      limit ${CANDIDATES}
    `);
    const vecRows = vecResult.rows.map((r) => vecChatRows.parse(r));
    bestSimilarityBp = vecRows[0]?.sim_bp ?? null;
    lists.push(vecRows.map((r) => r.id));
  }

  const fused = fuseRankings(lists).slice(0, input.limit);
  return { mode, results: await hydrate(fused), lexemeCount, bestLexemeMatches, bestSimilarityBp };
}
