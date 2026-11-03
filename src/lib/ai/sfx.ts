import { sha256Equal } from '../../../renderer/src/media/sha256';
import { REVIEWED_OPERATION_CONTRACTS } from './model-registry';

const row = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const stable = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
export const SFX_LIMITS = { maxBytes: 8 * 1024 * 1024, maxOriginalSeconds: 120, maxPromptCharacters: 3000, timeoutMs: 180000, maxCatalogBytes: 1024 * 1024, maxQcRetries: 24 } as const;
export function sfxError(code: string) { return Object.assign(new Error(code), { code }); }
export function validateSfxPrompt(value: unknown): string {
    if (typeof value !== 'string' || !value.trim() || value.length > SFX_LIMITS.maxPromptCharacters || /@Audio\d+/i.test(value)) throw sfxError('SFX_REQUEST_INVALID');
    return value.trim();
}
export function buildSoundEffectRequest(input: unknown) {
    const request = row(input), contract = REVIEWED_OPERATION_CONTRACTS.sfx;
    if (Object.keys(request).some(key => !['model', 'prompt'].includes(key)) || request.model !== contract.modelId) throw sfxError('SFX_REQUEST_INVALID');
    return { model: contract.modelId, input: validateSfxPrompt(request.prompt), response_format: 'mp3' as const };
}
export interface SfxQuoteCertificate {
    version: string; model: string; canonicalSlug: string; providerTag: string; endpointName: string;
    endpointFingerprint: string; sku: 'original_duration_seconds'; maximumOriginalSeconds: 120;
    rateUsdPerSecond: number; baseProviderCeilingUsd: number; reservedProviderUsd: number; format: 'mp3'; checkedAt: number;
}
/** The policy calculation matches videoBudgetReservationUsd; canonical create
 * and fence independently require that shared reservation helper's result. */
