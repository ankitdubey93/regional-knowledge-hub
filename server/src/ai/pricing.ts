import { roundDiv } from '@chub/shared/utils/money';

export interface ModelPrice {
  inputMicroUsdPerMTok: number;
  outputMicroUsdPerMTok: number;
  /** Cache-read price as fortieths of the input price: 4 = 0.1x, 2 = 0.05x. */
  cacheReadFortieths: number;
}

// Anthropic data residency page, read 2026-10-31: US-only inference is 1.1x on Claude 4.6 and later.
// Anthropic: https://platform.claude.com/docs/en/about-claude/pricing, read 2026-10-28. Gemini: https://ai.google.dev/gemini-api/docs/pricing (updated 2026-10-27), read 2026-10-28; gemini-3.8-flash read 2026-10-30.
// Haiku 5.5 is priced at its >100k-token tier so the spend guard never under-counts a long prompt.
// gemini-3.8-flash is priced at the rate the page gives from 2027-01-01 (double the 2026 rate), for the same reason.
// Gemini bills thinking tokens at the output price, so geminiChat counts them as output.
export const PRICES_CHECKED_ON = '2026-10-28';
export const PRICES: Readonly<Record<string, ModelPrice>> = {
  'claude-opus-5-5': { inputMicroUsdPerMTok: 4_000_000, outputMicroUsdPerMTok: 20_000_000, cacheReadFortieths: 2 },
  'claude-opus-5': { inputMicroUsdPerMTok: 5_000_000, outputMicroUsdPerMTok: 25_000_000, cacheReadFortieths: 4 },
  'claude-opus-4-8': { inputMicroUsdPerMTok: 5_000_000, outputMicroUsdPerMTok: 25_000_000, cacheReadFortieths: 4 },
  'claude-sonnet-5-5': { inputMicroUsdPerMTok: 2_000_000, outputMicroUsdPerMTok: 10_000_000, cacheReadFortieths: 2 },
  'claude-haiku-5-5': { inputMicroUsdPerMTok: 500_000, outputMicroUsdPerMTok: 2_500_000, cacheReadFortieths: 4 },
  'gemini-2.5-flash': { inputMicroUsdPerMTok: 300_000, outputMicroUsdPerMTok: 2_500_000, cacheReadFortieths: 4 },
  'gemini-3.8-flash': { inputMicroUsdPerMTok: 1_500_000, outputMicroUsdPerMTok: 7_500_000, cacheReadFortieths: 4 },
};

/** The highest listed tier, so a model missing from PRICES (a refusal fallback, the stub) is never under-counted. */
export const UNKNOWN_MODEL_PRICE: ModelPrice = { inputMicroUsdPerMTok: 10_000_000, outputMicroUsdPerMTok: 50_000_000, cacheReadFortieths: 4 };

export interface UsageTokens {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
}

export function isPriced(model: string): boolean {
  return Object.prototype.hasOwnProperty.call(PRICES, model);
}

/** Integer micro-USD: input x1, cache writes x1.25, cache reads at the model's cacheReadFortieths/40 of the input price; output at the output price. US-only inference (Anthropic inference_geo "us") is 1.1x every category. */
export function costMicroUsd(model: string, u: UsageTokens, opts: { usOnly?: boolean } = {}): number {
  const p = (isPriced(model) ? PRICES[model] : undefined) ?? UNKNOWN_MODEL_PRICE;
  const pin = p.inputMicroUsdPerMTok;
  const pout = p.outputMicroUsdPerMTok;
  const numerator = 40 * u.inputTokens * pin + 50 * u.cacheWriteTokens * pin + p.cacheReadFortieths * u.cacheReadTokens * pin + 40 * u.outputTokens * pout;
  return opts.usOnly === true ? roundDiv(numerator * 11, 400_000_000) : roundDiv(numerator, 40_000_000);
}

/** '5' -> 5_000_000; '2.5' -> 2_500_000. Throws RangeError on anything but up to 6 digits and 2 decimals. */
export function usdToMicroUsd(usd: string): number {
  const m = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(usd.trim());
  if (!m) throw new RangeError(`Not a USD amount: ${usd}`);
  const whole = Number(m[1]);
  const frac = Number((m[2] ?? '').padEnd(2, '0'));
  return whole * 1_000_000 + frac * 10_000;
}
