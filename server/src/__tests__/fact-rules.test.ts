import { describe, expect, it } from 'vitest';
import type { Fact } from '@chub/shared/data/schemas';
import { checkFactSave, resolveVerifiedOn } from '../kb/factRules';

const today = '2026-10-27';
const base: Fact = {
  label: 'GST rate', jurisdiction: 'AU', unit: 'bp', value: 1000,
  effectiveFrom: '2000-07-01', source: 'https://www.ato.gov.au/x', verifiedOn: '2026-10-26',
};
const codes = (prev: Fact | null, next: Fact): string[] => checkFactSave(prev, next, today).map((i) => i.code);

describe('fact rules', () => {
  it('F1 a new fact with no confirmation is unverified', () => {
    expect(resolveVerifiedOn(null, base, false, today)).toBeNull();
  });
  it('F2 confirming sets today', () => {
    expect(resolveVerifiedOn(null, base, true, today)).toBe('2026-10-27');
  });
  it('F3 a changed value resets the check', () => {
    expect(resolveVerifiedOn(base, { ...base, value: 1100 }, false, today)).toBeNull();
  });
  it('F4 a changed note keeps the check', () => {
    expect(resolveVerifiedOn(base, { ...base, note: 'x' }, false, today)).toBe('2026-10-26');
  });
  it('F5 a unit change is blocked', () => {
    expect(codes(base, { ...base, unit: 'cents' })).toEqual(['unit_changed']);
  });
  it('F6 a non-official source is blocked', () => {
    expect(codes(base, { ...base, source: 'https://example.com/x' })).toEqual(['source_not_official']);
  });
  it('F7 a future check date is blocked', () => {
    expect(codes(base, { ...base, verifiedOn: '2026-10-28' })).toEqual(['verified_in_future']);
  });
  it('F8 a valid save has no issues', () => {
    expect(checkFactSave(base, { ...base, note: 'x' }, today)).toEqual([]);
  });
});
