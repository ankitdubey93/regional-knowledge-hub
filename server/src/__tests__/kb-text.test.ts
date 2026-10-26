import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHUNK_TARGET_TOKENS, chunkText, detectHeading } from '../kb/chunk';
import { normaliseText, stripRepeatedPageLines } from '../kb/normalise';

const fixture = (name: string): string =>
  normaliseText(readFileSync(new URL(`./fixtures/kb/${name}`, import.meta.url), 'utf8'));

describe('kb text', () => {
  it('T1 normaliseText collapses blank lines, removes soft hyphens and NBSP', () => {
    expect(normaliseText('a\r\n\r\n\r\n\r\nb­ c d  \r')).toBe('a\n\nb c d');
  });

  it('T2 stripRepeatedPageLines removes a running header and page numbers', () => {
    const pages = [1, 2, 3, 4].map((n) => `Example Act 2026\n\nBody of page ${n}.\n\nPage ${n}`);
    const out = stripRepeatedPageLines(pages);
    expect(out).not.toContain('Example Act 2026');
    expect(out).not.toMatch(/Page \d/);
    expect(out).toContain('Body of page 3.');
  });

  it('T3 detectHeading reads AU, UK and markdown headings', () => {
    expect(detectHeading('Section 9-5 What is a taxable supply', null)).toMatchObject({ level: 5, ref: 's 9-5' });
    expect(detectHeading('9-5  What is a taxable supply', null)?.ref).toBe('s 9-5');
    expect(detectHeading('23 Registration', 'x')?.ref).toBe('s 23');
    expect(detectHeading('## Section 23-5 Required', null)).toMatchObject({ level: 2, ref: 's 23-5' });
    expect(detectHeading('Part 2-5—Registration', null)).toMatchObject({ level: 2, ref: null });
    expect(detectHeading('Regulation 4 Interpretation', null)?.ref).toBe('reg 4');
  });

  it('T4 detectHeading ignores dates, sentences and long lines', () => {
    expect(detectHeading('1 July 2026 is the start date.', 'x')).toBeNull();
    expect(detectHeading('Part of the reason is this.', 'x')).toBeNull();
    const long = `Section 1 ${'a'.repeat(120)}`;
    expect(long.length).toBeGreaterThanOrEqual(130);
    expect(detectHeading(long, 'x')).toBeNull();
  });

  it('T5 chunkText on the AU fixture', () => {
    const chunks = chunkText(fixture('au-act-extract.md')).filter((c) => c.provisionRef !== null);
    expect(chunks.map((c) => c.provisionRef)).toEqual(['s 23-5', 's 23-10', 's 25-1']);
    expect(chunks[0]?.headingPath).toEqual([
      'Example Act 2026',
      'Part 2-5—Registration',
      'Division 23—Who must register',
      'Section 23-5 Required to be registered',
    ]);
    expect(chunks[2]?.headingPath).not.toContain('Division 23—Who must register');
  });

  it('T6 chunkText never merges provisions', () => {
    for (const c of chunkText(fixture('au-act-extract.md'))) {
      expect(c.text.includes('Section 23-5') && c.text.includes('Section 23-10')).toBe(false);
    }
  });

  it('T7 chunkText splits a long section with overlap', () => {
    const chunks = chunkText(fixture('uk-act-extract.txt')).filter((c) => c.provisionRef === 's 3');
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const c of chunks) {
      expect(c.tokens).toBeLessThanOrEqual(CHUNK_TARGET_TOKENS + 60);
      expect(c.text.startsWith('3 Long section')).toBe(true);
    }
    const dates = chunkText(fixture('uk-act-extract.txt')).filter((c) => c.text.includes('1 July 2026 is the start date.'));
    expect(dates).toHaveLength(1);
    expect(dates[0]?.provisionRef).toBe('s 1');
  });

  it('T8 chunkText keeps text before the first heading', () => {
    const chunks = chunkText('Intro text.\n\n# H\n\nBody.');
    expect(chunks[0]?.headingPath).toEqual([]);
    expect(chunks[0]?.text).toBe('Intro text.');
  });

  it('T9 ordinals are 0..n-1', () => {
    const chunks = chunkText(fixture('uk-act-extract.txt'));
    expect(chunks.map((c) => c.ordinal)).toEqual(chunks.map((_, i) => i));
  });
});
