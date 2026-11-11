/**
 * The only place where OpenRouter model identifiers are configured.
 *
 * Callers select a capability. They never need to know which provider model
 * currently fulfils it. Deployments can pin a model with the environment
 * variables below without changing application code.
 */

import type { AIProvider, CapabilityId } from './types';

export type AICapability =
    | 'AI_BRAIN'
    | 'IMAGE_ENGINE'
    | 'VIDEO_ENGINE'
    | 'VALIDATOR_ENGINE'
    | 'STRUCTURED_PLANNING'
    | 'VALIDATION';

/** Product-facing capability names. Provider and model IDs stay hidden. */
export type LogicalCapabilityId =
    | 'planner'
    | 'writer'
    | 'director'
    | 'orchestrator'
    | 'validator'
    | 'vision_qc'
    | 'video_preview'
    | 'video_final'
    | 'tts'
    | 'stt'
    | 'image'
    | 'music'
    | 'sfx';

export type ExecutionProfile =
    | 'FAST_SOCIAL'
    | 'COMMERCIAL'
    | 'CINEMATIC'
    | 'PREMIUM';

export interface AIModelConfig {
    id: string;
    provider: AIProvider;
    capability: CapabilityId;
    contextWindow: number;
    description: string;
    costTier: 'low' | 'standard' | 'premium';
    inputModalities: readonly string[];
    outputModalities: readonly string[];
    maxTokens?: number;
    /** Models to try after this configured model on a transient failure. */
    fallbackIds?: readonly string[];
    /** Media capabilities may choose a verified catalog model for this entry. */
    selectFromCatalog?: boolean;
}

/** Endpoint semantics reviewed against primary documentation, independently
 * of a catalog saying only that a model accepts images. Admin preferences
 * cannot turn an initial-frame input into subject/identity conditioning. */
export interface VideoReferenceContract {
    version: 'VIDEO_REFERENCE_SEMANTICS_V1';
    modelId: string;
    canonicalSlug: string;
    imageMode: 'SUBJECT_GUIDANCE' | 'FRAME_ONLY';
    maxImageReferences: number;
    referenceDurations?: readonly number[];
    supportsAudioReferences: boolean;
    combinedFrameReferences: boolean;
    documentationUrl: string;
    reviewedOn: string;
}
const VIDEO_REFERENCE_CONTRACTS: readonly VideoReferenceContract[] = [
    { version: 'VIDEO_REFERENCE_SEMANTICS_V1', modelId: 'bytedance/seedance-2.5', canonicalSlug: 'bytedance/seedance-2.5-20260807', imageMode: 'SUBJECT_GUIDANCE', maxImageReferences: 30, supportsAudioReferences: true, combinedFrameReferences: false, documentationUrl: 'https://openrouter.ai/blog/insights/seedance-2-5-review/', reviewedOn: '2026-11-05' },
    { version: 'VIDEO_REFERENCE_SEMANTICS_V1', modelId: 'google/veo-3.1', canonicalSlug: 'google/veo-3.1-20260320', imageMode: 'SUBJECT_GUIDANCE', maxImageReferences: 3, referenceDurations: [8], supportsAudioReferences: false, combinedFrameReferences: false, documentationUrl: 'https://ai.google.dev/gemini-api/docs/veo', reviewedOn: '2026-11-05' },
    { version: 'VIDEO_REFERENCE_SEMANTICS_V1', modelId: 'google/veo-3.1-fast', canonicalSlug: 'google/veo-3.1-fast-20260320', imageMode: 'SUBJECT_GUIDANCE', maxImageReferences: 3, referenceDurations: [8], supportsAudioReferences: false, combinedFrameReferences: false, documentationUrl: 'https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/generate-videos-from-references', reviewedOn: '2026-11-11' },
    { version: 'VIDEO_REFERENCE_SEMANTICS_V1', modelId: 'google/veo-3.1-lite', canonicalSlug: 'google/veo-3.1-lite-20260331', imageMode: 'FRAME_ONLY', maxImageReferences: 0, supportsAudioReferences: false, combinedFrameReferences: false, documentationUrl: 'https://ai.google.dev/gemini-api/docs/veo', reviewedOn: '2026-11-05' },
];
export function getReviewedVideoReferenceContract(modelId: string, canonicalSlug?: string): VideoReferenceContract | undefined {
    return VIDEO_REFERENCE_CONTRACTS.find(contract => contract.modelId === modelId && contract.canonicalSlug === canonicalSlug);
}

