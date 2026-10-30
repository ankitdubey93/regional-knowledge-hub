import { describe, expect, it } from 'vitest';
import type { RawChunk } from '../kb/chunk';
import { diffKey, diffVersions } from '../kb/diff';
import { hostOf, isOfficialUrl } from '../kb/officialSites';
import { fuseRankings } from '../kb/rrf';
import { validateVersion, type ValidateInput } from '../kb/validate';

const LONG_BODY = 'Section text for a provision. '.repeat(12);

const chunk = (over: Partial<RawChunk> = {}): RawChunk => ({
  ordinal: 0, headingPath: ['Part 1'], provisionRef: 's 23', text: 'Section text.', tokens: 4, ...over,
});

// A version that raises no issue at all.
const clean = (over: Partial<ValidateInput> = {}): ValidateInput => ({
  kind: 'act',
  officialUrl: 'https://www.legislation.gov.au/Details/C2026A00001',
  billStatus: null,
  effectiveFrom: '2026-07-01',
  bodyMd: LONG_BODY,
  chunks: [chunk()],
  duplicateOfLabel: null,
  unknownFacts: [],
  ...over,
});

const codes = (i: ValidateInput): string[] => validateVersion(i).map((x) => x.code);

describe('kb rules', () => {
  it('R1 isOfficialUrl accepts official hosts and subdomains', () => {
    expect(isOfficialUrl('https://www.legislation.gov.au/x')).toBe(true);
    expect(isOfficialUrl('https://bills.parliament.uk/bills/1')).toBe(true);
    expect(isOfficialUrl('https://www.gov.uk/vat')).toBe(true);
  });

  it('R2 isOfficialUrl rejects http, lookalikes and other hosts', () => {
    expect(isOfficialUrl('http://www.ato.gov.au/')).toBe(false);
    expect(isOfficialUrl('https://ato.gov.au.evil.com/')).toBe(false);
    expect(isOfficialUrl('https://notgov.uk/')).toBe(false);
    expect(isOfficialUrl('https://example.com/')).toBe(false);
    expect(isOfficialUrl('not a url')).toBe(false);
  });

  it('R11 the hosts used for MTD and the Australia–UK treaty are official, AustLII is not', () => {
    expect(isOfficialUrl('https://www.legislation.gov.uk/uksi/2003/3199/made')).toBe(true);
    expect(isOfficialUrl('https://www.gov.uk/government/publications/australia-tax-treaties')).toBe(true);
    expect(isOfficialUrl('https://www.gov.uk/guidance/use-making-tax-digital-for-income-tax/send-quarterly-updates')).toBe(true);
    expect(isOfficialUrl('https://www.ato.gov.au/')).toBe(true);
    expect(isOfficialUrl('https://www.austlii.edu.au/au/other/dfat/treaties/')).toBe(false);
  });

  it('R3 an act with no URL, no effective date and no chunks has three blocking issues', () => {
    const issues = validateVersion({
      kind: 'act', officialUrl: null, billStatus: null, effectiveFrom: null,
      bodyMd: 'Short.', chunks: [], duplicateOfLabel: null, unknownFacts: [],
    });
    expect(issues.map((x) => x.code)).toEqual(['no_url', 'no_effective_date', 'no_chunks', 'short_text']);
    expect(issues.slice(0, 3).every((x) => x.level === 'block')).toBe(true);
    expect(issues[3]?.level).toBe('warn');
  });

  it('R4 an off-list URL blocks with its host', () => {
    const issues = validateVersion(clean({ officialUrl: 'https://example.com/act' }));
    expect(issues).toEqual([
      { level: 'block', code: 'url_not_official', message: 'The official URL is not on an official site: example.com' },
    ]);
    expect(hostOf('https://example.com/act')).toBe('example.com');
  });

  it('R5 a bill without a status blocks', () => {
    const issues = validateVersion(clean({ kind: 'bill', billStatus: null, effectiveFrom: null }));
    expect(issues).toEqual([{ level: 'block', code: 'bill_status_missing', message: 'Set the Bill\'s status' }]);
  });

  it('R6 a curriculum version needs no URL or date', () => {
    const curriculum = { kind: 'curriculum' as const, officialUrl: null, effectiveFrom: null, billStatus: null, duplicateOfLabel: null, unknownFacts: [] };
    expect(codes({ ...curriculum, bodyMd: 'Too short.', chunks: [chunk({ provisionRef: null })] })).toEqual(['short_text']);
    expect(validateVersion({ ...curriculum, bodyMd: 'A curriculum page. '.repeat(12), chunks: [chunk()] })).toEqual([]);
  });

  it('R7 warnings: long chunk, no provisions, duplicate', () => {
    const longChunk = validateVersion(clean({ kind: 'guidance', chunks: [chunk({ provisionRef: null, tokens: 1501 })] }));
    expect(longChunk).toEqual([
      { level: 'warn', code: 'long_chunk', message: '1 chunk(s) are over 1,500 tokens: add headings to split them' },
    ]);

    const noProvisions = validateVersion(clean({ chunks: [chunk({ provisionRef: null })] }));
    expect(noProvisions).toEqual([
      { level: 'warn', code: 'no_provisions', message: 'No sections were detected: add ## headings to split the text by provision' },
    ]);

    const duplicate = validateVersion(clean({ kind: 'guidance', duplicateOfLabel: 'v1' }));
    expect(duplicate).toEqual([{ level: 'warn', code: 'duplicate', message: 'This text is identical to version "v1"' }]);
  });

  it('V-unknown blocks a version with an unknown fact', () => {
    const issues = validateVersion(clean({ unknownFacts: ['au.x.y'] }));
    expect(issues.map((x) => x.code)).toContain('unknown_fact');
    expect(issues.find((x) => x.code === 'unknown_fact')?.message).toBe('Unknown fact key(s): au.x.y');
  });

  it('V-known has no unknown_fact issue when the list is empty', () => {
    expect(codes(clean({ unknownFacts: [] }))).not.toContain('unknown_fact');
  });

  it('R8 diffVersions finds added, changed and removed provisions', () => {
    const prev = [
      { ordinal: 0, headingPath: [], provisionRef: 's 1', text: 'a' },
      { ordinal: 1, headingPath: [], provisionRef: 's 2', text: 'b' },
      { ordinal: 2, headingPath: [], provisionRef: 's 3', text: 'c' },
    ];
    const next = [
      { ordinal: 0, headingPath: [], provisionRef: 's 1', text: 'a' },
      { ordinal: 1, headingPath: [], provisionRef: 's 2', text: 'B' },
      { ordinal: 2, headingPath: [], provisionRef: 's 4', text: 'd' },
    ];
    expect(diffVersions(next, prev)).toEqual({ added: ['s 4'], changed: ['s 2'], removed: ['s 3'], unchanged: 1 });
  });

  it('R9 diffKey falls back to the heading path, then the ordinal', () => {
    expect(diffKey({ ordinal: 3, headingPath: ['Part 2'], provisionRef: 's 5', text: '' })).toBe('s 5');
    expect(diffKey({ ordinal: 3, headingPath: ['Part 2', 'Division 1'], provisionRef: null, text: '' })).toBe('Part 2 › Division 1');
    expect(diffKey({ ordinal: 7, headingPath: [], provisionRef: null, text: '' })).toBe('#7');
  });

  it('R10 fuseRankings', () => {
    const fused = fuseRankings([['a', 'b', 'c'], ['c', 'a']]);
    expect(fused.map((f) => f.id)).toEqual(['a', 'c', 'b']);
    const a = fused.find((f) => f.id === 'a');
    expect(a).toBeDefined();
    expect(Math.abs((a?.score ?? NaN) - (1 / 61 + 1 / 62))).toBeLessThan(1e-12);
    const b = fused.find((f) => f.id === 'b');
    expect(b?.ranks).toEqual([2, null]);
  });
});
