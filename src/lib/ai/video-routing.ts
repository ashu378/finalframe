import type { QualityTier } from '../types/database';
import { REVIEWED_OPERATION_CONTRACTS, getReviewedVideoReferenceContract, getReviewedVideoOutputGrid, type VideoReferenceContract } from './model-registry';
import { normalizeSha256 } from '../../../renderer/src/media/sha256';

export const VIDEO_TYPES = [
    'ANIMATED_COMEDY_2D',
    'REALISTIC_SKIT_UGC',
    'PRODUCT_SAAS_LAUNCH',
    'MOTION_GRAPHICS',
    'EXPLAINER_STORY',
    'CINEMATIC_FILM',
    'MUSIC_VIDEO',
    'SOCIAL_CUTDOWN',
] as const;

export type VideoType = (typeof VIDEO_TYPES)[number];
export type VideoTask = 'GENERATE' | 'EDIT' | 'EXTEND' | 'FRAME_TO_VIDEO';
export const VIDEO_OPERATIONS = ['GENERATE', 'FRAME_TO_VIDEO', 'EDIT', 'APPEARANCE_EDIT', 'OBJECT_REPLACE', 'PERFORMANCE_TRANSFER', 'EXTEND', 'LIP_SYNC', 'UPSCALE'] as const;
export type VideoOperation = typeof VIDEO_OPERATIONS[number];
export type VideoAudioPolicy = 'KEEP_SOURCE' | 'USE_RECORDING' | 'GENERATE' | 'SILENT';
export type VideoProductionPath = 'AI_VIDEO' | 'MOTION_GRAPHICS' | 'COMPOSITED';

export const VIDEO_TYPE_LABELS: Record<VideoType, string> = {
    ANIMATED_COMEDY_2D: '2D comedy and character animation',
    REALISTIC_SKIT_UGC: 'Realistic skits and UGC',
    PRODUCT_SAAS_LAUNCH: 'Product and SaaS launch ads',
    MOTION_GRAPHICS: 'Motion graphics',
    EXPLAINER_STORY: 'Explainers and narrated stories',
    CINEMATIC_FILM: 'Cinematic shorts and films',
    MUSIC_VIDEO: 'Music videos',
    SOCIAL_CUTDOWN: 'Social cutdowns and repurposing',
};

export interface VideoModelCapabilities {
    provider: string;
    modelId: string;
    canonicalSlug?: string;
    available: boolean;
    supportsTextToVideo: boolean;
    supportsImageReferences: boolean;
    supportsVideoReferences: boolean;
    supportsFirstFrame: boolean;
    supportsLastFrame: boolean;
    supportsVideoEdit: boolean;
    supportsVideoExtension: boolean;
    supportsAudio: boolean;
    supportsAudioReferences?: boolean;
    supportsPerformanceTransfer?: boolean;
    supportsLipSync?: boolean;
    supportsUpscale?: boolean;
    upscaleFactor?: { min: number; max: number };
    creativityLevels?: number[];
    supportsSourceAudioPreservation?: boolean;
    supportsCombinedFrameReferences?: boolean;
    /** Advanced operations require explicit endpoint review; catalog presence is insufficient. */
    reviewedOperations?: readonly VideoOperation[];
    supportedDurations: number[];
    supportedResolutions: string[];
    supportedAspectRatios: string[];
    supportedSizes?: string[];
    estimatedCostPerSecond?: number;
    pricingSkus?: Record<string, number>;
    supportedParameters: string[];
}

export interface VideoRoutingRequest {
    videoType: VideoType;
    task: VideoTask;
    operation?: VideoOperation;
    audioPolicy?: VideoAudioPolicy;
    previousJobId?: string;
    previousModelId?: string;
    requiresSourceAudioPreservation?: boolean;
    requiresMask?: boolean;
    upscaleFactor?: number;
    creativity?: number;
    upscaleSource?: UpscaleSourceCertificate;
    editSource?: VideoEditSourceCertificate;
    lipSyncSource?: LipSyncAudioCertificate;
    lipSyncPortrait?: LipSyncPortraitCertificate;
    qualityTier: QualityTier;
    durationSeconds: number;
    aspectRatio: string;
    resolution?: string;
    hasImageReferences?: boolean;
    hasVideoReference?: boolean;
    hasAudioReference?: boolean;
    imageReferenceCount?: number;
    requiresFirstFrame?: boolean;
    requiresLastFrame?: boolean;
    requiresAudio?: boolean;
    maximumCostUsd?: number;
}

export interface VideoRoutePolicy {
    videoType: VideoType;
    qualityTier: QualityTier;
    path: VideoProductionPath;
    preferredModelIds: string[];
    maxCostUsd?: number;
    updatedAt?: number;
    updatedBy?: string;
}

export interface VideoRouteSelection {
    provider: string;
    modelId: string;
    path: VideoProductionPath;
    routeReason: string;
    estimatedCostUsd?: number;
    resolution?: string;
    policyVersion?: number;
    referenceContract?: VideoReferenceContract;
    upscaleQuote?: UpscaleQuoteCertificate;
    editQuote?: VideoEditQuoteCertificate;
    continuationQuote?: ContinuationQuoteCertificate;
    lipSyncQuote?: LipSyncQuoteCertificate;
}

export function buildVideoRouteMetadata(
    request: VideoRoutingRequest,
    selection: VideoRouteSelection,
    options: { modelVersion?: string; referenceAssetIds?: string[]; audioAssetIds?: string[]; costCeilingUsd?: number } = {},
) {
    return {
        ...request,
        routingMode: 'dynamic' as const,
        path: selection.path,
        routeReason: selection.routeReason,
        provider: selection.provider,
        model: selection.modelId,
        policyVersion: selection.policyVersion,
        ...(selection.referenceContract ? {referenceContract:selection.referenceContract} : {}),
        modelVersion: options.modelVersion,
        estimatedProviderCostUsd: selection.estimatedCostUsd,
        ...(selection.upscaleQuote ? { upscaleQuote: selection.upscaleQuote } : {}),
        ...(selection.editQuote ? { editQuote: selection.editQuote } : {}),
        ...(selection.continuationQuote ? { continuationQuote: selection.continuationQuote } : {}),
        ...(selection.lipSyncQuote ? { lipSyncQuote: selection.lipSyncQuote } : {}),
        maximumCostUsd: options.costCeilingUsd,
        referenceAssetIds: options.referenceAssetIds || [],
        audioAssetIds: options.audioAssetIds || [],
    };
}