/** Exact published resolution groups. These are not inferred by nearest size:
 * e.g. Seedance's nominal720p square is960x960, not720x720. */
const VIDEO_OUTPUT_GRIDS: Readonly<Record<string, {canonicalSlug: string; aspectRatios: readonly string[]; sizes: Readonly<Record<string, readonly string[]>>; durationsByResolution?: Readonly<Record<string, readonly number[]>>}>> = {
    'bytedance/seedance-2.5': { canonicalSlug:'bytedance/seedance-2.5-20260807', aspectRatios:['16:9','4:3','1:1','3:4','9:16','21:9'], sizes:{
        '480p':['854x480','752x560','640x640','560x752','480x854','992x432'],
        '720p':['1280x720','1112x834','960x960','834x1112','720x1280','1470x630'],
    } },
    'google/veo-3.1-lite': {canonicalSlug:'google/veo-3.1-lite-20260331',aspectRatios:['16:9','9:16'],durationsByResolution:{'720p':[4,6,8],'1080p':[8]},sizes:{'720p':['1280x720','720x1280'],'1080p':['1920x1080','1080x1920']}},
    'google/veo-3.1': {canonicalSlug:'google/veo-3.1-20260320',aspectRatios:['16:9','9:16'],durationsByResolution:{'720p':[4,6,8],'1080p':[8],'4K':[8]},sizes:{'720p':['1280x720','720x1280'],'1080p':['1920x1080','1080x1920'],'4K':['3840x2160','2160x3840']}},
    // Vertex's exact reference contract includes Fast at720p/1080p. Its4K
    // reference option is explicitly full Veo only; an aggregate catalog list
    // or administrator flag cannot widen that reviewed capability.
    'google/veo-3.1-fast': {canonicalSlug:'google/veo-3.1-fast-20260320',aspectRatios:['16:9','9:16'],durationsByResolution:{'720p':[4,6,8],'1080p':[8]},sizes:{'720p':['1280x720','720x1280'],'1080p':['1920x1080','1080x1920']}},
};
export function getReviewedVideoOutputGrid(modelId: string, canonicalSlug?: string) {
    const grid=VIDEO_OUTPUT_GRIDS[modelId];
    return grid?.canonicalSlug===canonicalSlug ? grid : undefined;
}

// These IDs were the previous deployment defaults. Keep them here so an old
// Vercel/Coolify environment variable cannot silently put production back on
// the retired routing set after this registry is updated.
const RETIRED_MODEL_IDS = new Set([
    'google/gemini-2.5-flash',
    'google/gemini-2.5-flash-lite',
    'openai/gpt-4o-mini',
    'google/veo-3.1-fast',
    'bytedance/seedance-2.0-fast',
]);

function configuredModel(name: string, fallback: string): string {
    const value = process.env[name]?.trim();
    // OpenRouter's auto router cannot guarantee strict structured output and
    // must never be used for a capability that declares a schema.
    return value && !isUnsafeAutoModel(value) && !RETIRED_MODEL_IDS.has(value) ? value : fallback;
}

function configuredFallbacks(name: string, defaults: readonly string[] = []): string[] {
    const configured = (process.env[name] || '')
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value && !isUnsafeAutoModel(value) && !RETIRED_MODEL_IDS.has(value));
    return configured.length ? configured : [...defaults];
}

function isUnsafeAutoModel(value: string): boolean {
    return value === 'auto' || value === 'openrouter/auto' || value === 'openrouter/auto-beta';
}

/**
 * Capability model registry. Keep all model IDs, including fallback IDs,
 * inside this module.
 */
