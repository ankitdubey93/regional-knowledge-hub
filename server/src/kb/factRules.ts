import type { Fact } from '../../../src/data/schemas';
import type { KbIssue } from '../db/schema';
import { hostOf, isOfficialUrl } from './officialSites';

/** value, unit, label, jurisdiction, effectiveFrom, source, note and verifiedOn all equal. */
export function factsEqual(a: Fact, b: Fact): boolean {
  return (
    a.value === b.value &&
    a.unit === b.unit &&
    a.label === b.label &&
    a.jurisdiction === b.jurisdiction &&
    a.effectiveFrom === b.effectiveFrom &&
    a.source === b.source &&
    (a.note ?? null) === (b.note ?? null) &&
    a.verifiedOn === b.verifiedOn
  );
}

/** confirm → today; else a changed value, source or effectiveFrom (or no prev) → null; else prev.verifiedOn. */
export function resolveVerifiedOn(prev: Fact | null, next: Fact, confirm: boolean, today: string): string | null {
  if (confirm) return today;
  if (prev === null) return null;
  if (prev.value !== next.value || prev.source !== next.source || prev.effectiveFrom !== next.effectiveFrom) return null;
  return prev.verifiedOn;
}

/** Block-level issues only, in this order: unit_changed, source_not_official, verified_in_future. */
export function checkFactSave(prev: Fact | null, next: Fact, today: string): KbIssue[] {
  const issues: KbIssue[] = [];
  if (prev !== null && prev.unit !== next.unit) {
    issues.push({ level: 'block', code: 'unit_changed', message: 'The unit of a fact cannot change' });
  }
  if (!isOfficialUrl(next.source)) {
    issues.push({ level: 'block', code: 'source_not_official', message: `The source is not on an official site: ${hostOf(next.source)}` });
  }
  if (next.verifiedOn !== null && next.verifiedOn > today) {
    issues.push({ level: 'block', code: 'verified_in_future', message: 'The checked date cannot be after today' });
  }
  return issues;
}
