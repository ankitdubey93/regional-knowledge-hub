import { describe, expect, it } from 'vitest';
import { chatMessageViewSchema, parseSse } from '../lib/chatWire';

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
});