export const MODEL_REGISTRY: Record<CapabilityId, AIModelConfig> = {
    AI_BRAIN: {
        id: configuredModel('OPENROUTER_AI_BRAIN_MODEL', 'openai/gpt-6-astra-pro'),
        provider: 'openrouter',
        capability: 'AI_BRAIN',
        contextWindow: 1050000,
        description: 'General-purpose reasoning, planning and scripting',
        costTier: 'premium', inputModalities: ['text', 'image', 'audio', 'video', 'file'], outputModalities: ['text'],
        fallbackIds: configuredFallbacks('OPENROUTER_AI_BRAIN_FALLBACK_MODELS', ['openai/gpt-6-astra', 'google/gemini-3.8-flash']),
    },
    IMAGE_ENGINE: {
        id: configuredModel('OPENROUTER_IMAGE_MODEL', 'openai/gpt-image-2'),
        provider: 'openrouter',
        capability: 'IMAGE_ENGINE',
        contextWindow: 32000,
        description: 'Image understanding and image-generation routing',
        costTier: 'standard', inputModalities: ['text', 'image'], outputModalities: ['image', 'text'],
        fallbackIds: configuredFallbacks('OPENROUTER_IMAGE_FALLBACK_MODELS', ['google/gemini-3.1-flash-image']),
        selectFromCatalog: false,
    },
    VIDEO_ENGINE: {
        // Seedance 2.5 is the current OpenRouter video catalog's newest
        // general-purpose storytelling model. It supports text/image/video
        // references, first/last-frame control, audio, and 4–30 second clips.
        id: configuredModel('OPENROUTER_VIDEO_MODEL', 'bytedance/seedance-2.5'),
        provider: 'openrouter',
        capability: 'VIDEO_ENGINE',
        contextWindow: 128000,
        description: 'Asynchronous video-generation routing',
        costTier: 'standard', inputModalities: ['text', 'image', 'video'], outputModalities: ['video'],
        fallbackIds: configuredFallbacks('OPENROUTER_VIDEO_FALLBACK_MODELS', ['google/veo-3.1', 'openai/sora-2-pro', 'kwaivgi/kling-v3.0-pro']),
        selectFromCatalog: false,
    },
    VIDEO_PREVIEW: {
        id: configuredModel('OPENROUTER_VIDEO_PREVIEW_MODEL', 'bytedance/seedance-2.0-mini'),
        provider: 'openrouter',
        capability: 'VIDEO_PREVIEW',
        contextWindow: 128000,
        description: 'Fast, low-cost preview video generation',
        costTier: 'standard', inputModalities: ['text', 'image', 'video'], outputModalities: ['video'],
        fallbackIds: configuredFallbacks('OPENROUTER_VIDEO_PREVIEW_FALLBACK_MODELS', ['google/veo-3.1-lite', 'kwaivgi/kling-v3.0-std']),
        selectFromCatalog: false,
    },
    VIDEO_FINAL: {
        id: configuredModel('OPENROUTER_VIDEO_FINAL_MODEL', configuredModel('OPENROUTER_VIDEO_MODEL', 'bytedance/seedance-2.5')),
        provider: 'openrouter',
        capability: 'VIDEO_FINAL',
        contextWindow: 128000,
        description: 'High-quality final video generation',
        costTier: 'premium', inputModalities: ['text', 'image', 'video'], outputModalities: ['video'],
        fallbackIds: configuredFallbacks('OPENROUTER_VIDEO_FINAL_FALLBACK_MODELS', ['google/veo-3.1', 'openai/sora-2-pro', 'kwaivgi/kling-v3.0-pro']),
        selectFromCatalog: false,
    },
    VALIDATOR_ENGINE: {
        id: configuredModel('OPENROUTER_VALIDATOR_MODEL', 'google/gemini-3.8-flash'),
        provider: 'openrouter',
        capability: 'VALIDATOR_ENGINE',
        contextWindow: 1000000,
        description: 'Structured validation and quality gates',
        costTier: 'standard', inputModalities: ['text', 'image', 'audio', 'video', 'file'], outputModalities: ['text'],
        fallbackIds: configuredFallbacks('OPENROUTER_VALIDATOR_FALLBACK_MODELS', ['openai/gpt-6-astra-pro']),
    },
    STRUCTURED_PLANNING: {
        // GPT-6 Astra Pro is the current structured-output reasoning default;
        // every fallback also advertises structured_outputs in OpenRouter's
        // live model catalog.
        id: configuredModel('OPENROUTER_PLANNER_MODEL', 'openai/gpt-6-astra-pro'),
        provider: 'openrouter',
        capability: 'STRUCTURED_PLANNING',
        contextWindow: 1050000,
        description: 'Strict structured production planning',
        costTier: 'premium', inputModalities: ['text', 'image', 'audio', 'video', 'file'], outputModalities: ['text'],
        fallbackIds: configuredFallbacks('OPENROUTER_PLANNER_FALLBACK_MODELS', ['openai/gpt-6-astra', 'anthropic/claude-fable-5.1', 'google/gemini-3.8-flash']),
    },
    VALIDATION: {
        id: configuredModel('OPENROUTER_VALIDATION_MODEL', configuredModel('OPENROUTER_VALIDATOR_MODEL', 'google/gemini-3.8-flash')),
        provider: 'openrouter',
        capability: 'VALIDATION',
        contextWindow: 1000000,
        description: 'Strict multimodal and production quality validation',
        costTier: 'standard', inputModalities: ['text', 'image', 'audio', 'video', 'file'], outputModalities: ['text'],
        fallbackIds: configuredFallbacks('OPENROUTER_VALIDATION_FALLBACK_MODELS'),
    },
    IMAGE_GENERATION: {
        id: configuredModel('OPENROUTER_IMAGE_MODEL', 'openai/gpt-image-2'),
        provider: 'openrouter',
        capability: 'IMAGE_GENERATION',
        contextWindow: 32000,
        description: 'Image generation',
        costTier: 'standard', inputModalities: ['text', 'image'], outputModalities: ['image'],
        fallbackIds: configuredFallbacks('OPENROUTER_IMAGE_FALLBACK_MODELS', ['google/gemini-3.1-flash-image']),
        selectFromCatalog: false,
    },
    VIDEO_GENERATION: {
        id: configuredModel('OPENROUTER_VIDEO_MODEL', 'bytedance/seedance-2.5'),
        provider: 'openrouter',
        capability: 'VIDEO_GENERATION',
        contextWindow: 128000,
        description: 'Video generation',
        costTier: 'standard', inputModalities: ['text', 'image', 'video'], outputModalities: ['video'],
        fallbackIds: configuredFallbacks('OPENROUTER_VIDEO_FALLBACK_MODELS', ['google/veo-3.1', 'openai/sora-2-pro', 'kwaivgi/kling-v3.0-pro']),
        selectFromCatalog: false,
    },
    TEXT_TO_SPEECH: {
        id: configuredModel('OPENROUTER_TTS_MODEL', 'google/gemini-3.1-flash-tts-preview'),
        provider: 'openrouter',
        capability: 'TEXT_TO_SPEECH',
        contextWindow: 32000,
        description: 'Text-to-speech generation',
        costTier: 'standard', inputModalities: ['text'], outputModalities: ['audio'],
        fallbackIds: configuredFallbacks('OPENROUTER_TTS_FALLBACK_MODELS', ['x-ai/grok-voice-tts-1.0', 'microsoft/mai-voice-2']),
        selectFromCatalog: false,
    },
    SFX_GENERATION: {id:configuredModel('OPENROUTER_SFX_MODEL','bytedance-seed/seed-audio-1-0'),provider:'openrouter',capability:'SFX_GENERATION',contextWindow:0,description:'Reviewed variable-length sound-effect generation',costTier:'low',inputModalities:['text'],outputModalities:['audio'],fallbackIds:[],selectFromCatalog:false},
    MUSIC_GENERATION: {id:configuredModel('OPENROUTER_MUSIC_MODEL','google/lyria-3-clip-preview'),provider:'openrouter',capability:'MUSIC_GENERATION',contextWindow:1048576,description:'Reviewed thirty-second music generation',costTier:'low',inputModalities:['text'],outputModalities:['audio','text'],fallbackIds:[],selectFromCatalog:false},
    TRANSCRIPTION: {
        id: configuredModel('OPENROUTER_TRANSCRIPTION_MODEL', 'openai/gpt-transcribe'),
        provider: 'openrouter',
        capability: 'TRANSCRIPTION',
        contextWindow: 32000,
        description: 'Audio transcription',
        costTier: 'low', inputModalities: ['audio'], outputModalities: ['transcription'],
        fallbackIds: configuredFallbacks('OPENROUTER_TRANSCRIPTION_FALLBACK_MODELS', ['microsoft/mai-transcribe-2', 'x-ai/grok-stt-1.0', 'deepgram/nova-3']),
        selectFromCatalog: false,
    },
};

