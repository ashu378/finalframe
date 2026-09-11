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

function configuredModel(name: string, fallback: string): string {
    const value = process.env[name]?.trim();
    // OpenRouter's auto router cannot guarantee strict structured output and
    // must never be used for a capability that declares a schema.
    return value && !isUnsafeAutoModel(value) ? value : fallback;
}

function configuredFallbacks(name: string, defaults: readonly string[] = []): string[] {
    const configured = (process.env[name] || '')
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value && !isUnsafeAutoModel(value));
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
        id: configuredModel('OPENROUTER_AI_BRAIN_MODEL', 'openai/gpt-6-astra'),
        provider: 'openrouter',
        capability: 'AI_BRAIN',
        contextWindow: 200000,
        description: 'General-purpose reasoning, planning and scripting',
        costTier: 'premium', inputModalities: ['text', 'image', 'audio', 'video', 'file'], outputModalities: ['text'],
        fallbackIds: configuredFallbacks('OPENROUTER_AI_BRAIN_FALLBACK_MODELS', ['google/gemini-3.8-flash']),
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
        id: configuredModel('OPENROUTER_VIDEO_MODEL', 'google/veo-3.1-fast'),
        provider: 'openrouter',
        capability: 'VIDEO_ENGINE',
        contextWindow: 128000,
        description: 'Asynchronous video-generation routing',
        costTier: 'standard', inputModalities: ['text', 'image', 'video'], outputModalities: ['video'],
        fallbackIds: configuredFallbacks('OPENROUTER_VIDEO_FALLBACK_MODELS', ['bytedance/seedance-2.0-fast', 'kwaivgi/kling-v3.0-std']),
        selectFromCatalog: false,
    },
    VALIDATOR_ENGINE: {
        id: configuredModel('OPENROUTER_VALIDATOR_MODEL', 'google/gemini-3.8-flash'),
        provider: 'openrouter',
        capability: 'VALIDATOR_ENGINE',
        contextWindow: 1000000,
        description: 'Structured validation and quality gates',
        costTier: 'standard', inputModalities: ['text', 'image', 'audio', 'video', 'file'], outputModalities: ['text'],
        fallbackIds: configuredFallbacks('OPENROUTER_VALIDATOR_FALLBACK_MODELS', ['openai/gpt-6-astra']),
    },
    STRUCTURED_PLANNING: {
        id: configuredModel('OPENROUTER_PLANNER_MODEL', 'google/gemini-2.5-flash'),
        provider: 'openrouter',
        capability: 'STRUCTURED_PLANNING',
        contextWindow: 200000,
        description: 'Strict structured production planning',
        costTier: 'premium', inputModalities: ['text', 'image', 'audio', 'video', 'file'], outputModalities: ['text'],
        fallbackIds: configuredFallbacks('OPENROUTER_PLANNER_FALLBACK_MODELS', ['google/gemini-2.5-flash-lite', 'openai/gpt-4o-mini']),
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
        id: configuredModel('OPENROUTER_VIDEO_MODEL', 'google/veo-3.1-fast'),
        provider: 'openrouter',
        capability: 'VIDEO_GENERATION',
        contextWindow: 128000,
        description: 'Video generation',
        costTier: 'standard', inputModalities: ['text', 'image', 'video'], outputModalities: ['video'],
        fallbackIds: configuredFallbacks('OPENROUTER_VIDEO_FALLBACK_MODELS', ['bytedance/seedance-2.0-fast', 'kwaivgi/kling-v3.0-std']),
        selectFromCatalog: false,
    },
    TEXT_TO_SPEECH: {
        id: configuredModel('OPENROUTER_TTS_MODEL', 'openai/gpt-audio-mini'),
        provider: 'openrouter',
        capability: 'TEXT_TO_SPEECH',
        contextWindow: 32000,
        description: 'Text-to-speech generation',
        costTier: 'standard', inputModalities: ['text'], outputModalities: ['audio'],
        fallbackIds: configuredFallbacks('OPENROUTER_TTS_FALLBACK_MODELS', ['openai/gpt-audio']),
        selectFromCatalog: false,
    },
    TRANSCRIPTION: {
        id: configuredModel('OPENROUTER_TRANSCRIPTION_MODEL', 'openai/gpt-transcribe'),
        provider: 'openrouter',
        capability: 'TRANSCRIPTION',
        contextWindow: 32000,
        description: 'Audio transcription',
        costTier: 'low', inputModalities: ['audio'], outputModalities: ['transcription'],
        fallbackIds: configuredFallbacks('OPENROUTER_TRANSCRIPTION_FALLBACK_MODELS', ['microsoft/mai-transcribe-2', 'deepgram/nova-3']),
        selectFromCatalog: false,
    },
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
