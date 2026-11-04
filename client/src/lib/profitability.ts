// Profitability (B3). Wire shapes mirror server/src/types/profitability.ts. Figures arrive computed; the page only displays them.
import { z } from 'zod';
import { CURRENCIES } from '@chub/shared/utils/invoice';
import type { Currency } from '@chub/shared/utils/money';
import { apiJson } from './api';

const totals = {
  billedCents: z.number().int(),
  minutes: z.number().int(),
  costCents: z.number().int().nullable(),
  standardCents: z.number().int().nullable(),
  realisationBp: z.number().int().nullable(),
  marginBp: z.number().int().nullable(),
  missingCostMinutes: z.number().int(),
  missingRateMinutes: z.number().int(),
};
export const engagementProfitSchema = z.object({ engagementId: z.string(), title: z.string(), ...totals });
export const entityProfitSchema = z.object({
  clientId: z.string(), clientName: z.string(), invoiceCount: z.number().int(), ...totals,
  engagements: z.array(engagementProfitSchema),
});
export const profitReportSchema = z.object({
  currency: z.enum(CURRENCIES), from: z.string(), to: z.string(), entities: z.array(entityProfitSchema),
});
export type ProfitReport = z.infer<typeof profitReportSchema>;

/** GET /profitability?from&to[&currency] → { report }; returns report. */
export async function getProfitability(q: { from: string; to: string; currency?: Currency }): Promise<ProfitReport> {
  const params = new URLSearchParams({ from: q.from, to: q.to });
  if (q.currency !== undefined) params.set('currency', q.currency);
  const body = await apiJson<unknown>(`/profitability?${params.toString()}`);
  return z.object({ report: profitReportSchema }).parse(body).report;
}
