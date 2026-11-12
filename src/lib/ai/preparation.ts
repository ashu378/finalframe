import { certifyStoryboardImageQuote, type StoryboardImageQuote } from './storyboard-image';
import {quoteSfx,validateSfxPrompt,type SfxQuoteCertificate} from './sfx';
import {quoteMusic,type MusicQuoteCertificate} from './music';
import { PREPARATION_MODELS, REVIEWED_OPERATION_CONTRACTS } from './model-registry';
import { TRANSCRIPT_SEGMENT_REQUEST } from './transcription';

export type PreparationKind = 'CHARACTER_REFERENCE' | 'NARRATION' | 'VOICE_PREVIEW' | 'TRANSCRIPT' | 'MUSIC' | 'SFX';
export function preparationModel(kind: PreparationKind, clone = false, storyboardImage = false) {
  if (storyboardImage) { if (kind !== 'CHARACTER_REFERENCE' || clone) throw new Error('STORYBOARD_IMAGE_INVALID'); return PREPARATION_MODELS.storyboard; }
  if(kind==='SFX')return PREPARATION_MODELS.sfx;
  if(kind==='MUSIC')return PREPARATION_MODELS.music;
  return kind === 'CHARACTER_REFERENCE' ? PREPARATION_MODELS.image : kind === 'TRANSCRIPT' ? PREPARATION_MODELS.transcription : clone ? PREPARATION_MODELS.referenceVoice : PREPARATION_MODELS.narration;
}
function row(value: unknown): Record<string, any> { return value && typeof value === 'object' ? value as Record<string, any> : {}; }
function positive(value: unknown) { const n = Number(value); if (!Number.isFinite(n) || n <= 0) throw new Error('Verified preparation pricing is unavailable.'); return n; }
export interface ReferenceVoiceQuoteCertificate {
  version: string; model: string; canonicalSlug: string; endpointFingerprint: string;
  maxOriginalOutputSeconds: number; sku: 'original_duration_seconds'; rateUsdPerSecond: number; costUsd: number;
}
export function certifyReferenceVoiceEndpoints(catalog: Record<string, any>): ReferenceVoiceQuoteCertificate {
  const contract = REVIEWED_OPERATION_CONTRACTS.referenceVoice;
  const endpoints = Array.isArray(catalog.endpoints) ? catalog.endpoints.map(row) : [];
  if (catalog.id !== contract.modelId || endpoints.length !== 1) throw new Error('Reference synthesis needs the reviewed model version and endpoint.');
  const endpoint = endpoints[0]; const pricing = row(endpoint.pricing);
  if (endpoint.supports_voice_cloning !== true) throw new Error('Reference synthesis is not supported by every eligible endpoint.');
  if (endpoint.name !== contract.endpointName || endpoint.tag !== contract.providerTag || endpoint.model_id !== contract.modelId || endpoint.status !== 0 || endpoint.supports_multiple_audio_references !== true || endpoint.supports_image_reference !== true || Object.keys(pricing).length !== 3 || Object.keys(pricing).some(key => !['prompt','completion','discount'].includes(key)) || ![0,'0'].includes(pricing.prompt) || ![0,'0'].includes(pricing.discount) || Number(pricing.completion) !== contract.rateUsdPerSecond) throw new Error('Reference synthesis endpoint version, controls or billing changed.');
  const endpointFingerprint = JSON.stringify([contract.version, contract.canonicalSlug, endpoint.name, endpoint.tag, endpoint.model_id, endpoint.status, endpoint.supports_voice_cloning, endpoint.supports_multiple_audio_references, endpoint.supports_image_reference, Object.entries(pricing).sort(([a],[b]) => a.localeCompare(b))]);
  return { version: contract.version, model: contract.modelId, canonicalSlug: contract.canonicalSlug, endpointFingerprint, maxOriginalOutputSeconds: contract.maxOriginalOutputSeconds, sku: 'original_duration_seconds', rateUsdPerSecond: contract.rateUsdPerSecond, costUsd: contract.maxOriginalOutputSeconds * contract.rateUsdPerSecond };
}
export function assertReferenceVoiceQuote(value: unknown): ReferenceVoiceQuoteCertificate {
  const quote = row(value); const contract = REVIEWED_OPERATION_CONTRACTS.referenceVoice;
  if (quote.version !== contract.version || quote.model !== contract.modelId || quote.canonicalSlug !== contract.canonicalSlug || quote.maxOriginalOutputSeconds !== contract.maxOriginalOutputSeconds || quote.sku !== 'original_duration_seconds' || quote.rateUsdPerSecond !== contract.rateUsdPerSecond || quote.costUsd !== contract.maxOriginalOutputSeconds * contract.rateUsdPerSecond || typeof quote.endpointFingerprint !== 'string' || quote.endpointFingerprint.length > 8000) throw new Error('Reference synthesis needs the reviewed original-duration certificate.');
  // Recreate authority from the frozen endpoint facts instead of accepting an
  // arbitrary matching version string supplied by a caller.
  let facts; try { facts = JSON.parse(quote.endpointFingerprint); } catch { throw new Error('Invalid reference endpoint certificate.'); }
  if (!Array.isArray(facts) || facts.length !== 10) throw new Error('Invalid reference endpoint certificate.');
  const expected = certifyReferenceVoiceEndpoints({ id: contract.modelId, endpoints: [{ name: facts[2], tag: facts[3], model_id: facts[4], status: facts[5], supports_voice_cloning: facts[6], supports_multiple_audio_references: facts[7], supports_image_reference: facts[8], pricing: Object.fromEntries(Array.isArray(facts[9]) ? facts[9] : []) }] });
  if (quote.endpointFingerprint !== expected.endpointFingerprint || JSON.stringify(Object.keys(expected).sort()) !== JSON.stringify(Object.keys(quote).sort())) throw new Error('Reference endpoint certificate changed.');
  return expected;
}
/** Only server actions call this public, no-cost catalog endpoint. Every
 * endpoint is priced conservatively; unknown billing units fail closed. */