export function normalizeVideoType(value: unknown): VideoType {
    if (typeof value === 'string' && (VIDEO_TYPES as readonly string[]).includes(value)) return value as VideoType;
    const legacy = String(value || '').toLowerCase();
    if (legacy.includes('comedy') || legacy.includes('cartoon')) return 'ANIMATED_COMEDY_2D';
    if (legacy.includes('ugc') || legacy.includes('skit') || legacy.includes('avatar')) return 'REALISTIC_SKIT_UGC';
    if (legacy.includes('motion')) return 'MOTION_GRAPHICS';
    if (legacy.includes('explain') || legacy.includes('voiceover') || legacy.includes('story')) return 'EXPLAINER_STORY';
    if (legacy.includes('film') || legacy.includes('cinematic')) return 'CINEMATIC_FILM';
    if (legacy.includes('music')) return 'MUSIC_VIDEO';
    if (legacy.includes('social') || legacy.includes('short')) return 'SOCIAL_CUTDOWN';
    if (legacy.includes('product') || legacy.includes('saas') || legacy.includes('commercial') || legacy.includes('business_ad')) return 'PRODUCT_SAAS_LAUNCH';
    return 'SOCIAL_CUTDOWN';
}

export function defaultVideoProductionPath(videoType: VideoType): VideoProductionPath {
    if (videoType === 'MOTION_GRAPHICS') return 'MOTION_GRAPHICS';
    if (videoType === 'PRODUCT_SAAS_LAUNCH' || videoType === 'EXPLAINER_STORY' || videoType === 'MUSIC_VIDEO') return 'COMPOSITED';
    return 'AI_VIDEO';
}

/** Certified against the provider's OpenAPI and OpenRouter's output-MP-second
 * SKUs. Sources checked 2026-11-02: https://api.bfl.ai/openapi.json and
 * https://openrouter.ai/api/v1/videos/models . This is a billing contract,
 * not a preferred generation route. */
export const UPSCALE_BILLING_VERSION = 'FLUX_OUTPUT_MEGAPIXEL_SECOND_V1' as const;
export const UPSCALE_MAX_OUTPUT_PIXELS = 13_750_000;
export interface UpscaleSourceCertificate {
    assetId: string;
    storageId: string;
    checksum: string;
    byteSize: number;
    width: number;
    height: number;
    durationSeconds: number;
}
export interface UpscaleQuoteCertificate {
    version: typeof UPSCALE_BILLING_VERSION;
    catalogFingerprint: string;
    source: UpscaleSourceCertificate;
    factor: number;
    creativity: number;
    maximumOutputPixels: number;
    billableDurationSeconds: number;
    sku: string;
    rateUsdPerMegapixelSecond: number;
    costUsd: number;
}

