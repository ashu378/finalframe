import type { DiscoveredModel } from '../src/lib/ai/model-discovery';

export const TEXT_OUTPUT_TOKENS = 8192;
export const MAX_TEXT_REQUEST_BYTES = 64 * 1024;

/** Text-only envelope. UTF-8 bytes plus fixed provider/template overhead is a
 * conservative token allowance; completion includes reasoning tokens. Price
 * ceilings are also sent to OpenRouter to prohibit a more expensive endpoint. */
export function quoteTextRequest(model: DiscoveredModel, envelope: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(envelope)).byteLength;
  if (bytes > MAX_TEXT_REQUEST_BYTES) throw new Error('TEXT_REQUEST_TOO_LARGE');
  const input = model.pricing?.input;
  const output = model.pricing?.output;
  const request = model.pricing?.request ?? 0;
  if (input === undefined || output === undefined || ![input, output, request].every((n) => Number.isFinite(n) && n >= 0)) throw new Error('TEXT_PRICE_UNAVAILABLE');
  const inputTokens = bytes + 4096;
  if (!model.contextLength || inputTokens + TEXT_OUTPUT_TOKENS > model.contextLength) throw new Error('TEXT_CONTEXT_TOO_SMALL');
  const estimate = inputTokens * input + TEXT_OUTPUT_TOKENS * output + request;
  if (!Number.isFinite(estimate) || estimate <= 0) throw new Error('TEXT_PRICE_UNAVAILABLE');
  return { estimatedCostUsd: Math.ceil(estimate * 1_000_000) / 1_000_000, maxTokens: TEXT_OUTPUT_TOKENS, priceCeiling: { prompt: input * 1_000_000, completion: output * 1_000_000 } };
}
