import { z } from 'zod';
import type { Fact, SiteDoc } from '../../../src/data/schemas';
import { BILL_STATUSES, KB_JURISDICTIONS } from '../db/schema';

export const LAW_KINDS = ['act', 'regulation', 'bill', 'ruling', 'standard'] as const;
export const lawQuerySchema = z.object({ jurisdiction: z.enum(KB_JURISDICTIONS).optional(), kind: z.enum(LAW_KINDS).optional() });

export interface SitePayload {
  facts: Record<string, Fact>;
  docs: SiteDoc[];
}

export interface LawListItem {
  id: string;
  title: string;
  citation: string;
  jurisdiction: (typeof KB_JURISDICTIONS)[number];
  kind: (typeof LAW_KINDS)[number];
  publisher: string;
  officialUrl: string | null;
  billStatus: (typeof BILL_STATUSES)[number] | null;
  enactedAs: { id: string; title: string } | null;
  versionLabel: string;
  effectiveFrom: string | null;
  retrievedOn: string;
  publishedAt: string;
}

export interface LawDetail extends LawListItem {
  bodyMd: string;
}
