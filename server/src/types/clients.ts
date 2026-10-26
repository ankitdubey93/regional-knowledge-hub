import { z } from 'zod';
import type { client } from '../db/schema';

export const jurisdictionSchema = z.enum(['AU', 'UK', 'AU+UK']);

const fields = {
  name: z.string().trim().min(1).max(120),
  jurisdiction: jurisdictionSchema,
  notes: z.string().max(2000),
  entities: z.array(z.string().trim().min(2).max(120)).max(50),
};

// Unknown keys (such as orgId) are stripped: the firm always comes from the session.
export const clientInputSchema = z.object({ ...fields, notes: fields.notes.default(''), entities: fields.entities.default([]) });
// No defaults here, so a PATCH never blanks a field it did not mention.
export const clientPatchSchema = z
  .object(fields)
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: 'Nothing to update' });

export type ClientInput = z.infer<typeof clientInputSchema>;
export type ClientPatch = z.infer<typeof clientPatchSchema>;
export type Client = typeof client.$inferSelect;