function reservation(base: number) { return Math.ceil((base * 1.05 + .01) * 1_000_000) / 1_000_000; }
export function certifySfxQuote(models: unknown, endpoints: unknown, checkedAt = Date.now()): SfxQuoteCertificate {
    const contract = REVIEWED_OPERATION_CONTRACTS.sfx;
    const list = row(models).data, detail = row(row(endpoints).data);
    const model = row(Array.isArray(list) ? list.find((entry: any) => entry.id === contract.modelId) : undefined);
    const values = Array.isArray(detail.endpoints) ? detail.endpoints : [], endpoint = row(values[0]);
    const architecture = row(model.architecture), pricing = row(model.pricing), cost = row(endpoint.pricing);
    const numeric = (value: unknown, expected: number) => (typeof value === 'string' && value.trim() !== '' || typeof value === 'number') && Number(value) === expected;
    if (model.id !== contract.modelId || model.canonical_slug !== contract.canonicalSlug || stable(architecture.input_modalities) !== stable(['text']) || stable(architecture.output_modalities) !== stable(['speech']) || model.supported_voices !== null || stable(model.supported_parameters) !== '[]' || stable(model.endpoints) !== stable(['/api/v1/audio/speech']) || detail.id !== contract.modelId || values.length !== 1 || endpoint.name !== contract.endpointName || endpoint.tag !== contract.providerTag || endpoint.provider_name !== 'Seed' || endpoint.model_id !== contract.modelId || endpoint.status !== 0 || endpoint.supports_voice_cloning !== true || endpoint.supports_multiple_audio_references !== true || endpoint.supports_image_reference !== true || endpoint.supports_diarization !== false || stable(endpoint.supported_parameters) !== '[]' || stable(Object.keys(pricing).sort()) !== stable(['completion', 'prompt']) || !numeric(pricing.prompt, 0) || !numeric(pricing.completion, contract.rateUsdPerSecond) || stable(Object.keys(cost).sort()) !== stable(['completion', 'discount', 'prompt']) || !numeric(cost.prompt, 0) || !numeric(cost.completion, contract.rateUsdPerSecond) || !numeric(cost.discount, 0) || !Number.isFinite(checkedAt)) throw sfxError('SFX_CATALOG_CHANGED');
    const facts = { model: { id: model.id, canonical_slug: model.canonical_slug, architecture: { input_modalities: architecture.input_modalities, output_modalities: architecture.output_modalities }, supported_voices: model.supported_voices, supported_parameters: model.supported_parameters, endpoints: model.endpoints, pricing }, endpoints: { id: detail.id, endpoints: [{ name: endpoint.name, tag: endpoint.tag, provider_name: endpoint.provider_name, model_id: endpoint.model_id, status: endpoint.status, supports_voice_cloning: endpoint.supports_voice_cloning, supports_multiple_audio_references: endpoint.supports_multiple_audio_references, supports_image_reference: endpoint.supports_image_reference, supports_diarization: endpoint.supports_diarization, supported_parameters: endpoint.supported_parameters, pricing: cost }] } };
    const base = contract.maxOriginalOutputSeconds * contract.rateUsdPerSecond;
    return { version: contract.version, model: contract.modelId, canonicalSlug: contract.canonicalSlug, providerTag: contract.providerTag, endpointName: contract.endpointName, endpointFingerprint: stable(facts), sku: 'original_duration_seconds', maximumOriginalSeconds: 120, rateUsdPerSecond: contract.rateUsdPerSecond, baseProviderCeilingUsd: base, reservedProviderUsd: reservation(base), format: 'mp3', checkedAt };
}
export function assertSfxQuote(value: unknown): SfxQuoteCertificate {
    const quote = row(value);
    if (typeof quote.endpointFingerprint !== 'string' || quote.endpointFingerprint.length > 16000 || typeof quote.checkedAt !== 'number' || !Number.isFinite(quote.checkedAt)) throw sfxError('SFX_QUOTE_INVALID');
    let facts; try { facts = JSON.parse(quote.endpointFingerprint); } catch { throw sfxError('SFX_QUOTE_INVALID'); }
    const expected = certifySfxQuote({ data: [row(facts).model] }, { data: row(facts).endpoints }, quote.checkedAt);
    if (stable(quote) !== stable(expected)) throw sfxError('SFX_QUOTE_INVALID');
    return expected;
}
export function freshSfxQuote(value: unknown, timestamp = Date.now()) { const quote = assertSfxQuote(value); if (timestamp - quote.checkedAt > 30000 || quote.checkedAt > timestamp + 1000) throw sfxError('SFX_QUOTE_STALE'); return quote; }
export function sameSfxQuote(left: unknown, right: unknown) { return stable({ ...assertSfxQuote(left), checkedAt: 0 }) === stable({ ...assertSfxQuote(right), checkedAt: 0 }); }
export function sfxRequestHash(productionId: string, text: unknown, quoteValue: unknown) {
    const quote = assertSfxQuote(quoteValue);
    return stable({ version: quote.version, productionId, request: buildSoundEffectRequest({ model: quote.model, prompt: validateSfxPrompt(text) }), quote: { ...quote, checkedAt: 0 } });
}
export interface SfxEstimateConsent { requestHash: string; quoteFingerprint: string; maximumProviderHoldUsd: number; }
export function assertSfxConsent(value: unknown, productionId: string, text: unknown, quoteValue: unknown) {
    const quote = freshSfxQuote(quoteValue), consent = row(value);
    if (stable(Object.keys(consent).sort()) !== stable(['maximumProviderHoldUsd', 'quoteFingerprint', 'requestHash']) || consent.requestHash !== sfxRequestHash(productionId, text, quote) || consent.quoteFingerprint !== quote.endpointFingerprint || !Number.isFinite(consent.maximumProviderHoldUsd) || consent.maximumProviderHoldUsd !== quote.reservedProviderUsd) throw sfxError('SFX_ESTIMATE_REVIEW_REQUIRED');
    return { requestHash: consent.requestHash as string, quoteFingerprint: consent.quoteFingerprint as string, maximumProviderHoldUsd: consent.maximumProviderHoldUsd as number };
}
async function boundedJson(response: Response) {
    if (!response.ok || !response.body) throw sfxError('SFX_CATALOG_UNAVAILABLE');
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > SFX_LIMITS.maxCatalogBytes) throw sfxError('SFX_CATALOG_TOO_LARGE'); chunks.push(part.value); } } finally { await reader.cancel().catch(() => undefined); }
    const bytes = new Uint8Array(size); let at = 0; for (const part of chunks) { bytes.set(part, at); at += part.length; }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw sfxError('SFX_CATALOG_INVALID'); }
}
export async function quoteSfx(fetcher: typeof fetch = fetch) {
    const model = REVIEWED_OPERATION_CONTRACTS.sfx.modelId;
    const responses = await Promise.all([fetcher('https://openrouter.ai/api/v1/models?output_modalities=speech', { redirect: 'error', signal: AbortSignal.timeout(15000) }), fetcher(`https://openrouter.ai/api/v1/models/${model}/endpoints`, { redirect: 'error', signal: AbortSignal.timeout(15000) })]);
    const values = await Promise.all(responses.map(boundedJson)); return certifySfxQuote(values[0], values[1]);
}
export function assertSfxOutputProbe(value: unknown, savedValue: unknown) {
    const proof = row(value), saved = row(savedValue);
    const fields=['durationSeconds','hasAudio','hasVideo','audioCodec','audioFormat','sampleRate','channels','byteSize','checksum','durationMeasurement','decodedSampleCount','decodedSampleRate'];
    if(Object.keys(proof).some(key=>!fields.includes(key)))throw sfxError('SFX_OUTPUT_INVALID');
    if (proof.hasAudio !== true || proof.hasVideo !== false || proof.audioCodec !== 'mp3' || proof.audioFormat !== 'mp3' || ![1, 2].includes(proof.channels) || !Number.isSafeInteger(proof.sampleRate) || proof.sampleRate < 8000 || proof.sampleRate > 48000 || proof.durationMeasurement !== 'DECODED_PCM_SAMPLES_V1' || proof.decodedSampleRate !== 16000 || !Number.isSafeInteger(proof.decodedSampleCount) || proof.decodedSampleCount <= 0 || proof.decodedSampleCount > SFX_LIMITS.maxOriginalSeconds * 16000 || proof.durationSeconds !== proof.decodedSampleCount / 16000 || !Number.isSafeInteger(saved.byteSize) || saved.byteSize <= 0 || saved.byteSize > SFX_LIMITS.maxBytes || proof.byteSize !== saved.byteSize || !sha256Equal(proof.checksum, saved.checksum)) throw sfxError('SFX_OUTPUT_INVALID');
    return proof.durationSeconds as number;
}
export function retryableSfxQc(code: string) { return ['SFX_QC_UNAVAILABLE', 'SFX_QC_LEASE_EXPIRED'].includes(code); }
export function safeSfxQcCode(code: string) { return ['SFX_OUTPUT_INVALID', 'SFX_OUTPUT_CHANGED', 'SFX_QC_INVALID_RESPONSE', 'SFX_QC_AUTHORITY_DENIED'].includes(code) ? code : 'SFX_OUTPUT_REVIEW_REQUIRED'; }
