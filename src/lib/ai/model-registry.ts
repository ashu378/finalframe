/**
 * FinalFrame model routing defaults.
 *
 * The registry describes the role a model fulfils. OpenRouter model slugs are
 * configuration, not application logic: operators can change them without
 * changing capability callers. `openrouter/auto` is a valid bounded default
 * for chat roles; media helpers select an explicit model or use discovery.
 */

import type { AIProvider, CapabilityId } from './types';

/**
 * AI Capabilities — The four structural pillars of FinalFrame intelligence.
 * All logic must route by Capability, never by task.
 */
export type AICapability =
    | 'AI_BRAIN'        // Reasoning, Planning, Scripting, Remix Parsing
    | 'IMAGE_ENGINE'    // Static generation, Banners, Init frames
    | 'VIDEO_ENGINE'    // Motion synthesis, Commercials, UGC
    | 'VALIDATOR_ENGINE'; // Safety, Quality Gates, Export Blocking

/**
 * Execution Profile — Deterministic video model driver.
 * Derived from content_type, platform, context, quality_tier.
 */
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
}

/**
 * Model Registry — Mapping Capabilities to Locked Models.
 * Model IDs MUST NOT appear outside this file or adapters.
 */
export const MODEL_REGISTRY: Record<AICapability, AIModelConfig> = {
    AI_BRAIN: {
        id: process.env.OPENROUTER_AI_BRAIN_MODEL || 'openrouter/auto',
        provider: 'openrouter',
        capability: 'AI_BRAIN',
        contextWindow: 200000,
        description: 'General-purpose reasoning, planning and scripting'
    },
    IMAGE_ENGINE: {
        id: process.env.OPENROUTER_IMAGE_MODEL || 'openrouter/auto',
        provider: 'openrouter',
        capability: 'IMAGE_ENGINE',
        contextWindow: 32000,
        description: 'Image understanding and image-generation routing'
    },
    VIDEO_ENGINE: {
        id: process.env.OPENROUTER_VIDEO_MODEL || 'auto',
        provider: 'openrouter',
        capability: 'VIDEO_ENGINE',
        contextWindow: 128000,
        description: 'Asynchronous video-generation routing'
    },
    VALIDATOR_ENGINE: {
        id: process.env.OPENROUTER_VALIDATOR_MODEL || 'openrouter/auto',
        provider: 'openrouter',
        capability: 'VALIDATOR_ENGINE',
        contextWindow: 1000000,
        description: 'Structured validation and quality gates'
    }
};

/**
 * Architecturally Enforced Model Selection
 */
export function getModelForCapability(capability: AICapability): AIModelConfig {
    const config = MODEL_REGISTRY[capability];
    if (!config) {
        throw new Error(`VIOLATION: No model assigned for capability: ${capability}`);
    }
    return config;
}
