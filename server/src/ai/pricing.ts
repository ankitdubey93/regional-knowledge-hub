import { roundDiv } from '@chub/shared/utils/money';

export interface ModelPrice {
  inputMicroUsdPerMTok: number;
  outputMicroUsdPerMTok: number;
}

// Anthropic's published per-million-token prices as cached by the claude-api reference on 2026-10-06.
// Not re-checked against https://platform.claude.com/docs/en/about-claude/pricing. No Gemini row yet: add one with a source before configuring Gemini chat.
export const PRICES_CHECKED_ON = '2026-10-06';
export const PRICES: Readonly<Record<string, ModelPrice>> = {
  'claude-opus-5-5': { inputMicroUsdPerMTok: 4_000_000, outputMicroUsdPerMTok: 20_000_000 },
  'claude-opus-5': { inputMicroUsdPerMTok: 5_000_000, outputMicroUsdPerMTok: 25_000_000 },
  'claude-opus-4-8': { inputMicroUsdPerMTok: 5_000_000, outputMicroUsdPerMTok: 25_000_000 },
  'claude-sonnet-5-5': { inputMicroUsdPerMTok: 2_000_000, outputMicroUsdPerMTok: 10_000_000 },
  'claude-haiku-5-5': { inputMicroUsdPerMTok: 100_000, outputMicroUsdPerMTok: 500_000 },
};

/** The highest listed tier, so a model missing from PRICES (a refusal fallback, the stub) is never under-counted. */
export const UNKNOWN_MODEL_PRICE: ModelPrice = { inputMicroUsdPerMTok: 10_000_000, outputMicroUsdPerMTok: 50_000_000 };

export interface UsageTokens {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
}

export function isPriced(model: string): boolean {
  return Object.prototype.hasOwnProperty.call(PRICES, model);
}

/** Integer micro-USD: input x1, cache writes x1.25, cache reads x0.1 of the input price; output at the output price. */
export function costMicroUsd(model: string, u: UsageTokens): number {
  const p = (isPriced(model) ? PRICES[model] : undefined) ?? UNKNOWN_MODEL_PRICE;
  const pin = p.inputMicroUsdPerMTok;
  const pout = p.outputMicroUsdPerMTok;
  return roundDiv(
    40 * u.inputTokens * pin + 50 * u.cacheWriteTokens * pin + 4 * u.cacheReadTokens * pin + 40 * u.outputTokens * pout,
    40_000_000,
  );
}

/** '5' -> 5_000_000; '2.5' -> 2_500_000. Throws RangeError on anything but up to 6 digits and 2 decimals. */
export function usdToMicroUsd(usd: string): number {
  const m = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(usd.trim());
  if (!m) throw new RangeError(`Not a USD amount: ${usd}`);
  const whole = Number(m[1]);
  const frac = Number((m[2] ?? '').padEnd(2, '0'));
  return whole * 1_000_000 + frac * 10_000;
}
