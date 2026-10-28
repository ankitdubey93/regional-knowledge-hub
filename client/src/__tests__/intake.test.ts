import { describe, expect, it } from 'vitest';
import { datedRequestsFor, intakeItemsFor, matchingRules } from '@chub/shared/utils/intake';
import { deadlineRulesFrom, obligationsFor, type Obligation } from '@chub/shared/utils/deadlines';
import { intakeItemSchema, type IntakeRules } from '@chub/shared/data/schemas';
import { INTAKE_RULES } from '@chub/shared/data/intakeRules';
import { seedFacts, seedSiteDocs } from './seedData';

const rules = deadlineRulesFrom((k) => seedFacts[k]);

const fixture: IntakeRules = {
  note: 'test fixture only',
  rules: [
    { id: 'au.bas', jurisdiction: 'AU', entityTypes: ['sole_trader', 'partnership', 'company', 'trust'], taxRegistered: true, taxPeriods: ['monthly', 'quarterly'],
      items: [{ id: 'au.bas.bankStatements', label: 'Bank statements for the period', why: 'To reconcile the BAS figures.', docId: 'australia/bas-gst-guide', source: null, verifiedOn: null, forKind: 'au_bas', leadDays: 14 }] },
    { id: 'au.yearEnd', jurisdiction: 'AU', entityTypes: ['company', 'trust'], taxRegistered: null, taxPeriods: null,
      items: [
        { id: 'au.ye.loans', label: 'Loan statements at year end', why: 'To confirm closing loan balances.', docId: null, source: 'https://www.ato.gov.au/x', verifiedOn: null, forKind: null, leadDays: null },
        { id: 'au.ye.fixedAssets', label: 'Asset purchases and sales in the year', why: 'For depreciation and the asset register.', docId: null, source: 'https://www.ato.gov.au/x', verifiedOn: '2026-10-28', forKind: null, leadDays: null },
      ] },
    { id: 'au.companyExtra', jurisdiction: 'AU', entityTypes: ['company'], taxRegistered: null, taxPeriods: null,
      items: [{ id: 'au.ye.loans', label: 'Loan statements again', why: 'Duplicate id to test first-wins.', docId: null, source: 'https://www.ato.gov.au/y', verifiedOn: null, forKind: null, leadDays: null }] },
  ],
};
const company = { jurisdiction: 'AU', entityType: 'company', taxRegistered: true, taxPeriod: 'quarterly' } as const;
const basObligation: Obligation = { id: 'au_bas:2026-09-30', kind: 'au_bas', label: 'BAS', periodEnd: '2026-09-30', dueDate: '2026-10-28', factKeys: [], caveat: null };

describe('intake engine', () => {
  it('IN1 intakeItemsFor keeps file order and the first of a duplicate id', () => {
    const d = intakeItemsFor(company, fixture);
    expect(d.map((x) => x.itemId)).toEqual(['au.ye.loans', 'au.ye.fixedAssets']);
    expect(d[0]).toMatchObject({ label: 'Loan statements at year end', sourceUrl: 'https://www.ato.gov.au/x', source: 'rule', dueOn: null, obligationId: null });
  });
  it('IN2 an unregistered sole trader matches no fixture rule', () => {
    expect(intakeItemsFor({ jurisdiction: 'AU', entityType: 'sole_trader', taxRegistered: false, taxPeriod: null }, fixture)).toEqual([]);
  });
  it('IN3 AU+UK gives nothing', () => {
    const p = { ...company, jurisdiction: 'AU+UK' } as const;
    expect(intakeItemsFor(p, fixture)).toEqual([]);
    expect(datedRequestsFor(p, fixture, [])).toEqual([]);
  });
  it('IN4 a null entity type gives nothing', () => {
    expect(matchingRules({ ...company, entityType: null }, fixture)).toEqual([]);
  });
  it('IN5 a quarterly BAS gives one dated request 14 days before', () => {
    const obs = obligationsFor({ ...company, fyEndMonth: 6, registeredOn: null, vatStaggerMonth: null, mtdItsa: false }, rules, '2026-10-01', '2026-12-31');
    expect(datedRequestsFor(company, fixture, obs)).toEqual([
      { itemId: 'au.bas.bankStatements', label: 'Bank statements for the period: BAS for the quarter ending 30 September 2026', why: 'To reconcile the BAS figures.', docId: 'australia/bas-gst-guide', sourceUrl: null, verifiedOn: null, dueOn: '2026-10-14', source: 'obligation', obligationId: 'au_bas:2026-09-30' },
    ]);
  });
  it('IN6 an annual filer does not match the BAS rule', () => {
    expect(datedRequestsFor({ ...company, taxPeriod: 'annual' }, fixture, [basObligation])).toEqual([]);
  });
  it('IN7 an obligation kind with no item gives nothing', () => {
    expect(datedRequestsFor(company, fixture, [{ ...basObligation, kind: 'au_itr' }])).toEqual([]);
  });
  it('IN8 lead days cross a month', () => {
    const d = datedRequestsFor(company, fixture, [{ ...basObligation, dueDate: '2026-03-07' }]);
    expect(d).toHaveLength(1);
    expect(d[0]!.dueOn).toBe('2026-02-21');
  });
});

describe('intake item schema', () => {
  const validItem = fixture.rules[1]!.items[1]!;
  it('IS1 an item needs a docId or a source', () => {
    expect(intakeItemSchema.safeParse({ ...validItem, docId: null, source: null }).success).toBe(false);
  });
  it('IS2 forKind needs leadDays', () => {
    expect(intakeItemSchema.safeParse({ ...validItem, forKind: 'au_bas', leadDays: null }).success).toBe(false);
  });
  it('IS3 verifiedOn needs a source', () => {
    expect(intakeItemSchema.safeParse({ ...validItem, docId: 'australia/bas-gst-guide', source: null, verifiedOn: '2026-10-28' }).success).toBe(false);
  });
});

describe('intake rules file', () => {
  const items = INTAKE_RULES.rules.flatMap((r) => r.items);
  it('IX1 the rules file parses with six rules', () => {
    expect(INTAKE_RULES.rules.length).toBe(6);
  });
  it('IX2 item ids are unique across the file', () => {
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('IX3 every docId is a curriculum doc', () => {
    const ids = new Set(seedSiteDocs.map((d) => d.id));
    for (const i of items) if (i.docId !== null) expect(ids.has(i.docId), i.id).toBe(true);
  });
  it('IX4 every source is an official site', () => {
    const hosts = ['ato.gov.au', 'asic.gov.au', 'legislation.gov.au', 'gov.uk'];
    for (const i of items) {
      if (i.source === null) continue;
      const h = new URL(i.source).hostname;
      expect(hosts.some((x) => h === x || h.endsWith('.' + x)), i.id).toBe(true);
    }
  });
  it('IX5 the real rules give BAS and VAT dated requests', () => {
    expect(datedRequestsFor(company, INTAKE_RULES, [basObligation]).length).toBeGreaterThan(0);
    const uk = { jurisdiction: 'UK', entityType: 'company', taxRegistered: true, taxPeriod: 'quarterly' } as const;
    expect(datedRequestsFor(uk, INTAKE_RULES, [{ ...basObligation, id: 'uk_vat:2026-09-30', kind: 'uk_vat', dueDate: '2026-11-07' }]).length).toBeGreaterThan(0);
  });
});
