import { describe, expect, it } from 'vitest';
import { ENGAGEMENT_KIND_FOR_OBLIGATION, engagementDraftsFor, templateFor } from '@chub/shared/utils/engagements';
import { ENGAGEMENT_TEMPLATES } from '@chub/shared/data/engagementTemplates';
import type { Obligation } from '@chub/shared/utils/deadlines';
import { checklists } from '../data';

const seeds = ENGAGEMENT_TEMPLATES.templates;

describe('engagements engine (W1)', () => {
  it('EN1 obligation kinds map to engagement kinds', () => {
    expect(ENGAGEMENT_KIND_FOR_OBLIGATION).toEqual({
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
    });
  });

  it('EN2 templateFor prefers the newest firm template', () => {
    const firm = [
      { id: 'a', kind: 'bas' as const, steps: [{ title: 'Old', estimateMinutes: null }], updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'b', kind: 'bas' as const, steps: [{ title: 'New', estimateMinutes: 30 }], updatedAt: '2026-02-01T00:00:00.000Z' },
    ];
    expect(templateFor('bas', 'AU', firm, seeds)).toEqual({
      templateId: 'firm:b',
      steps: [{ title: 'New', estimateMinutes: 30 }],
    });
  });

  it('EN3 templateFor falls back to the seed for the jurisdiction', () => {
    expect(templateFor('bas', 'AU', [], seeds)?.templateId).toBe('seed:bas');
    expect(templateFor('year_end', 'UK', [], seeds)?.templateId).toBe('seed:year-end');
  });

  it('EN4 templateFor returns null when nothing fits', () => {
    expect(templateFor('bas', 'UK', [], seeds)).toBeNull();
    expect(templateFor('other', 'AU', [], seeds)).toBeNull();
  });

  it('EN5 drafts skip obligations that open nothing', () => {
    const obligations: Obligation[] = [
      {
        id: 'au_bas:2026-09-30',
        kind: 'au_bas',
        label: 'BAS for the quarter ending 30 September 2026',
        periodEnd: '2026-09-30',
        dueDate: '2026-10-28',
        factKeys: [],
        caveat: null,
      },
      {
        id: 'au_asic_review:2026-11-01',
        kind: 'au_asic_review',
        label: 'ASIC review fee',
        periodEnd: '2026-11-01',
        dueDate: '2026-11-01',
        factKeys: [],
        caveat: null,
      },
    ];
    const drafts = engagementDraftsFor(obligations, () => ({
      templateId: 'seed:bas',
      steps: [{ title: 'S', estimateMinutes: null }],
    }));
    expect(drafts).toEqual([
      {
        title: 'BAS for the quarter ending 30 September 2026',
        kind: 'bas',
        periodEnd: '2026-09-30',
        dueOn: '2026-10-28',
        obligationId: 'au_bas:2026-09-30',
        templateId: 'seed:bas',
        steps: [{ title: 'S', estimateMinutes: null }],
      },
    ]);
  });

  it('EN6 a draft with no template has no steps', () => {
    const obligations: Obligation[] = [
      {
        id: 'au_bas:2026-09-30',
        kind: 'au_bas',
        label: 'BAS for the quarter ending 30 September 2026',
        periodEnd: '2026-09-30',
        dueDate: '2026-10-28',
        factKeys: [],
        caveat: null,
      },
    ];
    const drafts = engagementDraftsFor(obligations, () => null);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.templateId).toBeNull();
    expect(drafts[0]!.steps).toEqual([]);
  });

  it('EN7 the seeded templates', () => {
    expect(ENGAGEMENT_TEMPLATES.templates.map((t) => t.id)).toEqual([
      'monthly-bookkeeping',
      'bas',
      'vat-return',
      'year-end',
      'payroll-run',
    ]);
    for (const t of ENGAGEMENT_TEMPLATES.templates) {
      for (const s of t.steps) expect(s.estimateMinutes).toBeNull();
    }
  });

  it('EN8 monthly bookkeeping follows the month-end checklist', () => {
    const monthEnd = checklists.find((c) => c.id === 'month-end')!;
    const expected = monthEnd.groups.flatMap((g) => g.items.map((i) => i.text));
    const monthly = seeds.find((t) => t.id === 'monthly-bookkeeping')!;
    expect(monthly.steps.map((s) => s.title)).toEqual(expected);
  });
});
