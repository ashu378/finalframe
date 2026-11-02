import { PREPARATION_MODELS } from './model-registry';

export type PreparationKind = 'CHARACTER_REFERENCE' | 'NARRATION' | 'VOICE_PREVIEW' | 'TRANSCRIPT';
export function preparationModel(kind: PreparationKind, clone = false) {
  return kind === 'CHARACTER_REFERENCE' ? PREPARATION_MODELS.image : kind === 'TRANSCRIPT' ? PREPARATION_MODELS.transcription : clone ? PREPARATION_MODELS.referenceVoice : PREPARATION_MODELS.narration;
}
function row(value: unknown): Record<string, any> { return value && typeof value === 'object' ? value as Record<string, any> : {}; }
function positive(value: unknown) { const n = Number(value); if (!Number.isFinite(n) || n <= 0) throw new Error('Verified preparation pricing is unavailable.'); return n; }
/** Only server actions call this public, no-cost catalog endpoint. Every
 * endpoint is priced conservatively; unknown billing units fail closed. */
export async function quotePreparation(input: { kind: PreparationKind; text?: string; clone?: boolean; durationSeconds?: number }, fetcher: typeof fetch = fetch) {
  const config = preparationModel(input.kind, input.clone);
  if ('certifiedModel' in config && config.id !== config.certifiedModel) throw new Error('This preparation model needs a billing-unit review.');
  const image = input.kind === 'CHARACTER_REFERENCE';
  const path = image ? `/images/models/${config.id}/endpoints` : `/models/${config.id}/endpoints`;
  const response = await fetcher(`https://openrouter.ai/api/v1${path}`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error('Preparation catalog unavailable.');
  const payload = row(await response.json());
  const catalog = image ? payload : row(payload.data);
  if (catalog.id !== config.id || !Array.isArray(catalog.endpoints) || !catalog.endpoints.length) throw new Error('Preparation model is unavailable.');
  const endpoints = catalog.endpoints.map(row);
  if (!image && !input.clone && endpoints.some((endpoint: Record<string, any>) => Number(row(endpoint.pricing).completion || 0) !== 0)) throw new Error('Preparation output billing needs a new review.');
  let usd: number;
  if (image) {
    const costs = endpoints.map((endpoint: Record<string, any>) => {
      const skus = Array.isArray(endpoint.pricing) ? endpoint.pricing.filter((item: Record<string, unknown>) => item.billable === 'output_image' && item.unit === 'image') : [];
      if (!skus.length) throw new Error('Image price cannot be bounded for every endpoint.');
      return Math.max(...skus.map((sku: Record<string, unknown>) => positive(sku.cost_usd)));
    });
    if (!costs.length) throw new Error('Image price cannot be bounded.');
    // The live 1K request exceeded its base output-image SKU. Reserve the
    // largest documented output variant plus a margin rather than assuming
    // the base SKU is a complete receipt. Settlement uses actual reported cost.
    usd = Math.max(...costs) * 1.05 + .01;
  } else if (input.kind === 'TRANSCRIPT') {
    if (!Number.isFinite(input.durationSeconds) || input.durationSeconds! <= 0 || input.durationSeconds! > 60) throw new Error('Use a recording of at most 60 seconds.');
    usd = Math.max(...endpoints.map((endpoint: Record<string, any>) => positive(row(endpoint.pricing).prompt))) * Math.ceil(input.durationSeconds!);
  } else if (input.clone) {
    // OpenRouter's current model contract is an endpoint-wide maximum, not a
    // requested duration: https://openrouter.ai/provider/seed . The live model
    // description must still certify that bound; changed contracts fail closed.
    if (typeof catalog.description !== 'string' || !/output is limited to 120 seconds per request/i.test(catalog.description)) throw new Error('Reference synthesis needs a verified hard output-duration bound.');
    if (endpoints.some((endpoint: Record<string, any>) => endpoint.supports_voice_cloning !== true)) throw new Error('Reference synthesis is not supported by every eligible endpoint.');
    usd = Math.max(...endpoints.map((endpoint: Record<string, any>) => positive(row(endpoint.pricing).completion))) * PREPARATION_MODELS.referenceVoice.maxOutputSeconds;
  } else {
    usd = Math.max(...endpoints.map((endpoint: Record<string, any>) => positive(row(endpoint.pricing).prompt))) * (input.text || '').length;
  }
  if (!Number.isFinite(usd) || usd <= 0 || usd > 2) throw new Error('Preparation estimate is outside the controlled test limit.');
  return { model: config.id, capability: config.capability, estimatedProviderCostUsd: Math.ceil(usd * 1_000_000) / 1_000_000, checkedAt: Date.now(), billing: config.billing };
}
