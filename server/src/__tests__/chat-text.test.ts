import { describe, expect, it } from 'vitest';
import { NOT_IN_SOURCES } from '../../../src/lib/chatWire';
import { PRICES_CHECKED_ON, costMicroUsd, isPriced, usdToMicroUsd } from '../ai/pricing';
import { isCovered } from '../chat/coverage';
import { checkGrounding, extractNumbers } from '../chat/grounding';
import { HISTORY_TURNS, SYSTEM_PROMPT, buildPrompt, stripMarkers, type PromptSource, type PromptTurn } from '../chat/prompt';
import { redact } from '../privacy/redact';
import { formatSse } from '../chat/sse';
import { parseSse } from '../../../src/lib/chatWire';

describe('redact', () => {
  const r = (input: string, names: string[] = []): string => redact(input, { names });

  it('RD1 email', () => {
    expect(r('Email jo@acme.com.au now')).toBe('Email [EMAIL_1] now');
  });
  it('RD2 AU and UK phones', () => {
    expect(r('Call 0412 345 678 or 020 7946 0958')).toBe('Call [PHONE_1] or [PHONE_2]');
  });
  it('RD3 TFN', () => {
    expect(r('TFN 123 456 782')).toBe('TFN [TAXID_1]');
  });
  it('RD4 ABN', () => {
    expect(r('ABN 51 824 753 556')).toBe('ABN [ABN_1]');
  });
  it('RD5 NI number', () => {
    expect(r('NI QQ 12 34 56 C')).toBe('NI [NINO_1]');
  });
  it('RD6 UTR', () => {
    expect(r('UTR 12345 67890')).toBe('UTR [UTR_1]');
  });
  it('RD7 card only when Luhn passes', () => {
    expect(r('4111 1111 1111 1111')).toBe('[CARD_1]');
    expect(r('4111 1111 1111 1112')).not.toContain('[CARD_');
  });
  it('RD8 bank accounts', () => {
    expect(r('BSB 062-000 12345678')).toBe('BSB [BANK_1]');
    expect(r('Sort 20-00-00 12345678')).toBe('Sort [BANK_1]');
  });
  it('RD9 IBAN', () => {
    expect(r('GB29NWBK60161331926819')).toBe('[IBAN_1]');
  });
  it('RD10 names whole-word, case-insensitive, longest first', () => {
    expect(r('acme pty ltd owes Acme; Acmes is fine', ['Acme', 'Acme Pty Ltd'])).toBe(
      '[NAME_1] owes [NAME_2]; Acmes is fine',
    );
  });
  it('RD11 repeats reuse the placeholder', () => {
    expect(r('jo@x.io and jo@x.io')).toBe('[EMAIL_1] and [EMAIL_1]');
  });
  it('RD12 leaves amounts, rates and dates alone', () => {
    const s = 'A$75,000 at 10% by 28 October 2026';
    expect(r(s)).toBe(s);
  });
});

describe('prompt', () => {
  const src = (marker: number, over: Partial<PromptSource> = {}): PromptSource => ({
    marker,
    title: 'T',
    citation: 'C',
    headingPath: [],
    provisionRef: null,
    isBill: false,
    isLedger: false,
    text: 'body',
    ...over,
  });

  it('PR1 system prompt holds the exact refusal sentence', () => {
    expect(SYSTEM_PROMPT).toContain(NOT_IN_SOURCES);
  });
  it('PR2 sources are numbered with their labels', () => {
    const built = buildPrompt({
      today: '2026-10-27',
      jurisdiction: 'AU',
      sources: [src(1), src(2, { title: 'Test Bill', citation: 'Test Bill 2026', headingPath: ['Part 2', 's 9'], isBill: true })],
      history: [],
      question: 'q',
    });
    const last = built.messages[built.messages.length - 1];
    expect(last?.text).toContain('[2] Test Bill | Test Bill 2026 | Part 2 > s 9 | Bill (not law)');
  });
  it('PR3 history is trimmed to 10 turns and starts with user', () => {
    const history: PromptTurn[] = Array.from({ length: 11 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      text: `t${i}`,
    }));
    const built = buildPrompt({ today: 'd', jurisdiction: 'UK', sources: [], history, question: 'q' });
    expect(HISTORY_TURNS).toBe(10);
    expect(built.messages.length).toBe(10);
    expect(built.messages[0]?.role).toBe('user');
  });
  it('PR4 jurisdiction line', () => {
    const built = buildPrompt({ today: 'd', jurisdiction: undefined, sources: [], history: [], question: 'q' });
    expect(built.messages[built.messages.length - 1]?.text).toContain('Jurisdiction: Australia and the UK');
  });
  it('PR6 a ledger source is labelled', () => {
    const built = buildPrompt({
      today: '2026-10-28',
      jurisdiction: 'AU',
      sources: [src(1, { title: 'Profit and loss', citation: 'Trial balance as at 2026-06-30, imported from Xero', isLedger: true })],
      history: [],
      question: 'q',
    });
    const last = built.messages[built.messages.length - 1];
    expect(last?.text).toContain(
      "[1] Profit and loss | Trial balance as at 2026-06-30, imported from Xero | Ledger (entity's imported trial balance, not reviewed)",
    );
    expect(SYSTEM_PROMPT).toContain('Never add, subtract, average or otherwise calculate');
  });
  it('PR5 stripMarkers', () => {
    expect(stripMarkers('GST is 10% [1]. See [2, 3].')).toBe('GST is 10%. See.');
  });
});

