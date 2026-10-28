import { apiJson } from './api';

// Mirrors LawListItem and LawDetail in server/src/types/kbPublic.ts. Dates arrive as strings over JSON.
export type LawKind = 'act' | 'regulation' | 'bill' | 'ruling' | 'standard';

export interface LawListItem {
  id: string;
  title: string;
  citation: string;
  jurisdiction: 'AU' | 'UK' | 'INTL';
  kind: LawKind;
  publisher: string;
  officialUrl: string | null;
  billStatus: 'introduced' | 'passed' | 'assented' | 'lapsed' | null;
  enactedAs: { id: string; title: string } | null;
  versionLabel: string;
  effectiveFrom: string | null;
  retrievedOn: string;
  publishedAt: string;
}

export interface LawDetail extends LawListItem {
  bodyMd: string;
}

export function listLaws(): Promise<{ laws: LawListItem[] }> {
  return apiJson<{ laws: LawListItem[] }>('/kb/laws');
}

export function getLaw(id: string): Promise<{ law: LawDetail }> {
  return apiJson<{ law: LawDetail }>(`/kb/laws/${encodeURIComponent(id)}`);
}
