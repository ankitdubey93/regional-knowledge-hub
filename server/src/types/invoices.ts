import { z } from 'zod';
import type { Currency } from '@chub/shared/utils/money';
import {
  INVOICE_STATUSES, MAX_FX_RATE_MICROS, MAX_LINE_CENTS, TAX_TREATMENTS,
  type BillingJurisdiction, type InvoiceStatus, type LineKind, type TaxScheme, type TaxTreatment,
} from '@chub/shared/utils/invoice';
import { realDate } from './time';

const nonEmpty = (o: object) => Object.keys(o).length > 0;

export interface InvoiceLineView {
  id: string; position: number; kind: LineKind; description: string; timeEntryId: string | null;
  minutes: number | null; unitCents: number; amountCents: number; taxTreatment: TaxTreatment; taxCents: number;
}
/** Snapshot columns once issued; the firm's current settings while a draft. */
export interface InvoiceSeller {
  jurisdiction: BillingJurisdiction | null; name: string | null; address: string | null; taxNumber: string | null; paymentDetails: string;
}
export interface InvoiceView {
  id: string; number: number | null; displayNumber: string | null; status: InvoiceStatus;
  clientId: string; clientName: string; clientJurisdiction: 'AU' | 'UK' | 'AU+UK'; buyerName: string;
  engagementId: string | null; engagementTitle: string | null;
  currency: Currency; homeCurrency: Currency | null; needsFx: boolean;
  taxScheme: TaxScheme; taxFactKey: string | null; taxRateBp: number; rateFactVerifiedOn: string | null;
  periodFrom: string; periodTo: string;
  buyerAddress: string; buyerTaxNumber: string; reference: string; notes: string;
  issuedOn: string | null; dueOn: string | null; seller: InvoiceSeller;
  subtotalCents: number; taxCents: number; totalCents: number; noTaxSubtotalCents: number;
  fxRateMicros: number | null; fxRateDate: string | null; fxRateSource: string | null;
  taxHomeCents: number | null; totalHomeCents: number | null;
  voidedAt: string | null; voidReason: string | null;
  allowedTreatments: TaxTreatment[]; canEdit: boolean; canIssue: boolean; canVoid: boolean;
  lines: InvoiceLineView[]; createdAt: string; updatedAt: string;
}
export interface InvoiceSummary {
  id: string; number: number | null; displayNumber: string | null; status: InvoiceStatus;
  clientId: string; clientName: string; currency: Currency; totalCents: number;
  issuedOn: string | null; dueOn: string | null; createdAt: string;
}

export const invoiceFilterSchema = z.object({ status: z.enum(INVOICE_STATUSES).optional(), clientId: z.uuid().optional() });
export type InvoiceFilter = z.infer<typeof invoiceFilterSchema>;

export const invoiceCreateSchema = z
  .object({ clientId: z.uuid(), from: realDate, to: realDate, engagementId: z.uuid().nullable().default(null) })
  .refine((v) => v.from <= v.to, { message: 'From must be on or before To' });
export type InvoiceCreate = z.infer<typeof invoiceCreateSchema>;

export const fxSchema = z.object({
  rateMicros: z.number().int().min(1).max(MAX_FX_RATE_MICROS),
  date: realDate,
  source: z.string().trim().min(1).max(200),
});
export const invoicePatchSchema = z
  .object({
    buyerAddress: z.string().trim().max(500),
    buyerTaxNumber: z.string().trim().max(40),
    reference: z.string().trim().max(100),
    notes: z.string().trim().max(1000),
    fx: fxSchema.nullable(),
  })
  .partial()
  .refine(nonEmpty, { message: 'Nothing to update' });
export type InvoicePatch = z.infer<typeof invoicePatchSchema>;

export const lineCreateSchema = z.object({
  description: z.string().trim().min(1).max(500),
  amountCents: z.number().int().min(0).max(MAX_LINE_CENTS),
  taxTreatment: z.enum(TAX_TREATMENTS),
});
export type LineCreate = z.infer<typeof lineCreateSchema>;
export const linePatchSchema = lineCreateSchema.partial().refine(nonEmpty, { message: 'Nothing to update' });
export type LinePatch = z.infer<typeof linePatchSchema>;

export const issueSchema = z.object({ issuedOn: realDate });
export const voidSchema = z.object({ reason: z.string().trim().min(1).max(500) });
