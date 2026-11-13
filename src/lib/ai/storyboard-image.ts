import { REVIEWED_STORYBOARD_IMAGE_MODELS } from './model-registry';

export interface StoryboardImageQuote {
  version: 'STORYBOARD_IMAGE_V1'; model: string; endpointFingerprint: string;
  resolution: '1K'; aspectRatio: '1:1'; sourceCount: number;
  baseProviderUsd: number; maximumProviderCostUsd: number;
}
const object = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};

/** Only reviewed fixed image-unit routes are certified. Reference inputs are
 * charged per actual source; unknown units and controls fail before purchase. */
export function certifyStoryboardImageQuote(value: unknown, sourceCount: number): StoryboardImageQuote {
  const catalog = object(value), model = catalog.id;
  const reviewed = typeof model === 'string' && Object.hasOwn(REVIEWED_STORYBOARD_IMAGE_MODELS, model) ? REVIEWED_STORYBOARD_IMAGE_MODELS[model] : undefined;
  if(!reviewed)throw new Error('STORYBOARD_IMAGE_MODEL_REVIEW_REQUIRED');
  if (!Number.isInteger(sourceCount) || sourceCount < 0 || sourceCount > reviewed.maxReferences || !Array.isArray(catalog.endpoints) || !catalog.endpoints.length) throw new Error('STORYBOARD_IMAGE_ROUTE_UNAVAILABLE');
  const endpoints = catalog.endpoints.map(object);
  const prices: number[] = [];
  for (const endpoint of endpoints) {
    const parameters = object(endpoint.supported_parameters);
    if (!Array.isArray(parameters.resolution?.values) || !parameters.resolution.values.includes('1K') || !Array.isArray(parameters.aspect_ratio?.values) || !parameters.aspect_ratio.values.includes('1:1') || !Number.isInteger(parameters.n?.min) || !Number.isInteger(parameters.n?.max) || parameters.n.min>1 || parameters.n.max<1 || !Number.isInteger(parameters.input_references?.min) || !Number.isInteger(parameters.input_references?.max) || parameters.input_references.min > sourceCount || parameters.input_references.max < sourceCount) throw new Error('STORYBOARD_IMAGE_CONTROLS_UNAVAILABLE');
    if (!Array.isArray(endpoint.pricing) || !endpoint.pricing.length) throw new Error('STORYBOARD_IMAGE_PRICE_UNAVAILABLE');
    let output: number | undefined, input: number | undefined;
    for (const raw of endpoint.pricing) {
      const sku = object(raw), cost = Number(sku.cost_usd);
      if (!(typeof sku.cost_usd === 'number' || typeof sku.cost_usd === 'string' && sku.cost_usd.trim()) || !Number.isFinite(cost) || cost < 0 || sku.unit !== 'image' || !['input_image', 'output_image'].includes(sku.billable)) throw new Error('STORYBOARD_IMAGE_PRICE_UNAVAILABLE');
      if (sku.billable === 'input_image') { if (sku.variant !== undefined) throw new Error('STORYBOARD_IMAGE_INPUT_PRICE_UNAVAILABLE'); input = Math.max(input ?? 0, cost); }
      if (sku.billable === 'output_image') {
        const variant = String(sku.variant).toLowerCase();
        if (!['1k', '2k'].includes(variant)) throw new Error('STORYBOARD_IMAGE_PRICE_UNAVAILABLE');
        if (variant === '1k') output = Math.max(output ?? 0, cost);
      }
    }
    if (sourceCount > 0 && input === undefined || !output || output > 1 || (input ?? 0) > 1) throw new Error('STORYBOARD_IMAGE_PRICE_UNAVAILABLE');
    prices.push(output + (input ?? 0) * sourceCount);
  }
  const baseProviderUsd = Math.max(...prices);
  return { version: 'STORYBOARD_IMAGE_V1', model, endpointFingerprint: JSON.stringify(endpoints), resolution: '1K', aspectRatio: '1:1', sourceCount, baseProviderUsd, maximumProviderCostUsd: Math.ceil((baseProviderUsd * 1.05 + .01) * 1e6) / 1e6 };
}

export function sameStoryboardImageQuote(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
