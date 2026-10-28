import { describe, expect, it } from 'vitest';
import { chatMessageViewSchema, citationViewSchema, conversationViewSchema, FLAG_CODES, parseSse } from '../lib/chatWire';

describe('parseSse', () => {
  it('CW1 parses two complete events', () => {
    const input = 'event: delta\ndata: {"text":"a"}\n\nevent: done\ndata: {}\n\n';
    expect(parseSse(input)).toEqual({
      events: [
        { event: 'delta', data: '{"text":"a"}' },
        { event: 'done', data: '{}' },
      ],
      rest: '',
    });
  });

  it('CW2 keeps an unfinished event as rest', () => {
    const input = 'event: delta\ndata: {"te';
    expect(parseSse(input)).toEqual({ events: [], rest: input });
  });

  it('CW3 joins multi-line data and skips comments', () => {
    expect(parseSse(': ping\ndata: a\ndata: b\n\n')).toEqual({
      events: [{ event: 'message', data: 'a\nb' }],
      rest: '',
    });
  });

  it('CW4 handles CRLF', () => {
    expect(parseSse('event: x\r\ndata: 1\r\n\r\n')).toEqual({
      events: [{ event: 'x', data: '1' }],
      rest: '',
    });
  });

  it('CW5 drops a block without data', () => {
    expect(parseSse('event: x\n\n')).toEqual({ events: [], rest: '' });
  });

  it('CW6 schemas accept a full message', () => {
    const message = {
      id: 'm1',
      role: 'assistant',
      body: 'GST is 10% [1].',
      status: 'answered',
      flags: [],
      createdAt: '2026-10-27T00:00:00.000Z',
      citations: [
        {
          marker: 1,
          sourceId: 's1',
          versionId: 'v1',
          chunkId: 'c1',
          title: 'GST',
          citation: 'GST Act 1999',
          kind: 'act',
          jurisdiction: 'AU',
          billStatus: null,
          headingPath: ['Part 2'],
          provisionRef: 's 7',
          sitePath: null,
          officialUrl: 'https://www.legislation.gov.au/',
          excerpt: 'The rate of GST is 10%.',
        },
      ],
    };
    expect(() => chatMessageViewSchema.parse(message)).not.toThrow();
    expect(() => chatMessageViewSchema.parse({ ...message, status: 'bogus' })).toThrow();
  });

  it('CW7 a ledger citation parses with null KB ids', () => {
    const parsed = citationViewSchema.parse({
      marker: 1,
      sourceId: null,
      versionId: null,
      chunkId: null,
      title: 'Profit and loss',
      citation: 'Trial balance as at 2026-06-30, imported from Xero',
      kind: 'ledger',
      jurisdiction: 'AU',
      billStatus: null,
      headingPath: [],
      provisionRef: null,
      sitePath: '/entities/c1/reports?importId=i1&tab=pnl',
      officialUrl: null,
      excerpt: 'x',
      ledger: { importId: 'i1', compareImportId: null, report: 'pnl', asAt: '2026-06-30' },
    });
    expect(parsed.ledger?.report).toBe('pnl');
  });

  it('CW8 a KB citation without ledger still parses', () => {
    const parsed = citationViewSchema.parse({
      marker: 1,
      sourceId: 's1',
      versionId: 'v1',
      chunkId: 'c1',
      title: 'GST',
      citation: 'GST Act 1999',
      kind: 'act',
      jurisdiction: 'AU',
      billStatus: null,
      headingPath: ['Part 2'],
      provisionRef: 's 7',
      sitePath: null,
      officialUrl: 'https://www.legislation.gov.au/',
      excerpt: 'The rate of GST is 10%.',
    });
    expect(parsed.ledger).toBeUndefined();
  });

  it('CW-D1 conversationViewSchema requires documents and FLAG_CODES includes from_document', () => {
    const base = {
      id: 'c1',
      clientId: null,
      scope: null,
      title: 'Chat',
      createdBy: 'u1',
      createdAt: '2026-10-28T00:00:00.000Z',
      updatedAt: '2026-10-28T00:00:00.000Z',
    };
    expect(() => conversationViewSchema.parse(base)).toThrow();
    expect(() => conversationViewSchema.parse({ ...base, documents: [] })).not.toThrow();
    expect(FLAG_CODES).toContain('from_document');
  });
});