describe('grounding', () => {
  it('GR1 cited answer passes', () => {
    expect(checkGrounding('GST is 10% [1].', [{ marker: 1, text: 'The rate of GST is 10%.' }], [])).toEqual({
      status: 'answered',
      flags: [],
      usedMarkers: [1],
    });
  });
  it('GR2 no markers', () => {
    const r = checkGrounding('GST is charged on most sales.', [{ marker: 1, text: 'x' }], []);
    expect(r.status).toBe('flagged');
    expect(r.flags).toEqual([{ code: 'uncited', detail: 'No citations' }]);
  });
  it('GR3 an uncited long block', () => {
    const r = checkGrounding(
      'GST is 10% [1].\n\nYou should also register for PAYG withholding before you hire anyone at all.',
      [{ marker: 1, text: 'The rate of GST is 10%.' }],
      [],
    );
    const uncited = r.flags.filter((f) => f.code === 'uncited');
    expect(uncited).toHaveLength(1);
    expect(uncited[0]?.detail.startsWith('You should also register')).toBe(true);
  });
  it('GR4 bad marker', () => {
    const sources = [1, 2, 3].map((marker) => ({ marker, text: 'x' }));
    const r = checkGrounding('See [9].', sources, []);
    expect(r.flags).toContainEqual({ code: 'bad_marker', detail: '[9]' });
  });
  it('GR5 unsupported number', () => {
    const sources = [{ marker: 1, text: 'The levy is 3.5%.' }];
    const bad = checkGrounding('The levy is 12.5% [1].', sources, []);
    expect(bad.flags).toContainEqual({ code: 'unsupported_number', detail: '12.5%' });
    expect(checkGrounding('The levy is 3.5% [1].', sources, []).status).toBe('answered');
  });
  it('GR6 a fact value allows a number', () => {
    const r = checkGrounding('The threshold is A$75,000 [1].', [{ marker: 1, text: 'The threshold applies.' }], ['A$75,000']);
    expect(r.status).toBe('answered');
  });
  it('GR7 small integers and placeholders are ignored', () => {
    const r = checkGrounding('Ask [NAME_1] about 2 steps [1].', [{ marker: 1, text: 'Steps.' }], []);
    expect(r.status).toBe('answered');
  });
  it('GR8 the exact refusal sentence', () => {
    expect(checkGrounding(NOT_IN_SOURCES, [], []).status).toBe('not_covered');
  });
  it('GR9 extractNumbers normalises', () => {
    expect(extractNumbers('A$75,000.00 and 3.50% and 2026')).toEqual(['75000', '3.5%', '2026']);
  });
});

describe('coverage', () => {
  it('CV1 half the lexemes in one chunk is covered', () => {
    expect(isCovered({ lexemeCount: 4, bestLexemeMatches: 2, bestSimilarityBp: null })).toBe(true);
    expect(isCovered({ lexemeCount: 4, bestLexemeMatches: 1, bestSimilarityBp: null })).toBe(false);
  });
  it('CV2 similarity alone', () => {
    expect(isCovered({ lexemeCount: 0, bestLexemeMatches: 0, bestSimilarityBp: 6000 })).toBe(true);
    expect(isCovered({ lexemeCount: 0, bestLexemeMatches: 0, bestSimilarityBp: 5999 })).toBe(false);
  });
});

describe('pricing', () => {
  it('PC1 opus 5.5 input and output', () => {
    expect(costMicroUsd('claude-opus-5-5', { inputTokens: 1000, outputTokens: 500, cacheWriteTokens: 0, cacheReadTokens: 0 })).toBe(14000);
  });
  it('PC2 cache writes and reads', () => {
    expect(costMicroUsd('claude-opus-5-5', { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 1000, cacheReadTokens: 1000 })).toBe(5400);
  });
  it('PC3 unknown model uses the highest price', () => {
    expect(costMicroUsd('stub-model', { inputTokens: 1000, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 })).toBe(10000);
  });
  it('PC4 usdToMicroUsd', () => {
    expect(usdToMicroUsd('5')).toBe(5000000);
    expect(usdToMicroUsd('2.5')).toBe(2500000);
    expect(usdToMicroUsd('0.01')).toBe(10000);
    expect(() => usdToMicroUsd('abc')).toThrow(RangeError);
  });
  it('PC5 isPriced', () => {
    expect(isPriced('claude-opus-5-5')).toBe(true);
    expect(isPriced('gemini-x')).toBe(false);
    expect(PRICES_CHECKED_ON).toBe('2026-10-06');
  });
});

describe('sse', () => {
  it('SS1 formatSse', () => {
    expect(formatSse('delta', { text: 'a\nb' })).toBe('event: delta\ndata: {"text":"a\\nb"}\n\n');
  });
  it('SS2 round-trips through parseSse', () => {
    expect(parseSse(formatSse('done', { x: 1 }))).toEqual({
      events: [{ event: 'done', data: '{"x":1}' }],
      rest: '',
    });
  });
});
