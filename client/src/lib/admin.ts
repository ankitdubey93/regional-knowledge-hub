import { ApiError, apiJson } from './api';

export interface AdminWorkspace {
  id: string;
  name: string;
  kind: string;
  role: string;
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  banned: boolean;
  isPlatformAdmin: boolean;
  lastActiveAt: string | null;
  workspaces: AdminWorkspace[];
}

export interface UserList {
  users: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
}

export function listUsers(q: string, page: number): Promise<UserList> {
  const params = new URLSearchParams({ q, page: String(page) });
  return apiJson<UserList>(`/admin/users?${params.toString()}`);
}

export function banUser(id: string, reason: string): Promise<{ ok: true }> {
  return apiJson<{ ok: true }>(`/admin/users/${encodeURIComponent(id)}/ban`, { method: 'POST', body: { reason } });
}

export function unbanUser(id: string): Promise<{ ok: true }> {
  return apiJson<{ ok: true }>(`/admin/users/${encodeURIComponent(id)}/unban`, { method: 'POST' });
}

// ---- Knowledge base (mirrors server/src/types/kb.ts; dates arrive as strings over JSON) ----

export type KbJurisdiction = 'AU' | 'UK' | 'INTL';
export type KbKind = 'act' | 'regulation' | 'bill' | 'ruling' | 'guidance' | 'standard' | 'curriculum';
export type BillStatus = 'introduced' | 'passed' | 'assented' | 'lapsed';
export type VersionStatus = 'draft' | 'published' | 'superseded' | 'withdrawn';
export type InputMethod = 'paste' | 'file' | 'url' | 'copy' | 'seed';

export interface KbIssue {
  level: 'block' | 'warn';
  code: string;
  message: string;
}

