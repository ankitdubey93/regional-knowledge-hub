import { describe, expect, it, vi } from 'vitest';
import { anthropicProvider } from '../ai/anthropic';
import { geminiChatProvider } from '../ai/geminiChat';
import { ChatProviderError, type ChatEvent, type ChatRequest } from '../ai/chat';

async function collect(it: AsyncIterable<ChatEvent>): Promise<ChatEvent[]> {
  const out: ChatEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

function req(signal: AbortSignal = new AbortController().signal): ChatRequest {
  return { system: 'sys', messages: [{ role: 'user', text: 'q' }], maxTokens: 8000, signal };
}

const SSE_BODY = `event: message_start
data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","model":"claude-opus-5-5","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":120,"output_tokens":1}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"GST is 10% "}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"[1]."}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":9}}

event: message_stop
data: {"type":"message_stop"}

`;

function sseFetch(body: string = SSE_BODY): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>(async () => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
}

function sentRequest(f: ReturnType<typeof vi.fn<typeof fetch>>): { headers: Headers; body: Record<string, unknown> } {
  const call = f.mock.calls[0];
  if (!call) throw new Error('fetch was not called');
  const init = call[1] ?? {};
  return { headers: new Headers(init.headers), body: JSON.parse(String(init.body)) as Record<string, unknown> };
}

describe('anthropic', () => {
  it('AN1 streams text, then usage, then stop', async () => {
    const p = anthropicProvider('test-key', 'claude-opus-5-5', { fetch: sseFetch(), maxRetries: 0 });
    expect(await collect(p.stream(req()))).toEqual([
      { type: 'text', text: 'GST is 10% ' },
      { type: 'text', text: '[1].' },
      { type: 'usage', model: 'claude-opus-5-5', inputTokens: 120, outputTokens: 9, cacheWriteTokens: 0, cacheReadTokens: 0 },
      { type: 'stop', reason: 'end' },
    ]);
  });

  it('AN2 request shape', async () => {
    const f = sseFetch();
    const p = anthropicProvider('test-key', 'claude-opus-5-5', { fetch: f, maxRetries: 0 });
    await collect(p.stream(req()));
    const { headers, body } = sentRequest(f);
    expect(headers.get('x-api-key')).toBe('test-key');
    expect(headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(body.model).toBe('claude-opus-5-5');
    expect(body.max_tokens).toBe(8000);
    expect((body.system as { cache_control: { type: string } }[])[0]?.cache_control.type).toBe('ephemeral');
    expect(body.fallbacks).toBe('default');
    expect((body.output_config as { effort: string }).effort).toBe('medium');
    expect('temperature' in body).toBe(false);
  });

  it('AN3 no fallback for models without one', async () => {
    const f = sseFetch();
    const p = anthropicProvider('test-key', 'claude-haiku-5-5', { fetch: f, maxRetries: 0 });
    await collect(p.stream(req()));
    const { headers, body } = sentRequest(f);
    expect('fallbacks' in body).toBe(false);
    expect(headers.get('anthropic-beta') ?? '').not.toContain('server-side-fallback');
  });

  it('AN4 refusal', async () => {
    const f = sseFetch(SSE_BODY.replace('"stop_reason":"end_turn"', '"stop_reason":"refusal"'));
    const p = anthropicProvider('test-key', 'claude-opus-5-5', { fetch: f, maxRetries: 0 });
    const events = await collect(p.stream(req()));
    expect(events[events.length - 1]).toEqual({ type: 'stop', reason: 'refusal' });
  });

  it('AN5 401 maps to auth', async () => {
    const f = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'x' } }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const p = anthropicProvider('test-key', 'claude-opus-5-5', { fetch: f, maxRetries: 0 });
    const err: unknown = await collect(p.stream(req())).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ChatProviderError);
    expect((err as ChatProviderError).code).toBe('auth');
  });

  it('AN6 an aborted signal is not a provider error', async () => {
    const ac = new AbortController();
    ac.abort();
    const p = anthropicProvider('test-key', 'claude-opus-5-5', { fetch: sseFetch(), maxRetries: 0 });
    const err: unknown = await collect(p.stream(req(ac.signal))).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).not.toBeNull();
    expect(err).not.toBeInstanceOf(ChatProviderError);
  });
});

function geminiFetch(events: unknown[], status = 200): ReturnType<typeof vi.fn<typeof fetch>> {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return vi.fn<typeof fetch>(async () => new Response(body, { status, headers: { 'content-type': 'text/event-stream' } }));
}

const GEMINI_EVENTS = (reason: string): unknown[] => [
  { candidates: [{ content: { parts: [{ text: 'GST ' }] } }] },
  {
    candidates: [{ content: { parts: [{ text: '[1].' }] }, finishReason: reason }],
    usageMetadata: { promptTokenCount: 80, candidatesTokenCount: 6 },
  },
];

describe('gemini', () => {
  it('GM1 streams parts, usage and stop', async () => {
    const p = geminiChatProvider('gkey', 'gemini-test', geminiFetch(GEMINI_EVENTS('STOP')));
    expect(await collect(p.stream(req()))).toEqual([
      { type: 'text', text: 'GST ' },
      { type: 'text', text: '[1].' },
      { type: 'usage', model: 'gemini-test', inputTokens: 80, outputTokens: 6, cacheWriteTokens: 0, cacheReadTokens: 0 },
      { type: 'stop', reason: 'end' },
    ]);
  });

  it('GM2 request shape', async () => {
    const f = geminiFetch(GEMINI_EVENTS('STOP'));
    const p = geminiChatProvider('gkey', 'gemini-test', f);
    await collect(
      p.stream({
        system: 'sys',
        messages: [
          { role: 'user', text: 'q' },
          { role: 'assistant', text: 'a' },
          { role: 'user', text: 'q2' },
        ],
        maxTokens: 8000,
        signal: new AbortController().signal,
      }),
    );
    const call = f.mock.calls[0];
    if (!call) throw new Error('fetch was not called');
    const url = String(call[0]);
    const init = call[1] ?? {};
    const headers = new Headers(init.headers);
    const body = JSON.parse(String(init.body)) as { contents: { role: string }[]; generationConfig: { maxOutputTokens: number } };
    expect(url.endsWith('/models/gemini-test:streamGenerateContent?alt=sse')).toBe(true);
    expect(url).not.toContain('gkey');
    expect(headers.get('x-goog-api-key')).toBe('gkey');
    expect(body.contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
    expect(body.generationConfig.maxOutputTokens).toBe(8000);
  });

  it('GM3 SAFETY maps to refusal', async () => {
    const p = geminiChatProvider('gkey', 'gemini-test', geminiFetch(GEMINI_EVENTS('SAFETY')));
    const events = await collect(p.stream(req()));
    expect(events[events.length - 1]).toEqual({ type: 'stop', reason: 'refusal' });
  });

  it('GM4 429 maps to rate_limited', async () => {
    const p = geminiChatProvider('gkey', 'gemini-test', geminiFetch([], 429));
    const err: unknown = await collect(p.stream(req())).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ChatProviderError);
    expect((err as ChatProviderError).code).toBe('rate_limited');
  });
});
