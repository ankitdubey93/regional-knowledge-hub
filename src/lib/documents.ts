import { z } from 'zod';
import { roundDiv } from '../utils/money';
import { apiDelete, apiJson, failure } from './api';

// The entity document library (P4b). Wire shapes mirror server/src/types/documents.ts. Pure fetch wrappers: no keys, no secrets.

export const DOCUMENT_ACCEPT = '.pdf,.docx,.xlsx,.csv,.txt,.md';

export const documentViewSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  originalName: z.string(),
  kind: z.enum(['pdf', 'docx', 'xlsx', 'csv', 'text', 'markdown']),
  byteSize: z.number().int(),
  textChars: z.number().int(),
  truncated: z.boolean(),
  uploadedBy: z.string(),
  createdAt: z.string(),
});

export type DocumentView = z.infer<typeof documentViewSchema>;

export async function listDocuments(clientId: string): Promise<DocumentView[]> {
  const body = await apiJson<{ documents: unknown }>(`/clients/${encodeURIComponent(clientId)}/documents`);
  return z.array(documentViewSchema).parse(body.documents);
}

// A raw fetch, because apiJson only sends JSON. Same base path as apiJson (/api). Errors use the { error } body → ApiError.
export async function uploadDocument(clientId: string, file: File): Promise<DocumentView> {
  const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}/documents`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) },
    body: file,
  });
  if (!res.ok) throw await failure(res);
  const body: unknown = await res.json();
  return z.object({ document: documentViewSchema }).parse(body).document;
}

export async function deleteDocument(clientId: string, id: string): Promise<void> {
  await apiDelete(`/clients/${encodeURIComponent(clientId)}/documents/${encodeURIComponent(id)}`);
}

export function documentFileUrl(clientId: string, id: string): string {
  return `/api/clients/${clientId}/documents/${id}/file`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${roundDiv(n * 10, 1024) / 10} KB`;
  return `${roundDiv(n * 10, 1048576) / 10} MB`;
}
