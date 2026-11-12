import { PREPARATION_MODELS } from './model-registry';

export interface StoryboardImageQuote {
  version: 'STORYBOARD_IMAGE_V1'; model: string; endpointFingerprint: string;
  resolution: '1K'; aspectRatio: '1:1'; sourceCount: number;
  baseProviderUsd: number; maximumProviderCostUsd: number;
}
const object = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};

/** Only explicit image-unit pricing with free reference inputs is certified.
 * Dynamic reasoning prices and unknown billable controls fail before purchase. */
export function certifyStoryboardImageQuote(value: unknown, sourceCount: number): StoryboardImageQuote {
  const catalog = object(value), model = PREPARATION_MODELS.storyboard.id;
  if(model!==PREPARATION_MODELS.storyboard.certifiedModel)throw new Error('STORYBOARD_IMAGE_MODEL_REVIEW_REQUIRED');
  if (!Number.isInteger(sourceCount) || sourceCount < 0 || sourceCount > 4 || catalog.id !== model || !Array.isArray(catalog.endpoints) || !catalog.endpoints.length) throw new Error('STORYBOARD_IMAGE_ROUTE_UNAVAILABLE');
  const endpoints = catalog.endpoints.map(object);
  const prices: number[] = [];
  for (const endpoint of endpoints) {
    const parameters = object(endpoint.supported_parameters);
    if (!Array.isArray(parameters.resolution?.values) || !parameters.resolution.values.includes('1K') || !Array.isArray(parameters.aspect_ratio?.values) || !parameters.aspect_ratio.values.includes('1:1') || !Number.isInteger(parameters.n?.min) || !Number.isInteger(parameters.n?.max) || parameters.n.min>1 || parameters.n.max<1 || sourceCount > 0 && (!Number.isInteger(parameters.input_references?.max) || parameters.input_references.max < sourceCount)) throw new Error('STORYBOARD_IMAGE_CONTROLS_UNAVAILABLE');
    if (!Array.isArray(endpoint.pricing) || !endpoint.pricing.length) throw new Error('STORYBOARD_IMAGE_PRICE_UNAVAILABLE');
    let output: number | undefined, freeInput = sourceCount === 0;
    for (const raw of endpoint.pricing) {
      const sku = object(raw), cost = Number(sku.cost_usd);
      if (!Number.isFinite(cost) || cost < 0 || sku.unit !== 'image' || !['input_image', 'output_image'].includes(sku.billable)) throw new Error('STORYBOARD_IMAGE_PRICE_UNAVAILABLE');
      if (sku.billable === 'input_image') { if (cost !== 0) throw new Error('STORYBOARD_IMAGE_INPUT_PRICE_UNAVAILABLE'); freeInput = true; }
      if (sku.billable === 'output_image' && String(sku.variant).toLowerCase() === '1k') output = Math.max(output ?? 0, cost);
    }
    if (!freeInput || !output || output > 1) throw new Error('STORYBOARD_IMAGE_PRICE_UNAVAILABLE');
    prices.push(output);
  }
  const baseProviderUsd = Math.max(...prices);
  return { version: 'STORYBOARD_IMAGE_V1', model, endpointFingerprint: JSON.stringify(endpoints), resolution: '1K', aspectRatio: '1:1', sourceCount, baseProviderUsd, maximumProviderCostUsd: Math.ceil((baseProviderUsd * 1.05 + .01) * 1e6) / 1e6 };
}

export function sameStoryboardImageQuote(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