export const VIDEO_EDIT_BILLING_VERSION = 'FLUX_SOURCE_VIDEO_EDIT_V1' as const;
export interface LipSyncAudioCertificate { assetId: string; storageId: string; checksum: string; byteSize: number; durationSeconds: number; audioCodec: string; audioFormat?: string; durationMeasurement?: 'DECODED_PCM_SAMPLES_V1'; sampleRate: number; channels: number; hasVideo: boolean }
export interface LipSyncPortraitCertificate { assetId: string; storageId: string; checksum: string; byteSize: number; width: number; height: number; imageCodec: string; mimeType: string }
export interface LipSyncQuoteCertificate { version: string; canonicalSlug: string; catalogFingerprint: string; endpointFingerprint: string; source: LipSyncAudioCertificate; portrait: LipSyncPortraitCertificate; billableDurationSeconds: number; sku: string; rateUsdPerSecond: number; costUsd: number }
export function certifyAvatarEndpointCatalog(value: unknown): string {
    const root = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const catalog = root.data && typeof root.data === 'object' ? root.data as Record<string, unknown> : root;
    const contract = REVIEWED_OPERATION_CONTRACTS.suppliedAudioAvatar;
    const endpoints = Array.isArray(catalog.endpoints) ? catalog.endpoints : [];
    const endpoint = endpoints[0] as Record<string, unknown> | undefined; const prices = endpoint?.pricing as Record<string, unknown> | undefined;
    const architecture = catalog.architecture && typeof catalog.architecture === 'object' ? catalog.architecture as Record<string, unknown> : {};
    if (JSON.stringify(Array.isArray(architecture.input_modalities) ? [...architecture.input_modalities].sort() : []) !== JSON.stringify(['audio','image','text']) || JSON.stringify(architecture.output_modalities) !== JSON.stringify(['video'])) throw new Error('Avatar source modalities changed.');
    if (catalog.id !== contract.modelId || endpoints.length !== 1 || endpoint?.name !== contract.endpointName || endpoint.tag !== contract.providerTag || endpoint.model_id !== contract.modelId || endpoint.status !== 0 || !prices || Object.keys(prices).length !== 3 || Object.keys(prices).some(key => !['prompt','completion','discount'].includes(key) || prices[key] !== 0 && prices[key] !== '0') || ['supports_voice_cloning','supports_multiple_audio_references','supports_image_reference','supports_diarization'].some(key=>endpoint[key] !== false)) throw new Error('Avatar endpoint version, provider or controls changed.');
    return avatarEndpointFingerprint();
}
function avatarEndpointFingerprint() { const c = REVIEWED_OPERATION_CONTRACTS.suppliedAudioAvatar; return JSON.stringify([c.version,c.canonicalSlug,c.endpointName,c.providerTag,c.modelId,0,[['completion',0],['discount',0],['prompt',0]],[false,false,false,false],['audio','image','text'],['video']]); }
export function quoteSuppliedAudioAvatar(model: VideoModelCapabilities, request: VideoRoutingRequest): LipSyncQuoteCertificate | undefined {
    const contract = REVIEWED_OPERATION_CONTRACTS.suppliedAudioAvatar; const source = request.lipSyncSource; const portrait = request.lipSyncPortrait;
    if ((request.operation || request.task) !== 'LIP_SYNC' || model.provider !== 'openrouter' || model.modelId !== contract.modelId || model.canonicalSlug !== contract.canonicalSlug || request.audioPolicy !== 'USE_RECORDING' || !request.hasImageReferences || request.imageReferenceCount !== 1 || !request.hasAudioReference || request.hasVideoReference || request.requiresFirstFrame || request.requiresLastFrame || request.requiresAudio || request.requiresMask || request.previousJobId || request.upscaleFactor !== undefined || request.creativity !== undefined) return undefined;
    if (!source || !source.assetId || !source.storageId || !normalizeSha256(source.checksum) || !Number.isSafeInteger(source.byteSize) || source.byteSize <= 0 || source.byteSize > contract.maxSourceBytes || !Number.isFinite(source.durationSeconds) || source.durationSeconds <= 0 || source.durationSeconds > contract.maxSourceSeconds || source.hasVideo !== false || !Number.isInteger(source.sampleRate) || source.sampleRate <= 0 || !Number.isInteger(source.channels) || source.channels <= 0 || !(contract.audioCodecs as readonly string[]).includes(source.audioCodec)) return undefined;
    if (source.durationMeasurement !== 'DECODED_PCM_SAMPLES_V1' || !(source.audioFormat === 'wav' && source.audioCodec.startsWith('pcm_') || source.audioFormat === 'mp3' && source.audioCodec === 'mp3')) return undefined;
    if (source.durationSeconds > contract.applicationMaxSourceSeconds) return undefined;
    if (!portrait || !portrait.assetId || !portrait.storageId || !normalizeSha256(portrait.checksum) || !Number.isSafeInteger(portrait.byteSize) || portrait.byteSize <= 0 || portrait.byteSize > contract.maxPortraitBytes || !Number.isInteger(portrait.width) || portrait.width <= 0 || portrait.width >= contract.maxPortraitDimension || !Number.isInteger(portrait.height) || portrait.height <= 0 || portrait.height >= contract.maxPortraitDimension || !(portrait.mimeType === 'image/png' && portrait.imageCodec === 'png' || portrait.mimeType === 'image/jpeg' && portrait.imageCodec === 'mjpeg')) return undefined;
    if (Object.keys(model.pricingSkus || {}).length !== 1 || model.pricingSkus?.[contract.sku] !== contract.rateUsdPerSecond || model.supportedDurations.length || JSON.stringify([...model.supportedResolutions].sort()) !== JSON.stringify(['1080p','720p']) || JSON.stringify([...model.supportedAspectRatios].sort()) !== JSON.stringify(['16:9','1:1','9:16'].sort()) || JSON.stringify([...model.supportedParameters].sort()) !== JSON.stringify([...contract.passthrough].sort())) return undefined;
    // Playback keeps the exact decoded duration. A separate one-sample upper
    // bound accounts for16kHz resampling quantization before whole-second ceil.
    const billableDurationSeconds = Math.ceil(source.durationSeconds + 1 / 16000);
    return { version: contract.version, canonicalSlug: contract.canonicalSlug, catalogFingerprint: videoCatalogFingerprint(model), endpointFingerprint: avatarEndpointFingerprint(), source, portrait, billableDurationSeconds, sku: contract.sku, rateUsdPerSecond: contract.rateUsdPerSecond, costUsd: Math.ceil(billableDurationSeconds * contract.rateUsdPerSecond * 1e6) / 1e6 };
}
/** Provider mode limits narrow a generic model catalog only for that operation.
 * OpenRouter advertises FLUX3's aggregate5..20s; native v2v is5..15s. */
export const REVIEWED_VIDEO_OPERATION_DURATION_BOUNDS = [{
    provider: 'openrouter', modelId: 'black-forest-labs/flux-3-video', operation: 'EXTEND',
    minimumSeconds: 5, maximumSeconds: 15,
    evidence: ['https://api.bfl.ai/openapi.json#/components/schemas/Flux3VideoV2VInputs', 'https://docs.bfl.ai/flux_3/flux3_overview#specifications'],
}] as const;
export function videoOperationDurationBounds(provider: string, modelId: string, operation: VideoOperation | VideoTask) {
    return REVIEWED_VIDEO_OPERATION_DURATION_BOUNDS.find(bound => bound.provider === provider && bound.modelId === modelId && bound.operation === operation);
}
/** Reusable by routing and any catalog-backed authoring controls. Preserve the
 * catalog's order and every unrelated model/operation's advertised durations. */