export interface LogicalCapabilityConfig {
    key: LogicalCapabilityId;
    resolvesTo: CapabilityId;
    model: AIModelConfig;
}

const logicalCapability = (key: LogicalCapabilityId, resolvesTo: CapabilityId): LogicalCapabilityConfig => ({
    key,
    resolvesTo,
    model: MODEL_REGISTRY[resolvesTo],
});

/** One stable vocabulary for product workflows and operational reporting. */
export const LOGICAL_CAPABILITY_REGISTRY: Record<LogicalCapabilityId, LogicalCapabilityConfig> = {
    planner: logicalCapability('planner', 'STRUCTURED_PLANNING'),
    writer: logicalCapability('writer', 'AI_BRAIN'),
    director: logicalCapability('director', 'STRUCTURED_PLANNING'),
    orchestrator: logicalCapability('orchestrator', 'AI_BRAIN'),
    validator: logicalCapability('validator', 'VALIDATOR_ENGINE'),
    vision_qc: logicalCapability('vision_qc', 'VALIDATION'),
    video_preview: logicalCapability('video_preview', 'VIDEO_PREVIEW'),
    video_final: logicalCapability('video_final', 'VIDEO_FINAL'),
    tts: logicalCapability('tts', 'TEXT_TO_SPEECH'),
    stt: logicalCapability('stt', 'TRANSCRIPTION'),
    image: logicalCapability('image', 'IMAGE_GENERATION'),
    music:logicalCapability('music','MUSIC_GENERATION'),
    sfx:logicalCapability('sfx','SFX_GENERATION'),
};

