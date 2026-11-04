import { z } from 'zod';
import type { Currency } from '@chub/shared/utils/money';
import { CURRENCIES, MAX_LINE_CENTS, MAX_RATE_CENTS_PER_HOUR, PRICING_MODELS, type BillingJurisdiction, type PricingModel, type TaxScheme } from '@chub/shared/utils/invoice';

const nonEmpty = (o: object) => Object.keys(o).length > 0;

export interface BillingSettingsView {
  jurisdiction: BillingJurisdiction | null;
  legalName: string | null;
  address: string | null;
  taxRegistered: boolean;
  taxNumber: string | null;
  paymentDays: number;
  paymentDetails: string;
  accountCode: string;
  scheme: TaxScheme | null;       // schemeFor(jurisdiction, taxRegistered), null when jurisdiction is null
  homeCurrency: Currency | null;  // HOME_CURRENCY[jurisdiction], null when jurisdiction is null
}

export const billingSettingsPatchSchema = z
  .object({
    jurisdiction: z.enum(['AU', 'UK']),
    legalName: z.string().trim().min(1).max(200),
    address: z.string().trim().min(1).max(500),
    taxRegistered: z.boolean(),
    taxNumber: z.union([z.string().trim().max(40), z.null()]).transform((v) => (v === null || v === '' ? null : v)),
    paymentDays: z.number().int().min(0).max(120),
    paymentDetails: z.string().trim().max(500),
    accountCode: z.string().trim().regex(/^[A-Za-z0-9.-]{1,10}$/),
  })
  .partial()
  .refine(nonEmpty, { message: 'Nothing to update' });
export type BillingSettingsPatch = z.infer<typeof billingSettingsPatchSchema>;

export interface RateCardView { userId: string | null; userName: string; currency: Currency; centsPerHour: number }
export const rateSetSchema = z.object({
  userId: z.string().min(1).nullable(),
  currency: z.enum(CURRENCIES),
  centsPerHour: z.number().int().min(0).max(MAX_RATE_CENTS_PER_HOUR).nullable(),
});
export type RateSet = z.infer<typeof rateSetSchema>;

export interface PricingView { clientId: string; model: PricingModel; currency: Currency; fixedCents: number | null; retainerCents: number | null }
export const pricingSetSchema = z
  .object({
    model: z.enum(PRICING_MODELS),
    currency: z.enum(CURRENCIES),
    fixedCents: z.number().int().min(0).max(MAX_LINE_CENTS).nullable().default(null),
    retainerCents: z.number().int().min(0).max(MAX_LINE_CENTS).nullable().default(null),
  })
  .refine((v) => v.model !== 'fixed' || v.fixedCents !== null, { message: 'Enter the fixed fee' })
  .refine((v) => v.model !== 'retainer' || v.retainerCents !== null, { message: 'Enter the monthly retainer' });
export type PricingSet = z.infer<typeof pricingSetSchema>;