export interface PreparationQuote {storyboardImageQuote?:StoryboardImageQuote;model:string;capability:typeof PREPARATION_MODELS[keyof typeof PREPARATION_MODELS]['capability'];estimatedProviderCostUsd:number;checkedAt:number;billing:string;musicQuote?:MusicQuoteCertificate;sfxQuote?:SfxQuoteCertificate;referenceVoiceQuote?:ReferenceVoiceQuoteCertificate;billableInputSeconds?:number;durationMeasurement?:'DECODED_PCM_SAMPLES_V1';inputDurationSeconds?:number;transcriptionOptions?:typeof TRANSCRIPT_SEGMENT_REQUEST}
export async function quotePreparation(input: { kind: PreparationKind; text?: string; clone?: boolean; durationSeconds?: number; durationMeasurement?: 'DECODED_PCM_SAMPLES_V1'; imageRequest?: {sourceAssetIds:string[]} }, fetcher: typeof fetch = fetch):Promise<PreparationQuote> {
  if(input.kind==='SFX'&&process.env.FINALFRAME_SFX_PREPARATION_ENABLED!=='true')throw new Error('Sound effect generation is not enabled.');
  const config = preparationModel(input.kind, input.clone, Boolean(input.imageRequest));
  if ('certifiedModel' in config && config.id !== config.certifiedModel) throw new Error('This preparation model needs a billing-unit review.');
  if(input.kind==='SFX'){if(input.clone||input.durationSeconds!==undefined)throw new Error('SFX_REQUEST_INVALID');validateSfxPrompt(input.text);const sfxQuote=await quoteSfx(fetcher);return {model:config.id,capability:config.capability,estimatedProviderCostUsd:sfxQuote.reservedProviderUsd,checkedAt:sfxQuote.checkedAt,billing:config.billing,sfxQuote};}
  if(input.kind==='MUSIC'){if(input.clone||!input.text?.trim()||input.text.length>4000||input.durationSeconds!==undefined)throw new Error('Music accepts a text prompt for one thirty-second clip.');const musicQuote=await quoteMusic(fetcher);return {model:config.id,capability:config.capability,estimatedProviderCostUsd:musicQuote.reservedProviderUsd,checkedAt:musicQuote.checkedAt,billing:config.billing,musicQuote};}
  const image = input.kind === 'CHARACTER_REFERENCE';
  const path = image ? `/images/models/${config.id}/endpoints` : `/models/${config.id}/endpoints`;
  const response = await fetcher(`https://openrouter.ai/api/v1${path}`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error('Preparation catalog unavailable.');
  const payload = row(await response.json());
  const catalog = image ? payload : row(payload.data);
  if (catalog.id !== config.id || !Array.isArray(catalog.endpoints) || !catalog.endpoints.length) throw new Error('Preparation model is unavailable.');
  const endpoints = catalog.endpoints.map(row);
  if (input.imageRequest) { const certificate=certifyStoryboardImageQuote(catalog,input.imageRequest.sourceAssetIds.length); return {model:config.id,capability:config.capability,estimatedProviderCostUsd:certificate.maximumProviderCostUsd,checkedAt:Date.now(),billing:config.billing,storyboardImageQuote:certificate}; }
  if (!image && !input.clone && endpoints.some((endpoint: Record<string, any>) => Number(row(endpoint.pricing).completion || 0) !== 0)) throw new Error('Preparation output billing needs a new review.');
  let usd: number; let referenceVoiceQuote: ReferenceVoiceQuoteCertificate | undefined; let billableInputSeconds: number | undefined;
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
    if (input.durationMeasurement !== 'DECODED_PCM_SAMPLES_V1') throw new Error('Transcription requires a decoded source-duration certificate.');
    billableInputSeconds = Math.ceil(input.durationSeconds! + 1/16000);
    usd = Math.max(...endpoints.map((endpoint: Record<string, any>) => positive(row(endpoint.pricing).prompt))) * billableInputSeconds;
  } else if (input.clone) {
    if (!input.text?.trim() || input.text.length > REVIEWED_OPERATION_CONTRACTS.referenceVoice.maxInputCharacters) throw new Error('Reference speech accepts at most 3000 characters.');
    referenceVoiceQuote = certifyReferenceVoiceEndpoints(catalog);
    usd = referenceVoiceQuote.costUsd;
  } else {
    usd = Math.max(...endpoints.map((endpoint: Record<string, any>) => positive(row(endpoint.pricing).prompt))) * (input.text || '').length;
  }
  if (!Number.isFinite(usd) || usd <= 0 || usd > 2) throw new Error('Preparation estimate is outside the controlled test limit.');
  return { model: config.id, capability: config.capability, estimatedProviderCostUsd: Math.ceil(usd * 1_000_000) / 1_000_000, checkedAt: Date.now(), billing: config.billing, ...(referenceVoiceQuote ? { referenceVoiceQuote } : {}), ...(billableInputSeconds ? {billableInputSeconds, durationMeasurement:input.durationMeasurement,inputDurationSeconds:input.durationSeconds,transcriptionOptions:TRANSCRIPT_SEGMENT_REQUEST} : {}) };
}
