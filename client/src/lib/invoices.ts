// Invoices (B2). Wire shapes mirror server/src/types/invoices.ts. Money arrives as integer cents; the page only displays it.
import { z } from 'zod';
import {
  CURRENCIES,
  INVOICE_STATUSES,
  LINE_KINDS,
  TAX_SCHEMES,
  TAX_TREATMENTS,
  type InvoiceStatus,
  type TaxTreatment,
} from '@chub/shared/utils/invoice';
import { apiDelete, apiJson } from './api';

export const invoiceLineSchema = z.object({
  id: z.string(),
  position: z.number().int(),
  kind: z.enum(LINE_KINDS),
  description: z.string(),
  timeEntryId: z.string().nullable(),
  minutes: z.number().int().nullable(),
  unitCents: z.number().int(),
  amountCents: z.number().int(),
  taxTreatment: z.enum(TAX_TREATMENTS),
  taxCents: z.number().int(),
});
export type InvoiceLine = z.infer<typeof invoiceLineSchema>;

const sellerSchema = z.object({
  jurisdiction: z.enum(['AU', 'UK']).nullable(),
  name: z.string().nullable(),
  address: z.string().nullable(),
  taxNumber: z.string().nullable(),
  paymentDetails: z.string(),
});

export const invoiceViewSchema = z.object({
  id: z.string(),
  number: z.number().int().nullable(),
  displayNumber: z.string().nullable(),
  status: z.enum(INVOICE_STATUSES),
  clientId: z.string(),
  clientName: z.string(),
  clientJurisdiction: z.enum(['AU', 'UK', 'AU+UK']),
  buyerName: z.string(),
  engagementId: z.string().nullable(),
  engagementTitle: z.string().nullable(),
  currency: z.enum(CURRENCIES),
  homeCurrency: z.enum(CURRENCIES).nullable(),
  needsFx: z.boolean(),
  taxScheme: z.enum(TAX_SCHEMES),
  taxFactKey: z.string().nullable(),
  taxRateBp: z.number().int(),
  rateFactVerifiedOn: z.string().nullable(),
  periodFrom: z.string(),
  periodTo: z.string(),
  buyerAddress: z.string(),
  buyerTaxNumber: z.string(),
  reference: z.string(),
  notes: z.string(),
  issuedOn: z.string().nullable(),
  dueOn: z.string().nullable(),
  seller: sellerSchema,
  subtotalCents: z.number().int(),
  taxCents: z.number().int(),
  totalCents: z.number().int(),
  noTaxSubtotalCents: z.number().int(),
  fxRateMicros: z.number().int().nullable(),
  fxRateDate: z.string().nullable(),
  fxRateSource: z.string().nullable(),
  taxHomeCents: z.number().int().nullable(),
  totalHomeCents: z.number().int().nullable(),
  voidedAt: z.string().nullable(),
  voidReason: z.string().nullable(),
  allowedTreatments: z.array(z.enum(TAX_TREATMENTS)),
  canEdit: z.boolean(),
  canIssue: z.boolean(),
  canVoid: z.boolean(),
  lines: z.array(invoiceLineSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type InvoiceView = z.infer<typeof invoiceViewSchema>;

export const invoiceSummarySchema = z.object({
  id: z.string(),
  number: z.number().int().nullable(),
  displayNumber: z.string().nullable(),
  status: z.enum(INVOICE_STATUSES),
  clientId: z.string(),
  clientName: z.string(),
  currency: z.enum(CURRENCIES),
  totalCents: z.number().int(),
  issuedOn: z.string().nullable(),
  dueOn: z.string().nullable(),
  createdAt: z.string(),
});
export type InvoiceSummary = z.infer<typeof invoiceSummarySchema>;

/** GET /invoices?status&clientId (each only when set, in that order) → { invoices }. */
export async function listInvoices(f: { status?: InvoiceStatus; clientId?: string }): Promise<InvoiceSummary[]> {
  const params = new URLSearchParams();
  if (f.status !== undefined) params.set('status', f.status);
  if (f.clientId !== undefined) params.set('clientId', f.clientId);
  const query = params.toString();
  const body = await apiJson<unknown>(query === '' ? '/invoices' : `/invoices?${query}`);
  return z.object({ invoices: z.array(invoiceSummarySchema) }).parse(body).invoices;
}

/** POST /invoices → { invoice } (201). */
export async function createDraft(input: { clientId: string; from: string; to: string; engagementId: string | null }): Promise<InvoiceView> {
  const body = await apiJson<unknown>('/invoices', { method: 'POST', body: input });
  return z.object({ invoice: invoiceViewSchema }).parse(body).invoice;
}

/** GET /invoices/:id → { invoice }. */
export async function getInvoice(id: string): Promise<InvoiceView> {
  const body = await apiJson<unknown>(`/invoices/${encodeURIComponent(id)}`);
  return z.object({ invoice: invoiceViewSchema }).parse(body).invoice;
}

/** PATCH /invoices/:id → { invoice }. */
export async function patchInvoice(
  id: string,
  patch: {
    buyerAddress?: string;
    buyerTaxNumber?: string;
    reference?: string;
    notes?: string;
    fx?: { rateMicros: number; date: string; source: string } | null;
  },
): Promise<InvoiceView> {
  const body = await apiJson<unknown>(`/invoices/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
  return z.object({ invoice: invoiceViewSchema }).parse(body).invoice;
}

/** POST /invoices/:id/lines → { invoice }. */
export async function addLine(
  id: string,
  input: { description: string; amountCents: number; taxTreatment: TaxTreatment },
): Promise<InvoiceView> {
  const body = await apiJson<unknown>(`/invoices/${encodeURIComponent(id)}/lines`, { method: 'POST', body: input });
  return z.object({ invoice: invoiceViewSchema }).parse(body).invoice;
}

/** PATCH /invoices/:id/lines/:lineId → { invoice }. */
export async function patchLine(
  id: string,
  lineId: string,
  patch: Partial<{ description: string; amountCents: number; taxTreatment: TaxTreatment }>,
): Promise<InvoiceView> {
  const body = await apiJson<unknown>(`/invoices/${encodeURIComponent(id)}/lines/${encodeURIComponent(lineId)}`, {
    method: 'PATCH',
    body: patch,
  });
  return z.object({ invoice: invoiceViewSchema }).parse(body).invoice;
}

/** DELETE /invoices/:id/lines/:lineId → { invoice }. */
export async function deleteLine(id: string, lineId: string): Promise<InvoiceView> {
  const body = await apiJson<unknown>(`/invoices/${encodeURIComponent(id)}/lines/${encodeURIComponent(lineId)}`, {
    method: 'DELETE',
  });
  return z.object({ invoice: invoiceViewSchema }).parse(body).invoice;
}

/** DELETE /invoices/:id (204). */
export async function deleteInvoice(id: string): Promise<void> {
  await apiDelete(`/invoices/${encodeURIComponent(id)}`);
}

/** POST /invoices/:id/issue { issuedOn } → { invoice }. */
export async function issueInvoice(id: string, issuedOn: string): Promise<InvoiceView> {
  const body = await apiJson<unknown>(`/invoices/${encodeURIComponent(id)}/issue`, { method: 'POST', body: { issuedOn } });
  return z.object({ invoice: invoiceViewSchema }).parse(body).invoice;
}

/** POST /invoices/:id/void { reason } → { invoice }. */
export async function voidInvoice(id: string, reason: string): Promise<InvoiceView> {
  const body = await apiJson<unknown>(`/invoices/${encodeURIComponent(id)}/void`, { method: 'POST', body: { reason } });
  return z.object({ invoice: invoiceViewSchema }).parse(body).invoice;
}

/** The CSV download URL for an issued invoice. */
export function invoiceCsvUrl(id: string): string {
  return `/api/invoices/${encodeURIComponent(id)}/csv`;
}