export function supportedVideoOperationDurations(model: Pick<VideoModelCapabilities, 'provider' | 'modelId' | 'supportedDurations'>, operation: VideoOperation | VideoTask): number[] {
    const bound = videoOperationDurationBounds(model.provider, model.modelId, operation);
    return model.supportedDurations.filter(duration => !bound || Number.isInteger(duration) && duration >= bound.minimumSeconds && duration <= bound.maximumSeconds);
}
export const CONTINUATION_BILLING_VERSION = 'OPENROUTER_CONTINUATION_OUTPUT_SECOND_V1' as const;
export interface ContinuationQuoteCertificate {
    version: typeof CONTINUATION_BILLING_VERSION; sourceProviderJobId: string; sourceModelId: string;
    catalogFingerprint: string; sku: string; rateUsdPerSecond: number; billableDurationSeconds: number; costUsd: number;
}
export function quoteVideoContinuation(model: VideoModelCapabilities, request: VideoRoutingRequest): ContinuationQuoteCertificate | undefined {
    if ((request.operation || request.task) !== 'EXTEND' || !request.previousJobId || !/^gen-vid-\d+-[0-9A-Za-z]{20}$/.test(request.previousJobId) || request.previousModelId !== model.modelId || !Number.isInteger(request.durationSeconds) || request.durationSeconds <= 0 || request.hasImageReferences || request.hasVideoReference || request.hasAudioReference || request.requiresFirstFrame || request.requiresLastFrame) return undefined;
    if (videoOperationDurationBounds(model.provider, model.modelId, 'EXTEND') && !supportedVideoOperationDurations(model, 'EXTEND').includes(request.durationSeconds)) return undefined;
    const entries = Object.entries(model.pricingSkus || {});
    if (!entries.length || entries.some(([sku, price]) => !/^cents_per_second_(?:output|video_continuation)(?:_(?:720p|1080p|2k|4k))?$/i.test(sku) || !Number.isFinite(price) || price < 0)) return undefined;
    const resolution = request.resolution?.toLowerCase();
    const rates = entries.filter(([sku]) => resolution ? sku.toLowerCase() === `cents_per_second_video_continuation_${resolution}` : /^cents_per_second_video_continuation(?:_(?:720p|1080p|2k|4k))?$/i.test(sku));
    if (!rates.length || rates.some(([, price]) => price <= 0)) return undefined;
    const [sku, cents] = [...rates].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
    return { version: CONTINUATION_BILLING_VERSION, sourceProviderJobId: request.previousJobId, sourceModelId: request.previousModelId, catalogFingerprint: videoCatalogFingerprint(model), sku, rateUsdPerSecond: cents / 100, billableDurationSeconds: request.durationSeconds, costUsd: Math.ceil(cents * request.durationSeconds / 100 * 1_000_000) / 1_000_000 };
}
export interface VideoEditSourceCertificate extends UpscaleSourceCertificate { hasAudio: boolean }
export interface VideoEditQuoteCertificate {
    version: typeof VIDEO_EDIT_BILLING_VERSION;
    catalogFingerprint: string;
    source: VideoEditSourceCertificate;
    billableDurationSeconds: number;
    sku: 'cents_per_second_output';
    rateUsdPerSecond: number;
    costUsd: number;
}
export function isSourceVideoEdit(operation: unknown): boolean { return ['EDIT', 'APPEARANCE_EDIT', 'OBJECT_REPLACE'].includes(String(operation)); }
export function validVideoEditSource(source: VideoEditSourceCertificate | undefined): source is VideoEditSourceCertificate {
    return Boolean(source && source.assetId && source.storageId && source.checksum && Number.isSafeInteger(source.byteSize) && source.byteSize > 0 && source.byteSize <= 50 * 1024 * 1024 && Number.isInteger(source.width) && source.width > 0 && Number.isInteger(source.height) && source.height > 0 && Number.isFinite(source.durationSeconds) && source.durationSeconds > 0 && source.durationSeconds <= 15 && typeof source.hasAudio === 'boolean');
}
/** OpenRouter's FLUX Edit contract preserves full source duration, framing and
 * audio. The documented 15s/50MiB bounds and output-second SKU are separate
 * from the null generation-duration/resolution lists in its live catalog. */
export function quoteVideoEdit(model: VideoModelCapabilities, request: VideoRoutingRequest): VideoEditQuoteCertificate | undefined {
    if (model.modelId !== 'black-forest-labs/flux-video-edit' || !isSourceVideoEdit(request.operation || request.task) || !validVideoEditSource(request.editSource) || request.audioPolicy !== 'KEEP_SOURCE' || !request.hasVideoReference || request.hasImageReferences || request.hasAudioReference || request.requiresFirstFrame || request.requiresLastFrame || request.requiresAudio || request.resolution || request.requiresMask || request.previousJobId || request.upscaleFactor !== undefined || request.creativity !== undefined) return undefined;
    const entries = Object.entries(model.pricingSkus || {});
    if (entries.length !== 1 || entries[0][0] !== 'cents_per_second_output' || !Number.isFinite(entries[0][1]) || entries[0][1] <= 0) return undefined;
    const billableDurationSeconds = Math.ceil(request.editSource.durationSeconds);
    const rateUsdPerSecond = entries[0][1] / 100;
    return { version: VIDEO_EDIT_BILLING_VERSION, catalogFingerprint: videoCatalogFingerprint(model), source: { ...request.editSource }, billableDurationSeconds, sku: 'cents_per_second_output', rateUsdPerSecond, costUsd: Math.ceil(billableDurationSeconds * rateUsdPerSecond * 1_000_000) / 1_000_000 };
}

export function validUpscaleSource(source: UpscaleSourceCertificate | undefined): source is UpscaleSourceCertificate {
    return Boolean(source && typeof source.assetId === 'string' && source.assetId && typeof source.storageId === 'string' && source.storageId && typeof source.checksum === 'string' && source.checksum && Number.isSafeInteger(source.byteSize) && source.byteSize > 0 && source.byteSize <= 50_000_000 && Number.isInteger(source.width) && Number.isInteger(source.height) && source.width > 0 && source.height > 0 && Math.max(source.width, source.height) <= 2560 && Math.min(source.width, source.height) <= 1440 && source.width * source.height <= 2560 * 1440 && Number.isFinite(source.durationSeconds) && source.durationSeconds > 0 && source.durationSeconds <= 20);
}

