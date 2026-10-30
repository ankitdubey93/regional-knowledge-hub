import { z } from 'zod';
import { apiDelete, apiJson, failure } from './api';

// Client request links (C3). Wire shapes mirror server/src/types/requestLinks.ts.

export const REQUEST_LINK_STATUSES = ['active', 'paused', 'complete', 'expired', 'revoked'] as const;

export const LINK_STATUS_LABELS: Record<(typeof REQUEST_LINK_STATUSES)[number], string> = {
  active: 'Active',
  paused: 'Paused',
  complete: 'All received',
  expired: 'Expired',
  revoked: 'Revoked',
};

export const requestLinkViewSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  recipientEmail: z.string(),
  requestIds: z.array(z.string()),
  expiresAt: z.string(),
  revokedAt: z.string().nullable(),
  paused: z.boolean(),
  cadenceDays: z.array(z.number().int()),
  nudgeCount: z.number().int(),
  lastNudgedAt: z.string().nullable(),
  openItems: z.number().int(),
  status: z.enum(REQUEST_LINK_STATUSES),
  createdBy: z.string(),
  createdAt: z.string(),
});
export type RequestLinkView = z.infer<typeof requestLinkViewSchema>;

export const publicItemSchema = z.object({ id: z.string(), label: z.string(), received: z.boolean() });
export type PublicItem = z.infer<typeof publicItemSchema>;

export const publicRequestSchema = z.object({
  firmName: z.string(),
  expiresOn: z.string(),
  items: z.array(publicItemSchema),
});
export type PublicRequest = z.infer<typeof publicRequestSchema>;

/** Reads "3, 7, 14" as [3, 7, 14]. Empty means no reminders. Null when the text is not a valid cadence. Pure. */
export function parseCadence(text: string): number[] | null {
  const trimmed = text.trim();
  if (trimmed === '') return [];
  const parts = trimmed.split(',').map((p) => p.trim());
  const days: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const day = Number(part);
    if (day < 1 || day > 89) return null;
    days.push(day);
  }
  if (days.length > 5) return null;
  for (let i = 1; i < days.length; i += 1) {
    if (days[i]! <= days[i - 1]!) return null;
  }
  return days;
}

export async function listRequestLinks(clientId: string): Promise<RequestLinkView[]> {
  const body = await apiJson<{ links: unknown }>(`/clients/${encodeURIComponent(clientId)}/request-links`);
  return z.array(requestLinkViewSchema).parse(body.links);
}

export async function createRequestLink(
  clientId: string,
  input: { recipientEmail: string; requestIds: string[]; expiresInDays: number; cadenceDays: number[] },
): Promise<{ link: RequestLinkView; url: string; emailSent: boolean }> {
  const body = await apiJson<unknown>(`/clients/${encodeURIComponent(clientId)}/request-links`, { method: 'POST', body: input });
  return z.object({ link: requestLinkViewSchema, url: z.string(), emailSent: z.boolean() }).parse(body);
}

export async function setRequestLinkPaused(clientId: string, linkId: string, paused: boolean): Promise<RequestLinkView> {
  const body = await apiJson<{ link: unknown }>(
    `/clients/${encodeURIComponent(clientId)}/request-links/${encodeURIComponent(linkId)}`,
    { method: 'PATCH', body: { paused } },
  );
  return requestLinkViewSchema.parse(body.link);
}

export async function revokeRequestLink(clientId: string, linkId: string): Promise<void> {
  await apiDelete(`/clients/${encodeURIComponent(clientId)}/request-links/${encodeURIComponent(linkId)}`);
}

export async function getPublicRequest(token: string): Promise<PublicRequest> {
  const body = await apiJson<{ request: unknown }>(`/public/requests/${encodeURIComponent(token)}`);
  return publicRequestSchema.parse(body.request);
}

// A raw fetch, because apiJson only sends JSON. Same shape as uploadDocument in documents.ts. No account, no session cookie needed.
export async function uploadToRequest(token: string, requestId: string, file: File): Promise<PublicItem> {
  const res = await fetch(
    `/api/public/requests/${encodeURIComponent(token)}/items/${encodeURIComponent(requestId)}/upload`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) },
      body: file,
    },
  );
  if (!res.ok) throw await failure(res);
  const body: unknown = await res.json();
  return z.object({ item: publicItemSchema }).parse(body).item;
}
