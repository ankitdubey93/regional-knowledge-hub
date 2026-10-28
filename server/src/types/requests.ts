import { z } from 'zod';
import { REQUEST_STATUSES, type RequestSource, type RequestStatus } from '@chub/shared/utils/intake';

/** The wire shape of a document request. Dates are yyyy-mm-dd; timestamps are ISO strings. */
export interface RequestView {
  id: string;
  clientId: string;
  itemId: string;
  label: string;
  why: string;
  docId: string | null;
  sourceUrl: string | null;
  verifiedOn: string | null;
  dueOn: string | null;
  status: RequestStatus;
  source: RequestSource;
  obligationId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const requestCreateSchema = z.object({
  label: z.string().trim().min(1).max(200),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullable(),
});
export type RequestCreate = z.infer<typeof requestCreateSchema>;

export const requestPatchSchema = z.object({ status: z.enum(REQUEST_STATUSES) });
export type RequestPatch = z.infer<typeof requestPatchSchema>;