export function getModelForCapability(capability: CapabilityId): AIModelConfig {
    const config = MODEL_REGISTRY[capability];
    if (!config) {
        throw new Error(`No model is assigned for capability: ${capability}`);
    }
    return config;
}

export function getFallbackModelsForCapability(capability: CapabilityId): readonly string[] {
    return getModelForCapability(capability).fallbackIds || [];
}

export function getModelForLogicalCapability(capability: LogicalCapabilityId): AIModelConfig {
    const config = LOGICAL_CAPABILITY_REGISTRY[capability];
    if (!config?.model) throw new Error(`No model is assigned for logical capability: ${capability}`);
    return config.model;
}

export function getFallbackModelsForLogicalCapability(capability: LogicalCapabilityId): readonly string[] {
    return getModelForLogicalCapability(capability).fallbackIds || [];
}

export function isCatalogSelectionModel(capability: CapabilityId, model: string): boolean {
    const config = getModelForCapability(capability);
    return Boolean(config.selectFromCatalog && model === config.id);
}

export function getRegisteredModelIds(): string[] {
    return Array.from(new Set(Object.values(MODEL_REGISTRY).flatMap((config) => [config.id, ...(config.fallbackIds || [])])));
}

/**
 * Registry membership is checked before a caller-supplied model can be used.
 * Catalog-selected models are resolved by model-discovery and validated again
 * against the live catalog before the provider request is sent.
 */
export function isRegisteredModelId(model: string): boolean {
    return getRegisteredModelIds().includes(model);
}


/** Production preparation uses conservative, documented billing units. Model
 * overrides remain central; unsupported model/unit combinations fail closed. */
export const PREPARATION_MODELS = {
    sfx:{id:configuredModel('OPENROUTER_SFX_MODEL','bytedance-seed/seed-audio-1-0'),capability:'SFX_GENERATION' as const,billing:'REVIEWED_ORIGINAL_AUDIO_SECONDS' as const,certifiedModel:'bytedance-seed/seed-audio-1-0'},
    music:{id:configuredModel('OPENROUTER_MUSIC_MODEL','google/lyria-3-clip-preview'),capability:'MUSIC_GENERATION' as const,billing:'REVIEWED_FIXED_SONG' as const,certifiedModel:'google/lyria-3-clip-preview'},
    image: { id: configuredModel('OPENROUTER_REFERENCE_IMAGE_MODEL', 'sourceful/riverflow-v2.6-pro'), capability: 'IMAGE_GENERATION' as const, billing: 'ENDPOINT_IMAGE_SKUS' as const },
    narration: { id: configuredModel('OPENROUTER_NARRATION_MODEL', 'mistralai/voxtral-mini-tts-3-0'), capability: 'TEXT_TO_SPEECH' as const, billing: 'CHARACTER' as const, certifiedModel: 'mistralai/voxtral-mini-tts-3-0' },
    referenceVoice: { id: configuredModel('OPENROUTER_REFERENCE_VOICE_MODEL', 'bytedance-seed/seed-audio-1-0'), capability: 'TEXT_TO_SPEECH' as const, billing: 'OUTPUT_SECONDS' as const, certifiedModel: 'bytedance-seed/seed-audio-1-0', maxOutputSeconds: 120 },
    transcription: { id: configuredModel('OPENROUTER_PREPARATION_STT_MODEL', 'mistralai/voxtral-mini-transcribe-3-0'), capability: 'TRANSCRIPTION' as const, billing: 'INPUT_SECONDS' as const, certifiedModel: 'mistralai/voxtral-mini-transcribe-3-0' },
};

