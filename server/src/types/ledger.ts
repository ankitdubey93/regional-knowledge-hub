import { z } from 'zod';
import type { ledgerAccount, ledgerImport } from '../db/schema';
import { ACCOUNT_CLASSES } from '../../../src/utils/accountClasses';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const column = z.number().int().min(0).max(200);
export const tbMappingSchema = z.object({
  headerRow: z.number().int().min(0).max(1000),
  code: column.nullable(), name: column, type: column.nullable(),
  debit: column.nullable(), credit: column.nullable(), balance: column.nullable(),
});
export const tbCommitSchema = z.object({
  csvText: z.string().min(1).max(5_000_000),
  originalName: z.string().trim().min(1).max(200),
  source: z.enum(['xero', 'qbo', 'myob', 'other']),
  currency: z.enum(['AUD', 'GBP']),
  asAt: isoDate,
  periodStart: isoDate,
  mapping: tbMappingSchema,
  classes: z.record(z.string().max(200), z.enum(ACCOUNT_CLASSES)).default({}),
}).refine((v) => v.periodStart <= v.asAt, { message: 'The period start must be on or before the as-at date', path: ['periodStart'] });
export type TbCommitInput = z.infer<typeof tbCommitSchema>;
export const accountPatchSchema = z.object({ accountClass: z.enum(ACCOUNT_CLASSES) });
export const reportQuerySchema = z.object({ importId: z.uuid(), compareImportId: z.uuid().optional() });
export const CURRENCY_MESSAGES = {
  AU: 'Currency must be AUD for an Australian entity',
  UK: 'Currency must be GBP for a UK entity',
} as const;
export type LedgerImport = typeof ledgerImport.$inferSelect;
export type LedgerAccount = typeof ledgerAccount.$inferSelect;