export interface KbSource {
  id: string;
  jurisdiction: KbJurisdiction;
  kind: KbKind;
  title: string;
  citation: string;
  officialUrl: string | null;
  publisher: string;
  billStatus: BillStatus | null;
  enactedAsSourceId: string | null;
  sitePath: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface KbSourceListItem extends KbSource {
  publishedVersion: { id: string; label: string; effectiveFrom: string | null } | null;
  draftCount: number;
}

export interface KbVersionSummary {
  id: string;
  label: string;
  status: VersionStatus;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  retrievedOn: string;
  inputMethod: InputMethod;
  chunkCount: number;
  createdAt: string;
  publishedAt: string | null;
}

export interface KbVersion {
  id: string;
  sourceId: string;
  label: string;
  status: VersionStatus;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  retrievedOn: string;
  inputMethod: InputMethod;
  originalName: string | null;
  bodyMd: string;
  sha256: string;
  changeNote: string;
  issues: KbIssue[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  publishedBy: string | null;
}

export interface KbChunkView {
  id: string;
  ordinal: number;
  headingPath: string[];
  provisionRef: string | null;
  tokens: number;
  text: string;
  embedded: boolean;
}

export interface KbDiff {
  against: { id: string; label: string } | null;
  added: string[];
  changed: string[];
  removed: string[];
  unchanged: number;
}

export interface KbVersionDetail {
  version: KbVersion;
  source: KbSource;
  chunks: KbChunkView[];
  diff: KbDiff;
}

export interface KbSearchResult {
  chunkId: string;
  rank: number;
  score: number;
  ftsRank: number | null;
  vectorRank: number | null;
  sourceId: string;
  title: string;
  citation: string;
  kind: KbKind;
  jurisdiction: KbJurisdiction;
  billStatus: BillStatus | null;
  officialUrl: string | null;
  sitePath: string | null;
  versionId: string;
  versionLabel: string;
  effectiveFrom: string | null;
  headingPath: string[];
  provisionRef: string | null;
  text: string;
}

export interface KbSearchResponse {
  mode: 'fts' | 'hybrid';
  results: KbSearchResult[];
}

export interface AdminOverview {
  users: number;
  sources: number;
  publishedVersions: number;
  drafts: number;
  chunksWithoutEmbedding: number;
  embeddingsEnabled: boolean;
}

export interface SourceInput {
  jurisdiction: KbJurisdiction;
  kind: KbKind;
  title: string;
  citation: string;
  officialUrl?: string | null;
  publisher?: string;
  billStatus?: BillStatus | null;
  enactedAsSourceId?: string | null;
}

export interface VersionMeta {
  label: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  retrievedOn: string;
  changeNote: string;
}

export const KIND_LABELS: Record<KbKind, string> = {
  act: 'Act',
  regulation: 'Regulation',
  bill: 'Bill',
  ruling: 'Ruling',
  guidance: 'Guidance',
  standard: 'Standard',
  curriculum: 'Site guide',
};

export const STATUS_LABELS: Record<VersionStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  superseded: 'Superseded',
  withdrawn: 'Withdrawn',
};

export function getOverview(): Promise<AdminOverview> {
  return apiJson<AdminOverview>('/admin/overview');
}

export function embedMissing(): Promise<{ embedded: number; remaining: number }> {
  return apiJson<{ embedded: number; remaining: number }>('/admin/kb/embed-missing', { method: 'POST' });
}

export function listSources(f: { jurisdiction?: KbJurisdiction; kind?: KbKind; q?: string }): Promise<{ sources: KbSourceListItem[] }> {
  const params = new URLSearchParams();
  if (f.jurisdiction !== undefined) params.set('jurisdiction', f.jurisdiction);
  if (f.kind !== undefined) params.set('kind', f.kind);
  if (f.q !== undefined) params.set('q', f.q);
  const qs = params.toString();
  return apiJson<{ sources: KbSourceListItem[] }>(`/admin/kb/sources${qs ? `?${qs}` : ''}`);
}

export function getSource(id: string): Promise<{ source: KbSource; versions: KbVersionSummary[] }> {
  return apiJson<{ source: KbSource; versions: KbVersionSummary[] }>(`/admin/kb/sources/${encodeURIComponent(id)}`);
}

export function createSource(input: SourceInput): Promise<{ source: KbSource }> {
  return apiJson<{ source: KbSource }>('/admin/kb/sources', { method: 'POST', body: input });
}

export function updateSource(id: string, patch: Partial<SourceInput>): Promise<{ source: KbSource }> {
  return apiJson<{ source: KbSource }>(`/admin/kb/sources/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
}

export function createDraft(
  sourceId: string,
  body: VersionMeta & ({ method: 'paste'; text: string } | { method: 'url'; url: string } | { method: 'copy' }),
): Promise<{ detail: KbVersionDetail }> {
  return apiJson<{ detail: KbVersionDetail }>(`/admin/kb/sources/${encodeURIComponent(sourceId)}/versions`, { method: 'POST', body });
}

// A raw fetch, because apiJson only sends JSON. Errors use the same { error } body → ApiError.
export async function uploadVersion(sourceId: string, file: File, meta: VersionMeta): Promise<{ detail: KbVersionDetail }> {
  const query = new URLSearchParams({
    label: meta.label,
    retrievedOn: meta.retrievedOn,
    effectiveFrom: meta.effectiveFrom ?? '',
    effectiveTo: meta.effectiveTo ?? '',
    changeNote: meta.changeNote,
  });
  const res = await fetch(`/api/admin/kb/sources/${encodeURIComponent(sourceId)}/versions/upload?${query.toString()}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) },
    body: file,
  });
  if (!res.ok) {
    let message = `Upload failed (${res.status})`;
    try {
      const body: unknown = await res.json();
      if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') {
        message = body.error;
      }
    } catch {
      // Not JSON: keep the generic message.
    }
    throw new ApiError(res.status, message);
  }
  // The JSON boundary, as in apiJson.
  return (await res.json()) as { detail: KbVersionDetail };
}

export function getVersion(id: string): Promise<{ detail: KbVersionDetail }> {
  return apiJson<{ detail: KbVersionDetail }>(`/admin/kb/versions/${encodeURIComponent(id)}`);
}

export function updateVersion(
  id: string,
  patch: Partial<VersionMeta> & { bodyMd?: string },
): Promise<{ detail: KbVersionDetail }> {
  return apiJson<{ detail: KbVersionDetail }>(`/admin/kb/versions/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
}

export function publishVersion(id: string): Promise<{ detail: KbVersionDetail }> {
  return apiJson<{ detail: KbVersionDetail }>(`/admin/kb/versions/${encodeURIComponent(id)}/publish`, { method: 'POST' });
}

export function withdrawVersion(id: string): Promise<{ detail: KbVersionDetail }> {
  return apiJson<{ detail: KbVersionDetail }>(`/admin/kb/versions/${encodeURIComponent(id)}/withdraw`, { method: 'POST' });
}

export function searchKb(body: { query: string; jurisdiction?: 'AU' | 'UK'; includeBills: boolean; limit?: number }): Promise<KbSearchResponse> {
  return apiJson<KbSearchResponse>('/admin/kb/search', { method: 'POST', body });
}
