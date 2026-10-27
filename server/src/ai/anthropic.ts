import Anthropic from '@anthropic-ai/sdk';
import { ChatProviderError, type ChatEvent, type ChatProvider, type ChatRequest } from './chat';

export const FALLBACK_MODELS: readonly string[] = ['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5'];

// Never put the provider's response body or the request text in a message (Hard rule 13).
function mapError(e: unknown, signal: AbortSignal): unknown {
  if (e instanceof Anthropic.APIUserAbortError || signal.aborted) return e;
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return new ChatProviderError('The AI provider rejected the server key', 'auth');
  }
  if (e instanceof Anthropic.RateLimitError) return new ChatProviderError('The AI provider is rate limiting requests', 'rate_limited');
  if (e instanceof Anthropic.InternalServerError) return new ChatProviderError('The AI provider is unavailable', 'overloaded');
  if (e instanceof Anthropic.BadRequestError) return new ChatProviderError('The AI provider rejected the request', 'bad_request');
  if (e instanceof Anthropic.APIConnectionError) return new ChatProviderError('Could not reach the AI provider', 'network');
  return new ChatProviderError('The AI provider failed', 'unknown');
}

export function anthropicProvider(apiKey: string, model: string, opts?: { fetch?: typeof fetch; maxRetries?: number }): ChatProvider {
  const client = new Anthropic({
    apiKey,
    maxRetries: opts?.maxRetries ?? 1,
    timeout: 120_000,
    ...(opts?.fetch ? { fetch: opts.fetch } : {}),
  });
  return {
    name: 'anthropic',
    model,
    async *stream(req: ChatRequest): AsyncGenerator<ChatEvent> {
      try {
        const stream = client.beta.messages.stream(
          {
            model,
            max_tokens: req.maxTokens,
            system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
            messages: req.messages.map((m) => ({ role: m.role, content: m.text })),
            output_config: { effort: 'medium' },
            ...(FALLBACK_MODELS.includes(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
          },
          { signal: req.signal },
        );
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            yield { type: 'text', text: event.delta.text };
          }
        }
        const final = await stream.finalMessage();
        const iterations = final.usage.iterations;
        if (iterations && iterations.length > 0) {
          for (const it of iterations) {
            yield {
              type: 'usage',
              model: 'model' in it && it.model ? it.model : final.model,
              inputTokens: it.input_tokens ?? 0,
              outputTokens: it.output_tokens ?? 0,
              cacheWriteTokens: it.cache_creation_input_tokens ?? 0,
              cacheReadTokens: it.cache_read_input_tokens ?? 0,
            };
          }
        } else {
          yield {
            type: 'usage',
            model: final.model,
            inputTokens: final.usage.input_tokens ?? 0,
            outputTokens: final.usage.output_tokens ?? 0,
            cacheWriteTokens: final.usage.cache_creation_input_tokens ?? 0,
            cacheReadTokens: final.usage.cache_read_input_tokens ?? 0,
          };
        }
        yield { type: 'stop', reason: final.stop_reason === 'refusal' ? 'refusal' : final.stop_reason === 'max_tokens' ? 'max_tokens' : 'end' };
      } catch (e) {
        throw mapError(e, req.signal);
      }
    },
  };
}
