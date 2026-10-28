// Which content the Knowledge Hub shows. Pure: no React, no storage.
import type { Jurisdiction as EntityJurisdiction } from './entity';

export type HubScope = 'AU' | 'UK' | 'all';
export type FrameworkId = 'ifrs' | 'frs102' | 'frs105' | 'aasb';
type ContentJurisdiction = 'AU' | 'UK' | 'INTL' | 'AU+UK';

/** AU → 'AU', UK → 'UK', AU+UK → 'all'. */
export function scopeFor(j: EntityJurisdiction): HubScope {
  if (j === 'AU') return 'AU';
  if (j === 'UK') return 'UK';
  return 'all';
}

/** INTL and AU+UK content is always in scope; AU only in 'AU' or 'all'; UK only in 'UK' or 'all'. */
export function inScope(content: ContentJurisdiction, scope: HubScope): boolean {
  if (content === 'INTL' || content === 'AU+UK') return true;
  if (content === 'AU') return scope === 'AU' || scope === 'all';
  return scope === 'UK' || scope === 'all';
}

/** 'AU' → ['ifrs','aasb']; 'UK' → ['ifrs','frs102','frs105']; 'all' → ['ifrs','frs102','frs105','aasb']. */
export function frameworksFor(scope: HubScope): FrameworkId[] {
  if (scope === 'AU') return ['ifrs', 'aasb'];
  if (scope === 'UK') return ['ifrs', 'frs102', 'frs105'];
  return ['ifrs', 'frs102', 'frs105', 'aasb'];
}

/** 'AU' → 'Australia'; 'UK' → 'the UK'; 'all' → 'Australia and the UK'. */
export function scopeName(scope: HubScope): string {
  if (scope === 'AU') return 'Australia';
  if (scope === 'UK') return 'the UK';
  return 'Australia and the UK';
}
