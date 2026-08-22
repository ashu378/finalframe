/**
 * FinalFrame — AI Capability Engine (Abstract Interface)
 * Reference: MASTER_PRD.md § 3 — Capability-Based Architecture
 * Reference: HARD CONSTRAINT DOCUMENT § 2 — Permitted Capabilities
 * 
 * This file serves as the SINGLE entry point for all AI execution.
 * It routes requests to the configured provider adapter.
 */

import { AICapability, ExecutionProfile } from './model-registry';
import { executeAITask as executeOpenRouter, AIResponse } from '@/lib/adapters/openrouter-adapter';
import { generateVideo as executeRunway } from '@/lib/adapters/runway-adapter';
import type { CameraConfig, MotionConfig, RenderStrategy, SceneAsset, StudioAsset } from '@/lib/types/database';
import OpenAI from 'openai';

// Re-export types for consumers
export type { AIResponse } from '@/lib/adapters/openrouter-adapter';
export type { CameraConfig, MotionConfig } from '@/lib/types/database';
export type { AICapability, ExecutionProfile } from './model-registry';

/**
 * Execute an AI task via the active provider.
 * Routes based on Capability.
 */
export async function executeAITask(
    capability: AICapability,
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    options?: {
        temperature?: number;
        jsonMode?: boolean;
        cameraConfig?: CameraConfig;
        motionConfig?: MotionConfig;
    }
): Promise<AIResponse> {
    // Note: VIDEO_ENGINE capability is handled via executeVideoGeneration for async orchestration
    if (capability === 'VIDEO_ENGINE') {
        throw new Error('VIDEO_ENGINE tasks must use executeVideoGeneration() for async orchestration.');
    }

    // Route to OpenRouter for AI_BRAIN, IMAGE_ENGINE, and VALIDATOR_ENGINE
    return executeOpenRouter(capability, messages, options);
}

/**
 * Execute video generation via Runway.
 * ExecutionProfile is required — derived by pipeline from project context.
 * Reference: HARD CONSTRAINT DOCUMENT § 4
 */
export async function executeVideoGeneration(
    strategy: RenderStrategy,
    prompt: string,
    executionProfile: ExecutionProfile,
    options: {
        initImageUrl?: string;
        initVideoUrl?: string;
        cameraConfig?: CameraConfig;
        motionConfig?: MotionConfig;
        duration?: 4 | 6 | 8;
        ratio?: '16:9' | '9:16' | '1:1';
        sceneAssets?: SceneAsset[];
        studioAssets?: StudioAsset[];
    }
) {
    return executeRunway(strategy, prompt, executionProfile, options);
}
