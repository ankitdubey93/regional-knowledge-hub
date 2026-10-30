import { z } from 'zod';

/** The version of the legal drafts a user accepts at sign-up. Change it whenever any legal page changes. */
export const LEGAL_VERSION = '2026-10-31-draft';

export const LEGAL_DOCS = ['privacy', 'terms', 'processing', 'subprocessors'] as const;
export type LegalDoc = (typeof LEGAL_DOCS)[number];

export const REGION_LABEL = { AU: 'Australia', UK: 'the United Kingdom' } as const;

export const deploymentInfoSchema = z.object({
  region: z.enum(['AU', 'UK']),
  otherRegionUrl: z.url().nullable(),
  legalVersion: z.string().min(1),
});
export type DeploymentInfo = z.infer<typeof deploymentInfoSchema>;
