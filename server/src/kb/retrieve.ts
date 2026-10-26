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
  if (fused.length === 0) return { mode, results: [] };

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
  return { mode, results };
}
