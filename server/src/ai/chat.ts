import { env } from '../env';
import { anthropicProvider } from './anthropic';
import { geminiChatProvider } from './geminiChat';
import { isPriced } from './pricing';

export interface ChatTurn { role: 'user' | 'assistant'; text: string }
export interface ChatRequest { system: string; messages: ChatTurn[]; maxTokens: number; signal: AbortSignal }
export type ChatEvent =
  | { type: 'text'; text: string }
  | { type: 'usage'; model: string; inputTokens: number; outputTokens: number; cacheWriteTokens: number; cacheReadTokens: number }
  | { type: 'stop'; reason: 'end' | 'max_tokens' | 'refusal' };
export interface ChatProvider { readonly name: string; readonly model: string; stream(req: ChatRequest): AsyncIterable<ChatEvent> }
export type ChatProviderErrorCode = 'auth' | 'rate_limited' | 'overloaded' | 'bad_request' | 'network' | 'unknown';
export class ChatProviderError extends Error {
  readonly code: ChatProviderErrorCode;
  constructor(message: string, code: ChatProviderErrorCode) {
    super(message);
    this.code = code;
  }
}
export const MAX_ANSWER_TOKENS = 8000;

let override: ChatProvider | null | undefined;
/** Tests only (Hard rule 15). undefined restores the env-based default. */
export function setChatProviderForTests(p: ChatProvider | null | undefined): void { override = p; }

/** anthropic + ANTHROPIC_API_KEY -> anthropicProvider; gemini + GEMINI_API_KEY + GEMINI_MODEL -> geminiChatProvider; otherwise null. */
export function currentChatProvider(): ChatProvider | null {
  if (override !== undefined) return override;
  if (env.CHAT_PROVIDER === 'anthropic') {
    return env.ANTHROPIC_API_KEY ? anthropicProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL, { inferenceGeo: env.ANTHROPIC_INFERENCE_GEO }) : null;
  }
  return env.GEMINI_API_KEY && env.GEMINI_MODEL ? geminiChatProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL) : null;
}

/** null, or `No price for chat model "<model>" in server/src/ai/pricing.ts` when the configured provider's model is not priced. */
export function chatConfigProblem(): string | null {
  const p = currentChatProvider();
  if (!p) return null;
  return isPriced(p.model) ? null : `No price for chat model "${p.model}" in server/src/ai/pricing.ts`;
}