export const VIDEO_CATALOG_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function videoCatalogFingerprint(model: { provider: string; modelId: string; canonicalSlug?: string; supportedDurations: number[]; supportedResolutions: string[]; supportedAspectRatios: string[]; supportedSizes?: string[]; supportedParameters: string[]; upscaleFactor?: { min: number; max: number }; creativityLevels?: number[]; pricingSkus?: Record<string, number> }) {
    const controls = [model.provider, model.modelId, [...model.supportedDurations].sort((a, b) => a - b), [...model.supportedResolutions].sort(), [...model.supportedAspectRatios].sort(), [...(model.supportedSizes || [])].sort(), [...model.supportedParameters].sort()];
    // These BFL source/continuation contracts depend on the upstream version as
    // well as controls/prices. Preserve unrelated models' historical fingerprints.
    const versionedControls = ['black-forest-labs/flux-3-video', 'black-forest-labs/flux-video-edit', 'black-forest-labs/flux-video-upscale'].includes(model.modelId) ? [...controls, model.canonicalSlug ?? null] : controls;
    if (model.modelId === REVIEWED_OPERATION_CONTRACTS.suppliedAudioAvatar.modelId) return JSON.stringify([...controls, model.canonicalSlug ?? null, Object.entries(model.pricingSkus || {}).sort(([a],[b])=>a.localeCompare(b)), REVIEWED_OPERATION_CONTRACTS.suppliedAudioAvatar.version]);
    if (model.modelId === 'black-forest-labs/flux-video-edit') return JSON.stringify([...versionedControls, Object.entries(model.pricingSkus || {}).sort(([a], [b]) => a.localeCompare(b)), VIDEO_EDIT_BILLING_VERSION]);
    if (model.modelId === 'black-forest-labs/flux-3-video' || Object.keys(model.pricingSkus || {}).some(sku => sku.includes('video_continuation'))) return JSON.stringify([...versionedControls, Object.entries(model.pricingSkus || {}).sort(([a], [b]) => a.localeCompare(b)), CONTINUATION_BILLING_VERSION]);
    return JSON.stringify(model.upscaleFactor || model.creativityLevels ? [...versionedControls, model.upscaleFactor ? [model.upscaleFactor.min, model.upscaleFactor.max] : null, [...(model.creativityLevels || [])].sort(), Object.entries(model.pricingSkus || {}).sort(([a], [b]) => a.localeCompare(b)), UPSCALE_BILLING_VERSION] : versionedControls);
}

/** Compare the live quote with the reviewed row without invalidating older
 * persisted review fingerprints or operation certificates. */
export function videoCatalogQuoteFingerprint(model: Parameters<typeof videoCatalogFingerprint>[0]): string {
    return JSON.stringify([
        videoCatalogFingerprint(model), model.canonicalSlug ?? null,
        Object.entries(model.pricingSkus ?? {}).sort(([left], [right]) => left.localeCompare(right)),
    ]);
}

export function quoteVideoUpscale(model: VideoModelCapabilities, request: VideoRoutingRequest): UpscaleQuoteCertificate | undefined {
    if ((request.operation || request.task) !== 'UPSCALE' || model.provider !== 'openrouter' || model.modelId !== 'black-forest-labs/flux-video-upscale' || !validUpscaleSource(request.upscaleSource)) return undefined;
    if (model.upscaleFactor?.min !== 1.5 || model.upscaleFactor.max !== 3 || !Array.isArray(model.creativityLevels) || model.creativityLevels.length !== 2 || !model.creativityLevels.includes(0) || !model.creativityLevels.includes(1)) return undefined;
    const factor = request.upscaleFactor;
    const creativity = request.creativity;
    if (!Number.isFinite(factor) || factor! < model.upscaleFactor.min || factor! > model.upscaleFactor.max || (creativity !== 0 && creativity !== 1)) return undefined;
    const expectedSkus = ['cents_per_megapixel_second_precise', 'cents_per_megapixel_second_creative'];
    const prices = model.pricingSkus || {};
    if (Object.keys(prices).length !== expectedSkus.length || expectedSkus.some(sku => !Number.isFinite(prices[sku]) || prices[sku] <= 0) || Object.keys(prices).some(sku => !expectedSkus.includes(sku))) return undefined;
    const sku = expectedSkus[creativity];
    const rateUsdPerMegapixelSecond = prices[sku] / 100;
    // The source, not the shot's requested trim, determines billed duration.
    // No output alignment rule is documented. Use the hard 13.75MP output cap
    // rather than assuming width*factor is an exact billed pixel count.
    const billableDurationSeconds = Math.ceil(request.upscaleSource.durationSeconds);
    const costUsd = Math.ceil(UPSCALE_MAX_OUTPUT_PIXELS / 1_000_000 * billableDurationSeconds * rateUsdPerMegapixelSecond * 1_000_000) / 1_000_000;
    if (!Number.isFinite(costUsd) || costUsd <= 0) return undefined;
    return { version: UPSCALE_BILLING_VERSION, catalogFingerprint: videoCatalogFingerprint(model), source: { ...request.upscaleSource }, factor: factor!, creativity, maximumOutputPixels: UPSCALE_MAX_OUTPUT_PIXELS, billableDurationSeconds, sku, rateUsdPerMegapixelSecond, costUsd };
}

