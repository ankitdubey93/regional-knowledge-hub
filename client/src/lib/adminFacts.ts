import type { Fact, Jurisdiction } from '@chub/shared/data/schemas';
import { apiJson } from './api';

// Mirrors server/src/types/facts.ts; dates arrive as strings over JSON.

export interface FactUsage {
  sourceId: string;
  title: string;
  sitePath: string | null;
}

export interface AdminFactRow {
  key: string;
  fact: Fact;
  updatedBy: string;
  updatedAt: string;
  docCount: number;
}

export interface FactHistoryRow {
  id: string;
  fact: Fact;
  changeNote: string;
  changedBy: string;
  changedAt: string;
}

export interface AdminFactDetail {
  key: string;
  fact: Fact;
  updatedBy: string;
  updatedAt: string;
  docs: FactUsage[];
  history: FactHistoryRow[];
}

export interface FactSaveResult {
  detail: AdminFactDetail;
  rechunked: number;
  embedded: number | null;
}

export interface FactWrite {
  fact: Fact;
  changeNote: string;
  confirmVerified: boolean;
}

export function listAdminFacts(q: string, jurisdiction?: Jurisdiction): Promise<{ facts: AdminFactRow[] }> {
  const params = new URLSearchParams({ q });
  if (jurisdiction !== undefined) params.set('jurisdiction', jurisdiction);
  return apiJson<{ facts: AdminFactRow[] }>(`/admin/facts?${params.toString()}`);
}

export function getAdminFact(key: string): Promise<{ fact: AdminFactDetail }> {
  return apiJson<{ fact: AdminFactDetail }>(`/admin/facts/${encodeURIComponent(key)}`);
}

export function createAdminFact(key: string, body: FactWrite): Promise<FactSaveResult> {
  return apiJson<FactSaveResult>('/admin/facts', { method: 'POST', body: { key, ...body } });
}

export function updateAdminFact(key: string, body: FactWrite): Promise<FactSaveResult> {
  return apiJson<FactSaveResult>(`/admin/facts/${encodeURIComponent(key)}`, { method: 'PATCH', body });
}
