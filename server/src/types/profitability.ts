import { z } from 'zod';
import { CURRENCIES } from '@chub/shared/utils/invoice';
import type { Currency } from '@chub/shared/utils/money';
import type { EntityProfit } from '@chub/shared/utils/profitability';
import { realDate } from './time';

export const profitQuerySchema = z
  .object({ from: realDate, to: realDate, currency: z.enum(CURRENCIES).optional() })
  .refine((v) => v.from <= v.to, { message: 'From must be on or before To' });
export type ProfitQuery = z.infer<typeof profitQuerySchema>;
export interface ProfitReportView { currency: Currency; from: string; to: string; entities: EntityProfit[] }