export function videoModelSupportsRequest(model: VideoModelCapabilities, request: VideoRoutingRequest): boolean {
    if (!model.available) return false;
    const operation = request.operation || request.task;
    const sourceEdit = isSourceVideoEdit(operation) && model.modelId === 'black-forest-labs/flux-video-edit';
    // Manual capability flags cannot certify an undocumented motion-transfer
    // contract or a supplied-audio output-duration billing bound.
    if (operation === 'PERFORMANCE_TRANSFER' || operation === 'LIP_SYNC' && (!model.supportsLipSync || !quoteSuppliedAudioAvatar(model, request)) || isSourceVideoEdit(operation) && !sourceEdit) return false;
    if (!Number.isFinite(request.durationSeconds) || (operation === 'LIP_SYNC' || operation === 'UPSCALE' || sourceEdit ? request.durationSeconds <= 0 : request.durationSeconds < 1)) return false;
    if (request.maximumCostUsd !== undefined && (!Number.isFinite(request.maximumCostUsd) || request.maximumCostUsd < 0)) return false;
    if (!(VIDEO_OPERATIONS as readonly string[]).includes(operation)) return false;
    // The portable API has no mask contract. Never silently drop a requested mask.
    if (request.requiresMask) return false;
    if (operation !== 'GENERATE' && operation !== 'FRAME_TO_VIDEO' && !model.reviewedOperations?.includes(operation)) return false;
    if (operation === 'GENERATE' && !model.supportsTextToVideo) return false;
    if (operation === 'FRAME_TO_VIDEO' && !model.supportsFirstFrame) return false;
    if (['EDIT', 'APPEARANCE_EDIT', 'OBJECT_REPLACE'].includes(operation) && (!model.supportsVideoEdit || !request.hasVideoReference)) return false;
    if (operation === 'EXTEND' && (!model.supportsVideoExtension || !request.previousJobId || request.previousModelId !== model.modelId)) return false;
    if (operation === 'UPSCALE' && (!model.supportsUpscale || !request.hasVideoReference || !quoteVideoUpscale(model, request))) return false;
    if (request.hasAudioReference && !model.supportsAudioReferences) return false;
    if (request.requiresSourceAudioPreservation && !model.supportsSourceAudioPreservation) return false;
    // Several endpoints give frame_images precedence and ignore all references.
    if ((request.requiresFirstFrame || request.requiresLastFrame) && (request.hasImageReferences || request.hasVideoReference || request.hasAudioReference) && (!model.supportsCombinedFrameReferences || !getReviewedVideoReferenceContract(model.modelId,model.canonicalSlug)?.combinedFrameReferences)) return false;
    if (request.hasImageReferences && !model.supportsImageReferences) return false;
    if ((request.hasImageReferences || request.hasAudioReference) && operation !== 'LIP_SYNC') {
        const contract = getReviewedVideoReferenceContract(model.modelId, model.canonicalSlug);
        if (!contract || contract.referenceDurations && !contract.referenceDurations.includes(request.durationSeconds)) return false;
        if (request.hasImageReferences && (contract.imageMode !== 'SUBJECT_GUIDANCE' || !Number.isSafeInteger(request.imageReferenceCount ?? 1) || (request.imageReferenceCount ?? 1) < 1 || (request.imageReferenceCount ?? 1) > contract.maxImageReferences)) return false;
        if (request.hasAudioReference && !contract.supportsAudioReferences) return false;
    }
    if (request.hasVideoReference && !model.supportsVideoReferences) return false;
    if (request.requiresFirstFrame && !model.supportsFirstFrame) return false;
    if (request.requiresLastFrame && !model.supportsLastFrame) return false;
    if (request.requiresAudio && !model.supportsAudio) return false;
    if (operation === 'UPSCALE') {
        // This operation inherits duration/framing from its single certified
        // source. Null generation catalog lists are not unsupported controls.
        if (request.resolution || request.requiresFirstFrame || request.requiresLastFrame || request.hasImageReferences || request.hasAudioReference || request.requiresAudio) return false;
    } else if (operation === 'LIP_SYNC') {
        if (request.resolution && !model.supportedResolutions.includes(request.resolution) || !model.supportedAspectRatios.includes(request.aspectRatio)) return false;
    } else if (sourceEdit) {
        if (!quoteVideoEdit(model, request)) return false;
    } else {
        if (!supportedVideoOperationDurations(model, operation).includes(request.durationSeconds)) return false;
        if (request.resolution && !model.supportedResolutions.includes(request.resolution)) return false;
        if (!model.supportedAspectRatios.includes(request.aspectRatio)) return false;
        const durationGrid=getReviewedVideoOutputGrid(model.modelId,model.canonicalSlug)?.durationsByResolution;
        if(durationGrid){const resolution=request.resolution??defaultResolution(model,request.aspectRatio);if(!resolution||!durationGrid[resolution]?.includes(request.durationSeconds))return false;}
    }
    const estimatedCostUsd = estimateVideoCost(model, request);
    if (estimatedCostUsd === undefined) return false;
    if (request.maximumCostUsd !== undefined && estimatedCostUsd > request.maximumCostUsd) return false;
    return true;
}

/** Use a reviewed published grid, or an unambiguous exact nominal short edge.
 * Never choose a neighboring HEIGHT, or assume array order proves a label. */
export function resolveVideoOutputSize(model: Pick<VideoModelCapabilities, 'modelId' | 'canonicalSlug' | 'supportedSizes' | 'supportedResolutions' | 'supportedAspectRatios'>, aspectRatio: string, resolution?: string) {
    if (!model.supportedAspectRatios.includes(aspectRatio)) return undefined;
    const ratio = aspectRatio.split(':').map(Number);
    if (ratio.length !== 2 || ratio.some(value => !Number.isFinite(value) || value <= 0)) return undefined;
    const labels = model.supportedResolutions.map(label => {
        const match = /^(\d+)(p|k)$/i.exec(label);
        return match ? { label, rank: Number(match[1]) * (match[2].toLowerCase() === 'k' ? 1000 : 1) } : null;
    });
    if (!labels.length || labels.some(label => !label) || new Set(labels.map(label => label!.rank)).size !== labels.length) return undefined;
    const ordered = labels.filter((label): label is {label: string; rank: number} => label !== null).sort((a,b) => a.rank-b.rank);
    const selected = resolution === undefined ? ordered[0] : ordered.find(item => item.label.toLowerCase() === resolution.toLowerCase());
    if (!selected) return undefined;
    const reviewed = getReviewedVideoOutputGrid(model.modelId, model.canonicalSlug);
    if (reviewed) {
        const label=reviewed.sizes[selected.label]?.[reviewed.aspectRatios.indexOf(aspectRatio)];
        if (!label || !model.supportedSizes?.includes(label)) return undefined;
        const [width,height]=label.split('x').map(Number);
        return {width,height,resolution:selected.label};
    }
    const sizes = [...new Set(model.supportedSizes ?? [])].map(label => {
        const match = /^(\d+)x(\d+)$/i.exec(label);
        return match && Number(match[1]) > 0 && Number(match[2]) > 0 ? {width:Number(match[1]),height:Number(match[2])} : null;
    }).filter((size): size is {width:number;height:number} => size !== null)
        .filter(size => Math.abs(size.width / size.height - ratio[0] / ratio[1]) < .02)
        .sort((a,b) => a.width*a.height-b.width*b.height);
    const exact = sizes.filter(size => /^\d+p$/i.test(selected.label) && Math.min(size.width,size.height) === selected.rank);
    if (exact.length !== 1) return undefined;
    return {...exact[0],resolution:selected.label};
}

