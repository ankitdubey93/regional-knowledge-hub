// Billing settings, rate cards and entity pricing (B2). Wire shapes mirror server/src/types/billing.ts.
import { z } from 'zod';
import { CURRENCIES, PRICING_MODELS, TAX_SCHEMES, type PricingModel } from '@chub/shared/utils/invoice';
import type { Currency } from '@chub/shared/utils/money';
import { apiJson } from './api';

export const billingSettingsSchema = z.object({
  jurisdiction: z.enum(['AU', 'UK']).nullable(),
  legalName: z.string().nullable(),
  address: z.string().nullable(),
  taxRegistered: z.boolean(),
  taxNumber: z.string().nullable(),
  paymentDays: z.number().int(),
  paymentDetails: z.string(),
  accountCode: z.string(),
  scheme: z.enum(TAX_SCHEMES).nullable(),
  homeCurrency: z.enum(CURRENCIES).nullable(),
});
export type BillingSettings = z.infer<typeof billingSettingsSchema>;

export const rateCardSchema = z.object({
  userId: z.string().nullable(),
  userName: z.string(),
  currency: z.enum(CURRENCIES),
  centsPerHour: z.number().int(),
});
export type RateCard = z.infer<typeof rateCardSchema>;

export const pricingSchema = z.object({
  clientId: z.string(),
  model: z.enum(PRICING_MODELS),
  currency: z.enum(CURRENCIES),
  fixedCents: z.number().int().nullable(),
  retainerCents: z.number().int().nullable(),
});
export type Pricing = z.infer<typeof pricingSchema>;

/** GET /billing/settings → { settings, canEdit }. */
export async function getBillingSettings(): Promise<{ settings: BillingSettings; canEdit: boolean }> {
  const body = await apiJson<unknown>('/billing/settings');
  return z.object({ settings: billingSettingsSchema, canEdit: z.boolean() }).parse(body);
}

/** PATCH /billing/settings with the given fields → { settings }; returns settings. */
export async function saveBillingSettings(
  patch: Partial<Omit<BillingSettings, 'scheme' | 'homeCurrency'>>,
): Promise<BillingSettings> {
  const body = await apiJson<unknown>('/billing/settings', { method: 'PATCH', body: patch });
  return z.object({ settings: billingSettingsSchema }).parse(body).settings;
}

/** GET /billing/rates → { rates, members }. */
export async function listRates(): Promise<{ rates: RateCard[]; members: { userId: string; name: string }[] }> {
  const body = await apiJson<unknown>('/billing/rates');
  return z
    .object({
      rates: z.array(rateCardSchema),
      members: z.array(z.object({ userId: z.string(), name: z.string() })),
    })
    .parse(body);
}

/** PATCH /billing/rates { userId, currency, centsPerHour } → { rates }; returns rates. */
export async function setRate(input: { userId: string | null; currency: Currency; centsPerHour: number | null }): Promise<RateCard[]> {
  const body = await apiJson<unknown>('/billing/rates', { method: 'PATCH', body: input });
  return z.object({ rates: z.array(rateCardSchema) }).parse(body).rates;
}

/** GET /clients/:clientId/pricing → { pricing, canEdit }; pricing is null when unset. */
export async function getPricing(clientId: string): Promise<{ pricing: Pricing | null; canEdit: boolean }> {
  const body = await apiJson<unknown>(`/clients/${encodeURIComponent(clientId)}/pricing`);
  return z.object({ pricing: pricingSchema.nullable(), canEdit: z.boolean() }).parse(body);
}

/** PATCH /clients/:clientId/pricing → { pricing }; returns pricing. */
export async function savePricing(
  clientId: string,
  input: { model: PricingModel; currency: Currency; fixedCents: number | null; retainerCents: number | null },
): Promise<Pricing> {
  const body = await apiJson<unknown>(`/clients/${encodeURIComponent(clientId)}/pricing`, { method: 'PATCH', body: input });
  return z.object({ pricing: pricingSchema }).parse(body).pricing;
}
