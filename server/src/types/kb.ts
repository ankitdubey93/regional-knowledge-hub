import { z } from 'zod';
import { BILL_STATUSES, INPUT_METHODS, KB_JURISDICTIONS, KB_KINDS, type KbIssue, type kbSource, type kbVersion } from '../db/schema';
export type { KbIssue };
export type KbSource = typeof kbSource.$inferSelect;
export type KbVersionRow = typeof kbVersion.$inferSelect;
export type InputMethod = (typeof INPUT_METHODS)[number];

const isoDate = z.iso.date();
export const sourceInputSchema = z.object({
  jurisdiction: z.enum(KB_JURISDICTIONS),
  kind: z.enum(KB_KINDS).exclude(['curriculum']),
  title: z.string().trim().min(2).max(300),
  citation: z.string().trim().min(2).max(300),
  officialUrl: z.url().max(2000).nullable().default(null),
  publisher: z.string().trim().max(200).default(''),
  billStatus: z.enum(BILL_STATUSES).nullable().default(null),
  enactedAsSourceId: z.uuid().nullable().default(null),
});
// Patch schemas are written out without defaults: zod's partial() keeps .default(), which would reset omitted fields to null.
export const sourcePatchSchema = z.object({
  jurisdiction: z.enum(KB_JURISDICTIONS).optional(),
  kind: z.enum(KB_KINDS).exclude(['curriculum']).optional(),
  title: z.string().trim().min(2).max(300).optional(),
  citation: z.string().trim().min(2).max(300).optional(),
  officialUrl: z.url().max(2000).nullable().optional(),
  publisher: z.string().trim().max(200).optional(),
  billStatus: z.enum(BILL_STATUSES).nullable().optional(),
  enactedAsSourceId: z.uuid().nullable().optional(),
}).refine((o) => Object.keys(o).length > 0, { message: 'Nothing to update' });
export const sourceFilterSchema = z.object({
  jurisdiction: z.enum(KB_JURISDICTIONS).optional(),
  kind: z.enum(KB_KINDS).optional(),
  q: z.string().trim().max(200).default(''),
});
export const versionMetaSchema = z.object({
  label: z.string().trim().min(1).max(200),
  effectiveFrom: isoDate.nullable().default(null),
  effectiveTo: isoDate.nullable().default(null),
  retrievedOn: isoDate,
  changeNote: z.string().trim().max(2000).default(''),
});
export const MAX_BODY_CHARS = 3_000_000;
export const draftCreateSchema = z.discriminatedUnion('method', [
  versionMetaSchema.extend({ method: z.literal('paste'), text: z.string().min(1).max(MAX_BODY_CHARS) }),
  versionMetaSchema.extend({ method: z.literal('url'), url: z.url().max(2000) }),
  versionMetaSchema.extend({ method: z.literal('copy') }),
]);
export const versionPatchSchema = z.object({
  label: z.string().trim().min(1).max(200).optional(),
  effectiveFrom: isoDate.nullable().optional(),
  effectiveTo: isoDate.nullable().optional(),
  retrievedOn: isoDate.optional(),
  changeNote: z.string().trim().max(2000).optional(),
  bodyMd: z.string().min(1).max(MAX_BODY_CHARS).optional(),
})
  .refine((o) => Object.keys(o).length > 0, { message: 'Nothing to update' });
export const searchInputSchema = z.object({
  query: z.string().trim().min(3).max(500),
  jurisdiction: z.enum(['AU', 'UK']).optional(),
  includeBills: z.boolean().default(true),
  limit: z.number().int().min(1).max(20).default(8),
});
export type SourceInput = z.infer<typeof sourceInputSchema>;
export type SourcePatch = z.infer<typeof sourcePatchSchema>;
export type SourceFilter = z.infer<typeof sourceFilterSchema>;
export type VersionMeta = z.infer<typeof versionMetaSchema>;
export type VersionPatch = z.infer<typeof versionPatchSchema>;
export type SearchInput = z.infer<typeof searchInputSchema>;
export interface DraftText { method: InputMethod; text: string; originalName: string | null }

export interface KbSourceListItem extends KbSource {
  publishedVersion: { id: string; label: string; effectiveFrom: string | null } | null;
  draftCount: number;
}
export interface KbVersionSummary {
  id: string; label: string; status: KbVersionRow['status']; effectiveFrom: string | null; effectiveTo: string | null;
  retrievedOn: string; inputMethod: InputMethod; chunkCount: number; createdAt: Date; publishedAt: Date | null;
}
export interface KbChunkView {
  id: string; ordinal: number; headingPath: string[]; provisionRef: string | null; tokens: number; text: string; embedded: boolean;
}
export interface KbDiff { against: { id: string; label: string } | null; added: string[]; changed: string[]; removed: string[]; unchanged: number }
export interface KbVersionDetail { version: KbVersionRow; source: KbSource; chunks: KbChunkView[]; diff: KbDiff }
export interface KbSearchResult {
  chunkId: string; rank: number; score: number; ftsRank: number | null; vectorRank: number | null;
  sourceId: string; title: string; citation: string; kind: KbSource['kind']; jurisdiction: KbSource['jurisdiction'];
  billStatus: KbSource['billStatus']; officialUrl: string | null; sitePath: string | null;
  versionId: string; versionLabel: string; effectiveFrom: string | null;
  headingPath: string[]; provisionRef: string | null; text: string;
}
export interface KbSearchResponse { mode: 'fts' | 'hybrid'; results: KbSearchResult[] }
export interface KbOverviewCounts { sources: number; publishedVersions: number; drafts: number; chunksWithoutEmbedding: number }