export function estimateVideoCost(model: VideoModelCapabilities, request: VideoRoutingRequest): number | undefined {
    if ((request.operation || request.task) === 'LIP_SYNC') return quoteSuppliedAudioAvatar(model, request)?.costUsd;
    if ((request.operation || request.task) === 'UPSCALE') return quoteVideoUpscale(model, request)?.costUsd;
    if (model.modelId === 'black-forest-labs/flux-video-edit') return quoteVideoEdit(model, request)?.costUsd;
    if ((request.operation || request.task) === 'EXTEND') {
        return quoteVideoContinuation(model, request)?.costUsd;
    }
    // Reference video can bill full input plus output duration and a separate
    // minimum-token floor. Only the measured source contracts above bound it;
    // a catalog video-input SKU or an output-only estimate is insufficient.
    if (request.hasVideoReference) return undefined;
    if (!model.supportedAspectRatios.includes(request.aspectRatio) || request.resolution && !model.supportedResolutions.some(resolution => resolution.toLowerCase() === request.resolution!.toLowerCase())) return undefined;
    const durationGrid=getReviewedVideoOutputGrid(model.modelId,model.canonicalSlug)?.durationsByResolution;
    if(durationGrid){const resolution=request.resolution??defaultResolution(model,request.aspectRatio);if(!resolution||!durationGrid[resolution]?.includes(request.durationSeconds))return undefined;}
    if (model.supportedSizes?.length && !resolveVideoOutputSize(model, request.aspectRatio, request.resolution)) return undefined;
    const skus = Object.entries(model.pricingSkus || {}).filter(([, value]) => Number.isFinite(value) && value >= 0);
    const resolution = request.resolution?.toLowerCase();
    const taskPrefix = request.task === 'FRAME_TO_VIDEO' ? 'image_to_video_' : request.task === 'GENERATE' ? 'text_to_video_' : '';
    const audioMarker = request.requiresAudio ? 'with_audio' : 'without_audio';
    const find = (keys: string[]) => {
        for (const key of keys) {
            const match = skus.find(([sku]) => sku.toLowerCase() === key.toLowerCase());
            if (match) return { key: match[0], value: match[1] };
        }
        return undefined;
    };

    // OpenRouter's live video catalog has several valid SKU conventions. Prefer
    // the task, audio, and resolution-specific rate, then use the documented
    // generic per-second rate when the catalog only exposes one.
    const rate = find([
        ...(resolution ? [
            `${taskPrefix}duration_seconds_${resolution}`,
            `duration_seconds_${audioMarker}_${resolution}`,
            `duration_seconds_${resolution}_${audioMarker}`,
            `duration_seconds_${resolution}`,
            `per-video-second-${resolution}`,
            `cents_per_video_output_second_${resolution}`,
            `cents_per_second_output_${resolution}`,
        ] : []),
        ...(request.requiresAudio ? [`${taskPrefix}duration_seconds_with_audio`, 'duration_seconds_with_audio'] : []),
        ...(request.requiresAudio ? [] : [`${taskPrefix}duration_seconds_without_audio`, 'duration_seconds_without_audio']),
        `${taskPrefix}duration_seconds`,
        'duration_seconds',
        ...(resolution ? [`per-video-second-${resolution}`] : []),
        'per-video-second',
        ...(resolution ? [`cents_per_video_output_second_${resolution}`, `cents_per_second_output_${resolution}`] : []),
        'cents_per_video_output_second',
        'cents_per_second_output',
    ]);

    let videoCost: number | undefined;
    if (rate) {
        const centsSku = rate.key.toLowerCase().startsWith('cents_');
        videoCost = rate.value * request.durationSeconds / (centsSku ? 100 : 1);
    } else {
        // Token-priced models publish output sizes; OpenRouter documents video
        // tokens as (width × height × seconds × 24 fps) / 1024.
        const tokenPrice = find(request.requiresAudio
            ? ['video_tokens', 'video_tokens_with_audio', 'per-video-token']
            : ['video_tokens_without_audio', 'video_tokens', 'per-video-token']);
        if (tokenPrice && model.supportedSizes?.length) {
            const selectedSize = resolveVideoOutputSize(model, request.aspectRatio, request.resolution);
            if (!selectedSize) return undefined;
            const videoTokens = (selectedSize.width * selectedSize.height * request.durationSeconds * 24) / 1024;
            videoCost = tokenPrice.value * videoTokens;
        } else {
            videoCost = model.estimatedCostPerSecond === undefined ? undefined : model.estimatedCostPerSecond * request.durationSeconds;
        }
    }
    if (videoCost === undefined) return undefined;

    const referenceCount = Math.max(0, Math.floor(request.imageReferenceCount ?? (request.hasImageReferences ? 1 : 0)));
    const imageKeys = ['cents_per_image_input', 'reference_images', 'image_input'];
    // Unknown reference-input units cannot be bounded from an output-only
    // duration. Audio duration/token billing needs a separate measured route.
    if (referenceCount && skus.some(([key, value]) => value > 0 && /image/i.test(key) && !imageKeys.includes(key.toLowerCase()) && !/^image_to_video_duration_seconds(?:_(?:\d+p|\d+k|with_audio|without_audio))?$/i.test(key))) return undefined;
    const knownOutputAudioUnit=/^(?:video_tokens_(?:with|without)_audio|(?:(?:text|image)_to_video_)?duration_seconds_(?:(?:with|without)_audio(?:_(?:\d+p|\d+k))?|(?:\d+p|\d+k)_(?:with|without)_audio))$/i;
    if ((request.hasAudioReference || request.requiresAudio) && skus.some(([key,value]) => value > 0 && /audio/i.test(key) && !knownOutputAudioUnit.test(key))) return undefined;
    const imageRates = skus.filter(([key]) => imageKeys.includes(key.toLowerCase())).map(([key,value]) => value/(key.toLowerCase().startsWith('cents_')?100:1));
    if (referenceCount && imageRates.length) videoCost += imageRates.reduce((sum,rate)=>sum+rate,0) * referenceCount;
    return videoCost;
}