/** Reviewed operation contracts, separate from routing preferences. Re-review
 * a changed permanent model version, provider, price unit or control surface.
 * Evidence/conflicts: docs/creator-workflows/AVATAR-SEED-MOTION-MASK-RESEARCH-2026-11-02.md */
export const REVIEWED_OPERATION_CONTRACTS = {
    sfx:{version:'SEED_SFX_ORIGINAL_SECONDS_120_V1',modelId:'bytedance-seed/seed-audio-1-0',canonicalSlug:'bytedance-seed/seed-audio-1-0-20260630',providerTag:'seed',endpointName:'Seed | bytedance-seed/seed-audio-1-0-20260630',maxOriginalOutputSeconds:120,maxInputCharacters:3000,rateUsdPerSecond:.0025,evidence:['https://openrouter.ai/docs/guides/overview/multimodal/tts#non-speech-prompts','https://docs.byteplus.com/en/docs/byteplusvoice/seedaudio-01'],reviewedAt:'2026-11-03'},
    music:{version:'LYRIA3_CLIP_FIXED_SONG_V1',modelId:'google/lyria-3-clip-preview',canonicalSlug:'google/lyria-3-clip-preview-20260330',providerTag:'google-ai-studio',endpointName:'Google AI Studio | google/lyria-3-clip-preview-20260330',songUsd:.04,reservationUsd:.052,priceEvidencePrefix:'30 second duration clips are priced at $0.04 per clip.',nominalDurationSeconds:30,evidence:['https://openrouter.ai/google/lyria-3-clip-preview','https://openrouter.ai/docs/guides/overview/multimodal/audio','https://openrouter.ai/docs/api_reference/streaming'],reviewedAt:'2026-11-02'},
    referenceVoice: {
        version: 'SEED_AUDIO_ORIGINAL_SECONDS_120_V1',
        modelId: 'bytedance-seed/seed-audio-1-0',
        canonicalSlug: 'bytedance-seed/seed-audio-1-0-20260630', providerTag: 'seed',
        endpointName: 'Seed | bytedance-seed/seed-audio-1-0-20260630',
        maxOriginalOutputSeconds: 120, rateUsdPerSecond: .0025,
        maxInputCharacters: 3000, maxReferenceSeconds: 30, maxReferenceBytes: 10_000_000,
        referenceCodecs: ['pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'pcm_f32le', 'mp3', 'opus'],
        evidence: ['https://docs.byteplus.com/en/docs/byteplusvoice/seedaudio-01', 'https://openrouter.ai/provider/seed'], reviewedAt: '2026-11-02',
    },
    suppliedAudioAvatar: {
        version: 'AVATAR_SUPPLIED_AUDIO_SOURCE_SECONDS_V1',
        modelId: 'heygen/avatar-iv', canonicalSlug: 'heygen/avatar-iv-20260625', providerTag: 'heygen',
        endpointName: 'HeyGen | heygen/avatar-iv-20260625', sku: 'duration_seconds', rateUsdPerSecond: .05,
        maxSourceSeconds: 600, applicationMaxSourceSeconds: 60, maxSourceBytes: 32_000_000, maxPortraitBytes: 16_000_000, maxPortraitDimension: 2000,
        audioCodecs: ['pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'pcm_f32le', 'mp3'],
        passthrough: ['voice_id', 'voice_settings', 'motion_prompt', 'expressiveness', 'fit', 'remove_background', 'background', 'caption', 'title'],
        evidence: ['https://developers.heygen.com/audio-to-video', 'https://developers.heygen.com/docs/usage-limits', 'https://developers.heygen.com/assets'], reviewedAt: '2026-11-02',
    },
} as const;
