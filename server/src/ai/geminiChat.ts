import { z } from 'zod';
import { parseSse } from '@chub/shared/lib/chatWire';
import { ChatProviderError, type ChatEvent, type ChatProvider, type ChatProviderErrorCode, type ChatRequest } from './chat';

const chunkSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({ parts: z.array(z.object({ text: z.string().optional() })).optional() }).optional(),
        finishReason: z.string().optional(),
      }),
    )
    .optional(),
  usageMetadata: z
    .object({
      promptTokenCount: z.number().optional(),
      candidatesTokenCount: z.number().optional(),
      cachedContentTokenCount: z.number().optional(),
    })
    .optional(),
});

const REFUSAL_REASONS = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION']);

function statusError(status: number): ChatProviderError {
  let code: ChatProviderErrorCode = 'unknown';
  let message = 'The AI provider failed';
  if (status === 401 || status === 403) { code = 'auth'; message = 'The AI provider rejected the server key'; }
  else if (status === 429) { code = 'rate_limited'; message = 'The AI provider is rate limiting requests'; }
  else if (status >= 500) { code = 'overloaded'; message = 'The AI provider is unavailable'; }
  else if (status === 400) { code = 'bad_request'; message = 'The AI provider rejected the request'; }
  return new ChatProviderError(message, code);
}

/** Gemini streamGenerateContent over plain fetch. Request shape from Google's public docs; not checked against a live call. */
export function geminiChatProvider(apiKey: string, model: string, fetchImpl: typeof fetch = fetch): ChatProvider {
  return {
    name: 'gemini',
    model,
    async *stream(req: ChatRequest): AsyncGenerator<ChatEvent> {
      let res: Response;
      try {
        res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          signal: req.signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: req.system }] },
            contents: req.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] })),
            generationConfig: { maxOutputTokens: req.maxTokens },
          }),
        });
      } catch (e) {
        if (req.signal.aborted || (e instanceof Error && e.name === 'AbortError')) throw e;
        if (e instanceof TypeError) throw new ChatProviderError('Could not reach the AI provider', 'network');
        throw e;
      }
      if (!res.ok) throw statusError(res.status);
      if (!res.body) throw new ChatProviderError('The AI provider returned an unexpected response', 'unknown');

      const decoder = new TextDecoder();
      let buffer = '';
      let usage: z.infer<typeof chunkSchema>['usageMetadata'];
      let finishReason: string | undefined;

      const handle = function* (data: string): Generator<ChatEvent> {
        let parsed: z.infer<typeof chunkSchema>;
        try {
          const r = chunkSchema.safeParse(JSON.parse(data));
          if (!r.success) throw new Error('shape');
          parsed = r.data;
        } catch {
          throw new ChatProviderError('The AI provider returned an unexpected response', 'unknown');
        }
        for (const cand of parsed.candidates ?? []) {
          for (const part of cand.content?.parts ?? []) {
            if (part.text) yield { type: 'text', text: part.text };
          }
          if (cand.finishReason) finishReason = cand.finishReason;
        }
        if (parsed.usageMetadata) usage = parsed.usageMetadata;
      };

      try {
        for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
          buffer += decoder.decode(chunk, { stream: true });
          const { events, rest } = parseSse(buffer);
          buffer = rest;
          for (const ev of events) yield* handle(ev.data);
        }
        buffer += decoder.decode();
        const tail = parseSse(buffer + '\n\n');
        for (const ev of tail.events) yield* handle(ev.data);
      } catch (e) {
        if (e instanceof ChatProviderError) throw e;
        if (req.signal.aborted || (e instanceof Error && e.name === 'AbortError')) throw e;
        throw new ChatProviderError('Could not reach the AI provider', 'network');
      }

      yield {
        type: 'usage',
        model,
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
        cacheWriteTokens: 0,
        cacheReadTokens: usage?.cachedContentTokenCount ?? 0,
      };
      yield {
        type: 'stop',
        reason: finishReason === 'MAX_TOKENS' ? 'max_tokens' : finishReason !== undefined && REFUSAL_REASONS.has(finishReason) ? 'refusal' : 'end',
      };
    },
  };
}
