import { describe, expect, it } from 'vitest';
import {
  defaultProfile,
  entityTypesFor,
  profileOf,
  profileSummary,
  taxLabel,
  withJurisdiction,
  type ClientRecord,
  type EntityProfile,
} from '../lib/entity';

function record(over: Partial<ClientRecord>): ClientRecord {
  return {
    id: 'c1',
    name: 'Test',
    notes: '',
    entities: [],
    isSelf: false,
    jurisdiction: 'AU',
    entityType: 'company',
    taxRegistered: false,
    taxPeriod: null,
    fyEndMonth: 6,
    timezone: null,
    registeredOn: null,
    vatStaggerMonth: null,
    mtdItsa: false,
    ...over,
  };
}

describe('entity', () => {
  it('AU offers a trust but no LLP', () => {
    const values = entityTypesFor('AU').map((t) => t.value);
    expect(values).toContain('trust');
    expect(values).not.toContain('llp');
  });

  it('UK offers an LLP and calls a company a limited company', () => {
    const uk = entityTypesFor('UK');
    expect(uk.map((t) => t.value)).toContain('llp');
    expect(uk.find((t) => t.value === 'company')?.label).toBe('Limited company');
  });

  it('AU+UK offers all five types', () => {
    const values = entityTypesFor('AU+UK').map((t) => t.value);
    expect(values).toHaveLength(5);
    expect(new Set(values)).toEqual(new Set(['sole_trader', 'partnership', 'company', 'trust', 'llp']));
  });

  it('taxLabel names GST, VAT or both', () => {
    expect(taxLabel('AU')).toBe('GST');
    expect(taxLabel('UK')).toBe('VAT');
    expect(taxLabel('AU+UK')).toBe('GST or VAT');
  });

  it('defaultProfile ends the year in June for AU and March for UK', () => {
    expect(defaultProfile('AU').fyEndMonth).toBe(6);
    expect(defaultProfile('UK').fyEndMonth).toBe(3);
  });

  it('withJurisdiction keeps an allowed type and resets a disallowed one', () => {
    const trust: EntityProfile = { ...defaultProfile('AU'), entityType: 'trust' };
    expect(withJurisdiction(trust, 'UK').entityType).toBe('company');
    const partnership: EntityProfile = { ...defaultProfile('AU'), entityType: 'partnership' };
    expect(withJurisdiction(partnership, 'UK').entityType).toBe('partnership');
  });

  it('profileOf fills a legacy row with defaults', () => {
    const legacy = record({ jurisdiction: 'UK', entityType: null, fyEndMonth: null });
    const p = profileOf(legacy);
    expect(p.entityType).toBe('company');
    expect(p.fyEndMonth).toBe(3);
  });

  it('profileSummary reads like a sentence', () => {
    const c = record({
      jurisdiction: 'UK',
      entityType: 'llp',
      taxRegistered: true,
      taxPeriod: 'quarterly',
      fyEndMonth: 3,
    });
    expect(profileSummary(c)).toBe('LLP · VAT quarterly · Year ends March');
  });
});
