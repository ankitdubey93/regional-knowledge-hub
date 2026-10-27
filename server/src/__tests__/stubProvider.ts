import { ChatProviderError, type ChatEvent, type ChatProvider, type ChatRequest } from '../ai/chat';

export interface StubProvider extends ChatProvider { calls: ChatRequest[]; aborted: boolean }

/** Replays `script` for every call: text chunks, then usage (input 100, output 50, model 'stub-model'), then the stop reason. */
export function stubProvider(script: { chunks: string[]; stop?: 'end' | 'max_tokens' | 'refusal'; throwAfter?: number; waitForAbort?: boolean }): StubProvider {
  const stub: StubProvider = {
    name: 'stub',
    model: 'stub-model',
    calls: [],
    aborted: false,
    async *stream(req: ChatRequest): AsyncGenerator<ChatEvent> {
      stub.calls.push(req);
      if (script.waitForAbort) {
        const first = script.chunks[0];
        if (first !== undefined) yield { type: 'text', text: first };
        await new Promise<void>((resolve) => {
          if (req.signal.aborted) return resolve();
          req.signal.addEventListener('abort', () => resolve(), { once: true });
        });
        stub.aborted = true;
        throw new DOMException('aborted', 'AbortError');
      }
      for (const [i, chunk] of script.chunks.entries()) {
        if (script.throwAfter !== undefined && i >= script.throwAfter) throw new ChatProviderError('stub failure', 'overloaded');
        yield { type: 'text', text: chunk };
      }
      if (script.throwAfter !== undefined && script.throwAfter >= script.chunks.length) throw new ChatProviderError('stub failure', 'overloaded');
      yield { type: 'usage', model: 'stub-model', inputTokens: 100, outputTokens: 50, cacheWriteTokens: 0, cacheReadTokens: 0 };
      yield { type: 'stop', reason: script.stop ?? 'end' };
    },
  };
  return stub;
}
