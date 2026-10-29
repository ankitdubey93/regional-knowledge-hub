/**
 * Engagement kinds, statuses and drafts opened from C1 obligations. Pure: no clock, no network.
 * Types only are imported from ../data/schemas (which imports ENGAGEMENT_KINDS from here).
 */
import type { Obligation, ObligationKind } from './deadlines';
import type { EngagementTemplateStep, SeedEngagementTemplate } from '../data/schemas';

export const ENGAGEMENT_KINDS = ['bookkeeping', 'bas', 'vat', 'year_end', 'payroll', 'other'] as const;
export type EngagementKind = (typeof ENGAGEMENT_KINDS)[number];
export const ENGAGEMENT_STATUSES = ['planned', 'in_progress', 'review', 'done'] as const;
export type EngagementStatus = (typeof ENGAGEMENT_STATUSES)[number];
export const TASK_STATUSES = ['todo', 'doing', 'blocked', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const OPEN_WINDOW_DAYS = 90; // untuned

export const ENGAGEMENT_KIND_FOR_OBLIGATION: Record<ObligationKind, EngagementKind | null> = {
  au_bas: 'bas',
  au_itr: 'year_end',
  au_asic_review: null,
  uk_vat: 'vat',
  uk_ct_payment: null,
  uk_ct600: null,
  uk_ch_accounts: 'year_end',
  uk_confirmation: null,
  uk_sa_return: 'year_end',
  uk_sa_poa2: null,
  uk_mtd_itsa: null,
};

export interface FirmTemplateRef {
  id: string;
  kind: EngagementKind;
  steps: EngagementTemplateStep[];
  updatedAt: string;
}
export interface TemplateChoice {
  templateId: string;
  steps: EngagementTemplateStep[];
}
export interface EngagementDraft {
  title: string;
  kind: EngagementKind;
  periodEnd: string;
  dueOn: string;
  obligationId: string;
  templateId: string | null;
  steps: EngagementTemplateStep[];
}

/** The firm template of this kind with the latest updatedAt (ties: lowest id), as `firm:${id}`; else the first seed (array order)
 *  of this kind whose jurisdiction is null or equals `jurisdiction`, as `seed:${id}`; else null. Steps are copied. */
export function templateFor(
  kind: EngagementKind,
  jurisdiction: 'AU' | 'UK',
  firm: FirmTemplateRef[],
  seeds: SeedEngagementTemplate[],
): TemplateChoice | null {
  const mine = firm
    .filter((t) => t.kind === kind)
    .sort((a, b) => (a.updatedAt === b.updatedAt ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.updatedAt < b.updatedAt ? 1 : -1));
  const best = mine[0];
  if (best) return { templateId: `firm:${best.id}`, steps: best.steps.map((s) => ({ ...s })) };
  const seed = seeds.find((s) => s.kind === kind && (s.jurisdiction === null || s.jurisdiction === jurisdiction));
  if (seed) return { templateId: `seed:${seed.id}`, steps: seed.steps.map((s) => ({ ...s })) };
  return null;
}

/** One draft per obligation whose engagement kind is not null, in input order. */
export function engagementDraftsFor(
  obligations: Obligation[],
  choose: (kind: EngagementKind) => TemplateChoice | null,
): EngagementDraft[] {
  const drafts: EngagementDraft[] = [];
  for (const o of obligations) {
    const kind = ENGAGEMENT_KIND_FOR_OBLIGATION[o.kind];
    if (kind === null) continue;
    const choice = choose(kind);
    drafts.push({
      title: o.label,
      kind,
      periodEnd: o.periodEnd,
      dueOn: o.dueDate,
      obligationId: o.id,
      templateId: choice ? choice.templateId : null,
      steps: choice ? choice.steps : [],
    });
  }
  return drafts;
}