function defaultResolution(model: VideoModelCapabilities, aspectRatio: string): string | undefined {
    if (model.supportedSizes?.length) return resolveVideoOutputSize(model, aspectRatio)?.resolution;
    const requestedRatio = aspectRatio.split(':').map(Number);
    if (requestedRatio.length !== 2 || requestedRatio.some((value) => !Number.isFinite(value) || value <= 0)) return undefined;
    const sizes = (model.supportedSizes || []).map((label) => {
        const match = /^(\d+)x(\d+)$/i.exec(label);
        return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
    }).filter((size): size is { width: number; height: number } => size !== null)
        .filter((size) => Math.abs(size.width / size.height - requestedRatio[0] / requestedRatio[1]) < 0.02);
    const listed = model.supportedResolutions.map((resolution) => ({ resolution, height: Number.parseInt(resolution, 10) }))
        .filter((item) => Number.isFinite(item.height) && item.height > 0);
    if (!listed.length) return undefined;
    const minimumHeight = sizes.length ? Math.min(...sizes.map((size) => size.height)) : undefined;
    const compatible = minimumHeight === undefined ? listed : listed.filter((item) => item.height <= minimumHeight);
    return [...(compatible.length ? compatible : listed)].sort((a, b) => a.height - b.height)[0]?.resolution;
}

export function selectVideoRoute(
    request: VideoRoutingRequest,
    models: readonly VideoModelCapabilities[],
    policy?: VideoRoutePolicy,
): VideoRouteSelection {
    const path = policy?.path || defaultVideoProductionPath(request.videoType);
    if (path === 'MOTION_GRAPHICS') {
        return { provider: 'internal', modelId: 'renderer/motion-graphics', path, routeReason: 'This style is built from deterministic motion-graphics templates.' };
    }

    const preferred = policy?.preferredModelIds || [];
    const maximumCostUsd = policy?.maxCostUsd === undefined ? request.maximumCostUsd
        : request.maximumCostUsd === undefined ? policy.maxCostUsd : Math.min(policy.maxCostUsd, request.maximumCostUsd);
    const checkedRequest = { ...request, maximumCostUsd };
    if (request.qualityTier === 'PREMIUM' && preferred.length === 0) throw new Error('An administrator must set a preferred premium model before premium video generation is available.');
    if (request.qualityTier === 'PREMIUM' && maximumCostUsd === undefined) throw new Error('An administrator must set a premium spending cap before premium video generation is available.');
    const requests = models.map((model) => ({
        model,
        request: { ...checkedRequest, resolution: checkedRequest.operation === 'UPSCALE' || model.modelId === 'black-forest-labs/flux-video-edit' ? checkedRequest.resolution : checkedRequest.resolution || defaultResolution(model, checkedRequest.aspectRatio) },
    }));
    const capable = requests.filter(({ model, request: candidate }) => videoModelSupportsRequest(model, { ...candidate, maximumCostUsd: undefined }));
    const eligible = requests.filter(({ model, request: candidate }) => videoModelSupportsRequest(model, candidate));
    if (!eligible.length && capable.length && maximumCostUsd !== undefined) throw new Error('No compatible video model fits within the configured spending cap.');
    if (!eligible.length) throw new Error('No available video model supports all requested video controls and limits.');

    if (request.qualityTier === 'PREMIUM' && !eligible.some(({ model }) => preferred.includes(model.modelId))) {
        throw new Error('No administrator-approved premium model supports all requested controls within the configured spending cap.');
    }

    const ordered = [...eligible].sort((left, right) => {
        const leftIndex = preferred.indexOf(left.model.modelId);
        const rightIndex = preferred.indexOf(right.model.modelId);
        if (request.qualityTier !== 'ECONOMY' && (leftIndex !== -1 || rightIndex !== -1)) return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
        return (estimateVideoCost(left.model, left.request) ?? Infinity) - (estimateVideoCost(right.model, right.request) ?? Infinity);
    });
    const { model: selected, request: selectedRequest } = ordered[0];
    const preference = preferred.includes(selected.modelId) ? 'administrator preference' : request.qualityTier === 'PREMIUM' ? 'highest quality tier among eligible models' : 'lowest-cost eligible model';
    return {
        provider: selected.provider,
        modelId: selected.modelId,
        path,
        routeReason: `Selected by ${preference}; required controls are supported.`,
        estimatedCostUsd: estimateVideoCost(selected, selectedRequest),
        resolution: selectedRequest.resolution,
        policyVersion: policy?.updatedAt,
        ...(selectedRequest.hasImageReferences || selectedRequest.hasAudioReference ? {referenceContract:getReviewedVideoReferenceContract(selected.modelId,selected.canonicalSlug)} : {}),
        ...(selectedRequest.operation === 'UPSCALE' ? { upscaleQuote: quoteVideoUpscale(selected, selectedRequest) } : {}),
        ...(selected.modelId === 'black-forest-labs/flux-video-edit' ? { editQuote: quoteVideoEdit(selected, selectedRequest) } : {}),
        ...((selectedRequest.operation || selectedRequest.task) === 'EXTEND' ? { continuationQuote: quoteVideoContinuation(selected, selectedRequest) } : {}),
        ...((selectedRequest.operation || selectedRequest.task) === 'LIP_SYNC' ? { lipSyncQuote: quoteSuppliedAudioAvatar(selected, selectedRequest) } : {}),
    };
}
