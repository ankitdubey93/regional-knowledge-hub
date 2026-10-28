/**
 * Document requests worked out from an entity's profile and its C1 obligations. Pure: no clock, no network.
 * Rules come from shared/seed/intake-rules.json; leadDays there is firm practice, not law.
 */
import type { IntakeRules, IntakeRule, IntakeItem } from '../data/schemas';
import { addDays, type CalendarProfile, type Obligation } from './deadlines';

export const REQUEST_STATUSES = ['open', 'received', 'waived'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const REQUEST_SOURCES = ['rule', 'manual', 'obligation'] as const;
export type RequestSource = (typeof REQUEST_SOURCES)[number];

export type IntakeProfile = Pick<CalendarProfile, 'jurisdiction' | 'entityType' | 'taxRegistered' | 'taxPeriod'>;

export interface RequestDraft {
  itemId: string;
  label: string;
  why: string;
  docId: string | null;
  sourceUrl: string | null;
  verifiedOn: string | null;
  dueOn: string | null; // yyyy-mm-dd
  source: 'rule' | 'obligation';
  obligationId: string | null;
}

/** Rules whose jurisdiction, entityTypes, taxRegistered and taxPeriods all match, in file order. [] for 'AU+UK' or a null entityType. */
export function matchingRules(p: IntakeProfile, rules: IntakeRules): IntakeRule[] {
  const entityType = p.entityType;
  if (entityType === null) return [];
  return rules.rules.filter(
    (rule) =>
      rule.jurisdiction === p.jurisdiction &&
      rule.entityTypes.includes(entityType) &&
      (rule.taxRegistered === null || rule.taxRegistered === p.taxRegistered) &&
      (rule.taxPeriods === null || (p.taxPeriod !== null && rule.taxPeriods.includes(p.taxPeriod))),
  );
}

function draftOf(item: IntakeItem): Omit<RequestDraft, 'source' | 'obligationId' | 'dueOn' | 'label'> {
  return { itemId: item.id, why: item.why, docId: item.docId, sourceUrl: item.source, verifiedOn: item.verifiedOn };
}

/** Undated items (forKind null) of the matching rules, first occurrence of each id wins, file order. */
export function intakeItemsFor(p: IntakeProfile, rules: IntakeRules): RequestDraft[] {
  const seen = new Set<string>();
  const out: RequestDraft[] = [];
  for (const rule of matchingRules(p, rules)) {
    for (const item of rule.items) {
      if (item.forKind !== null || seen.has(item.id)) continue;
      seen.add(item.id);
      out.push({ ...draftOf(item), label: item.label, dueOn: null, source: 'rule', obligationId: null });
    }
  }
  return out;
}

/** For each obligation, each item of the matching rules with forKind === obligation.kind, dated leadDays before the due date. */
export function datedRequestsFor(p: IntakeProfile, rules: IntakeRules, obligations: Obligation[]): RequestDraft[] {
  const matched = matchingRules(p, rules);
  const out: RequestDraft[] = [];
  for (const o of obligations) {
    const seen = new Set<string>();
    for (const rule of matched) {
      for (const item of rule.items) {
        if (item.forKind !== o.kind || item.leadDays === null || seen.has(item.id)) continue;
        seen.add(item.id);
        out.push({
          ...draftOf(item),
          label: `${item.label}: ${o.label}`,
          dueOn: addDays(o.dueDate, -item.leadDays),
          source: 'obligation',
          obligationId: o.id,
        });
      }
    }
  }
  return out;
}
