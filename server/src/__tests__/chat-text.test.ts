import { describe, expect, it } from 'vitest';
import { NOT_IN_SOURCES } from '@chub/shared/lib/chatWire';
import { PRICES_CHECKED_ON, costMicroUsd, isPriced, usdToMicroUsd } from '../ai/pricing';
import { isCovered } from '../chat/coverage';
import { checkGrounding, extractNumbers } from '../chat/grounding';
import { HISTORY_TURNS, MAX_DOCUMENT_CHARS_IN_PROMPT, SYSTEM_PROMPT, buildPrompt, stripMarkers, type PromptSource, type PromptTurn } from '../chat/prompt';
import { createRestorer, emptyRedactionMap, redact, redactWith, restore } from '../privacy/redact';
import { formatSse } from '../chat/sse';
import { parseSse } from '@chub/shared/lib/chatWire';

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

describe('redaction map', () => {
  const none = { names: [] as string[] };
  const twoCalls = () => {
    const a = redactWith('a@x.com', none, emptyRedactionMap());
    const b = redactWith('b@y.com and a@x.com', none, a.map);
    return { a, b };
  };

  it('RD13 redactWith continues numbering from the map', () => {
    expect(twoCalls().b.text).toBe('[EMAIL_2] and [EMAIL_1]');
  });
  it('RD14 redactWith does not mutate the input map', () => {
    const a = redactWith('a@x.com', none, emptyRedactionMap());
    const before = structuredClone(a.map);
    redactWith('b@y.com and a@x.com', none, a.map);
    expect(a.map).toEqual(before);
  });
  it('RD15 restore swaps known tokens and leaves unknown ones', () => {
    expect(restore('[EMAIL_1] and [NAME_9]', twoCalls().b.map)).toBe('a@x.com and [NAME_9]');
  });
  it('RD16 restorer handles a token split across chunks', () => {
    const r = createRestorer(twoCalls().b.map);
    const first = r.push('Hi [EMA');
    expect(first).toBe('Hi ');
    const rest = r.push('IL_1] there') + r.flush();
    expect(first + rest).toBe('Hi a@x.com there');
  });
  it('RD17 restorer does not hold back a long bracket', () => {
    const chunk = 'x [ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    expect(chunk.length - 2).toBe(27);
    expect(createRestorer(emptyRedactionMap()).push(chunk)).toBe(chunk);
  });
  it('RD18 names match case-insensitively and reuse one token across calls', () => {
    const o = { names: ['Acme Pty Ltd'] };
    const a = redactWith('acme pty ltd', o, emptyRedactionMap());
    const b = redactWith('ACME PTY LTD', o, a.map);
    expect(a.text).toBe('[NAME_1]');
    expect(b.text).toBe('[NAME_1]');
  });
  it('RD19 the redact() wrapper still numbers from 1 on every call', () => {
    expect(redact('a@x.com', none)).toBe('[EMAIL_1]');
    expect(redact('b@y.com', none)).toBe('[EMAIL_1]');
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

describe('prompt documents', () => {
  const base = { today: 'd', jurisdiction: undefined, sources: [], history: [], question: 'q' } as const;
  const lastText = (docs: { label: string; name: string; text: string }[]): string => {
    const built = buildPrompt({ ...base, sources: [], history: [], documents: docs });
    return built.messages[built.messages.length - 1]?.text ?? '';
  };
  it('PR-D1 no documents means no <documents> block', () => {
    expect(lastText([])).not.toContain('<documents>');
  });
  it('PR-D2 documents come before <sources> with labels D1, D2', () => {
    const t = lastText([
      { label: 'D1', name: 'a.csv', text: 'alpha' },
      { label: 'D2', name: 'b.csv', text: 'beta' },
    ]);
    expect(t).toContain('<document label="D1" name="a.csv">\nalpha\n</document>');
    expect(t.indexOf('label="D1"')).toBeLessThan(t.indexOf('label="D2"'));
    expect(t.indexOf('</documents>')).toBeLessThan(t.indexOf('<sources>'));
  });
  it('PR-D3 the char cap cuts the crossing document and omits later ones', () => {
    const t = lastText([
      { label: 'D1', name: 'a', text: 'x'.repeat(MAX_DOCUMENT_CHARS_IN_PROMPT - 10) },
      { label: 'D2', name: 'b', text: 'y'.repeat(50) },
      { label: 'D3', name: 'c', text: 'zzz' },
    ]);
    expect(t).toContain('y'.repeat(10) + '\n[truncated]');
    expect(t).not.toContain('y'.repeat(11));
    expect(t).not.toContain('label="D3"');
    expect(t.split('[Further attached documents omitted]').length - 1).toBe(1);
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

describe('grounding documents', () => {
  it('GR-D1 a number only in a document is flagged from_document', () => {
    const r = checkGrounding('The total is 980.00 [1].', [{ marker: 1, text: 'No figures.' }], [], ['Invoice total 980.00']);
    expect(r.flags).toEqual([{ code: 'from_document', detail: '980' }]);
  });
  it('GR-D2 a number in a cited source is not flagged even if also in a document', () => {
    const r = checkGrounding('The total is 980.00 [1].', [{ marker: 1, text: 'Total 980.00' }], [], ['Invoice total 980.00']);
    expect(r.status).toBe('answered');
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
    expect(costMicroUsd('claude-opus-5-5', { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 1000, cacheReadTokens: 1000 })).toBe(5200);
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
    expect(PRICES_CHECKED_ON).toBe('2026-10-28');
  });
  it('PC6 sonnet 5.5 cache reads at 0.05x', () => {
    expect(costMicroUsd('claude-sonnet-5-5', { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 1_000_000 })).toBe(100000);
  });
  it('PC7 gemini-2.5-flash is priced', () => {
    expect(isPriced('gemini-2.5-flash')).toBe(true);
    expect(costMicroUsd('gemini-2.5-flash', { inputTokens: 1000, outputTokens: 1000, cacheWriteTokens: 0, cacheReadTokens: 0 })).toBe(2800);
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
