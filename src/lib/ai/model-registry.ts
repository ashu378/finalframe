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
    maxTokens?: number;
    /** Models to try after this configured model on a transient failure. */
    fallbackIds?: readonly string[];
    /** Media capabilities may choose a verified catalog model for this entry. */
    selectFromCatalog?: boolean;
}

function configuredModel(name: string, fallback: string): string {
    const value = process.env[name]?.trim();
    return value || fallback;
}

function configuredFallbacks(name: string): string[] {
    return (process.env[name] || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
}

/**
 * Capability model registry. Keep all model IDs, including fallback IDs,
 * inside this module.
 */
export const MODEL_REGISTRY: Record<CapabilityId, AIModelConfig> = {
    AI_BRAIN: {
        id: configuredModel('OPENROUTER_AI_BRAIN_MODEL', 'openrouter/auto'),
        provider: 'openrouter',
        capability: 'AI_BRAIN',
        contextWindow: 200000,
        description: 'General-purpose reasoning, planning and scripting',
        fallbackIds: configuredFallbacks('OPENROUTER_AI_BRAIN_FALLBACK_MODELS'),
    },
    IMAGE_ENGINE: {
        id: configuredModel('OPENROUTER_IMAGE_MODEL', 'openrouter/auto'),
        provider: 'openrouter',
        capability: 'IMAGE_ENGINE',
        contextWindow: 32000,
        description: 'Image understanding and image-generation routing',
        fallbackIds: configuredFallbacks('OPENROUTER_IMAGE_FALLBACK_MODELS'),
        selectFromCatalog: !process.env.OPENROUTER_IMAGE_MODEL?.trim(),
    },
    VIDEO_ENGINE: {
        id: configuredModel('OPENROUTER_VIDEO_MODEL', 'auto'),
        provider: 'openrouter',
        capability: 'VIDEO_ENGINE',
        contextWindow: 128000,
        description: 'Asynchronous video-generation routing',
        fallbackIds: configuredFallbacks('OPENROUTER_VIDEO_FALLBACK_MODELS'),
        selectFromCatalog: !process.env.OPENROUTER_VIDEO_MODEL?.trim(),
    },
    VALIDATOR_ENGINE: {
        id: configuredModel('OPENROUTER_VALIDATOR_MODEL', 'openrouter/auto'),
        provider: 'openrouter',
        capability: 'VALIDATOR_ENGINE',
        contextWindow: 1000000,
        description: 'Structured validation and quality gates',
        fallbackIds: configuredFallbacks('OPENROUTER_VALIDATOR_FALLBACK_MODELS'),
    },
    STRUCTURED_PLANNING: {
        id: configuredModel('OPENROUTER_PLANNER_MODEL', configuredModel('OPENROUTER_AI_BRAIN_MODEL', 'openrouter/auto')),
        provider: 'openrouter',
        capability: 'STRUCTURED_PLANNING',
        contextWindow: 200000,
        description: 'Strict structured production planning',
        fallbackIds: configuredFallbacks('OPENROUTER_PLANNER_FALLBACK_MODELS'),
    },
    VALIDATION: {
        id: configuredModel('OPENROUTER_VALIDATION_MODEL', configuredModel('OPENROUTER_VALIDATOR_MODEL', 'openrouter/auto')),
        provider: 'openrouter',
        capability: 'VALIDATION',
        contextWindow: 1000000,
        description: 'Strict multimodal and production quality validation',
        fallbackIds: configuredFallbacks('OPENROUTER_VALIDATION_FALLBACK_MODELS'),
    },
    IMAGE_GENERATION: {
        id: configuredModel('OPENROUTER_IMAGE_MODEL', 'openrouter/auto'),
        provider: 'openrouter',
        capability: 'IMAGE_GENERATION',
        contextWindow: 32000,
        description: 'Image generation',
        fallbackIds: configuredFallbacks('OPENROUTER_IMAGE_FALLBACK_MODELS'),
        selectFromCatalog: !process.env.OPENROUTER_IMAGE_MODEL?.trim(),
    },
    VIDEO_GENERATION: {
        id: configuredModel('OPENROUTER_VIDEO_MODEL', 'auto'),
        provider: 'openrouter',
        capability: 'VIDEO_GENERATION',
        contextWindow: 128000,
        description: 'Video generation',
        fallbackIds: configuredFallbacks('OPENROUTER_VIDEO_FALLBACK_MODELS'),
        selectFromCatalog: !process.env.OPENROUTER_VIDEO_MODEL?.trim(),
    },
    TEXT_TO_SPEECH: {
        id: configuredModel('OPENROUTER_TTS_MODEL', 'openrouter/auto'),
        provider: 'openrouter',
        capability: 'TEXT_TO_SPEECH',
        contextWindow: 32000,
        description: 'Text-to-speech generation',
        fallbackIds: configuredFallbacks('OPENROUTER_TTS_FALLBACK_MODELS'),
        selectFromCatalog: !process.env.OPENROUTER_TTS_MODEL?.trim(),
    },
    TRANSCRIPTION: {
        id: configuredModel('OPENROUTER_TRANSCRIPTION_MODEL', 'openrouter/auto'),
        provider: 'openrouter',
        capability: 'TRANSCRIPTION',
        contextWindow: 32000,
        description: 'Audio transcription',
        fallbackIds: configuredFallbacks('OPENROUTER_TRANSCRIPTION_FALLBACK_MODELS'),
        selectFromCatalog: !process.env.OPENROUTER_TRANSCRIPTION_MODEL?.trim(),
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
