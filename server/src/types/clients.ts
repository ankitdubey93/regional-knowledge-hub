import { z } from 'zod';
import { CALENDAR_TIMEZONES } from '@chub/shared/utils/deadlines';
import type { client } from '../db/schema';

export const jurisdictionSchema = z.enum(['AU', 'UK', 'AU+UK']);
export const entityTypeSchema = z.enum(['sole_trader', 'partnership', 'company', 'trust', 'llp']);
export const taxPeriodSchema = z.enum(['monthly', 'quarterly', 'annual']);
export type EntityType = z.infer<typeof entityTypeSchema>;
export type TaxPeriod = z.infer<typeof taxPeriodSchema>;

export const PROFILE_MESSAGES = {
  trustOutsideAu: 'A trust is an Australian entity type; set the jurisdiction to AU or AU+UK',
  llpOutsideUk: 'An LLP is a UK entity type; set the jurisdiction to UK or AU+UK',
  periodMissing: 'Choose a return period when registered for GST or VAT',
  periodWithoutRegistration: 'Clear the return period when not registered for GST or VAT',
} as const;

export interface ProfileFields {
  jurisdiction: z.infer<typeof jurisdictionSchema>;
  entityType: EntityType | null;
  taxRegistered: boolean;
  taxPeriod: TaxPeriod | null;
}

/** Cross-field rules shared by POST (zod) and PATCH (service, on the merged row). Empty array = valid. */
export function profileProblems(p: ProfileFields): string[] {
  const problems: string[] = [];
  if (p.entityType === 'trust' && p.jurisdiction === 'UK') problems.push(PROFILE_MESSAGES.trustOutsideAu);
  if (p.entityType === 'llp' && p.jurisdiction === 'AU') problems.push(PROFILE_MESSAGES.llpOutsideUk);
  if (p.taxRegistered && p.taxPeriod === null) problems.push(PROFILE_MESSAGES.periodMissing);
  if (!p.taxRegistered && p.taxPeriod !== null) problems.push(PROFILE_MESSAGES.periodWithoutRegistration);
  return problems;
}

const fields = {
  name: z.string().trim().min(1).max(120),
  jurisdiction: jurisdictionSchema,
  notes: z.string().max(2000),
  entities: z.array(z.string().trim().min(2).max(120)).max(50),
  entityType: entityTypeSchema,
  taxRegistered: z.boolean(),
  taxPeriod: taxPeriodSchema.nullable(),
  fyEndMonth: z.number().int().min(1).max(12),
  timezone: z.enum(CALENDAR_TIMEZONES).nullable(),
  registeredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  vatStaggerMonth: z.number().int().min(1).max(12).nullable(),
  mtdItsa: z.boolean(),
};

// Unknown keys (such as orgId or isSelf) are stripped: the firm always comes from the session.
export const clientInputSchema = z
  .object({
    ...fields,
    notes: fields.notes.default(''),
    entities: fields.entities.default([]),
    taxRegistered: fields.taxRegistered.default(false),
    taxPeriod: fields.taxPeriod.default(null),
    timezone: fields.timezone.default(null),
    registeredOn: fields.registeredOn.default(null),
    vatStaggerMonth: fields.vatStaggerMonth.default(null),
    mtdItsa: fields.mtdItsa.default(false),
  })
  .superRefine((v, ctx) => {
    for (const message of profileProblems(v)) ctx.addIssue({ code: 'custom', message });
  });
// No defaults here, so a PATCH never blanks a field it did not mention.
export const clientPatchSchema = z
  .object(fields)
  .partial()
  .refine((o) => Object.keys(o).length > 0, { message: 'Nothing to update' });

export type ClientInput = z.infer<typeof clientInputSchema>;
export type ClientPatch = z.infer<typeof clientPatchSchema>;
export type Client = typeof client.$inferSelect;
