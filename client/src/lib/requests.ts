import { z } from 'zod';
import { REQUEST_SOURCES, REQUEST_STATUSES, type RequestStatus } from '@chub/shared/utils/intake';
import { apiDelete, apiJson } from './api';

// Document requests (C2). Wire shapes mirror server/src/types/requests.ts.

export const requestViewSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  itemId: z.string(),
  label: z.string(),
  why: z.string(),
  docId: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  verifiedOn: z.string().nullable(),
  dueOn: z.string().nullable(),
  status: z.enum(REQUEST_STATUSES),
  source: z.enum(REQUEST_SOURCES),
  obligationId: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RequestView = z.infer<typeof requestViewSchema>;

export async function listRequests(clientId: string): Promise<RequestView[]> {
  const body = await apiJson<{ requests: unknown }>(`/clients/${encodeURIComponent(clientId)}/requests`);
  return z.array(requestViewSchema).parse(body.requests);
}

export async function generateRequests(clientId: string): Promise<{ created: number; requests: RequestView[] }> {
  const body = await apiJson<unknown>(`/clients/${encodeURIComponent(clientId)}/requests/generate`, { method: 'POST', body: {} });
  return z
    .object({ created: z.number().int(), requests: z.array(requestViewSchema) })
    .parse(body);
}

export async function addRequest(clientId: string, input: { label: string; dueOn: string | null }): Promise<RequestView> {
  const body = await apiJson<{ request: unknown }>(`/clients/${encodeURIComponent(clientId)}/requests`, { method: 'POST', body: input });
  return requestViewSchema.parse(body.request);
}

export async function setRequestStatus(clientId: string, requestId: string, status: RequestStatus): Promise<RequestView> {
  const body = await apiJson<{ request: unknown }>(
    `/clients/${encodeURIComponent(clientId)}/requests/${encodeURIComponent(requestId)}`,
    { method: 'PATCH', body: { status } },
  );
  return requestViewSchema.parse(body.request);
}

export async function deleteRequest(clientId: string, requestId: string): Promise<void> {
  await apiDelete(`/clients/${encodeURIComponent(clientId)}/requests/${encodeURIComponent(requestId)}`);
}
