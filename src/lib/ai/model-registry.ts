/**
 * FinalFrame — AI Model Registry & Canonical Capabilities
 * Reference: HARD CONSTRAINT DOCUMENT § 2 & § 3
 * Reference: HARD CONSTRAINT DOCUMENT § 4 — Execution Profile Rule
 * 
 * This file is the SINGLE SOURCE OF TRUTH for:
 * 1. AI Capabilities (Locked to 4 Structural Pillars)
 * 2. Execution Profiles (Deterministic Video Drivers)
 * 3. Model ID Configuration (Encapsulated)
 */

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
    id: string;         // Provider-specific model ID
    provider: string;   // e.g., 'anthropic', 'google', 'runway'
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
        id: 'anthropic/claude-sonnet-4.5',
        provider: 'anthropic',
        contextWindow: 200000,
        description: 'SOTA Reasoning for Scripting and Planning'
    },
    IMAGE_ENGINE: {
        id: 'google/gemini-3-pro-image-preview',
        provider: 'google',
        contextWindow: 32000,
        description: 'High-fidelity static visual generation'
    },
    VIDEO_ENGINE: {
        id: 'runway/adapter-managed',
        provider: 'runway',
        contextWindow: 128000,
        description: 'Internal suite: Gen-3, Gen-4, Veo 3.x'
    },
    VALIDATOR_ENGINE: {
        id: 'google/gemini-3-pro-preview',
        provider: 'google',
        contextWindow: 1000000,
        description: 'Deterministic safety and quality gates'
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
