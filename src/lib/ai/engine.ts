/**
 * FinalFrame — AI Capability Engine (Abstract Interface)
 * Reference: MASTER_PRD.md § 3 — Capability-Based Architecture
 * Reference: HARD CONSTRAINT DOCUMENT § 2 — Permitted Capabilities
 * 
 * This file serves as the SINGLE entry point for all AI execution.
 * It routes requests to the configured provider adapter.
 */

import type { AICapability, ExecutionProfile } from './model-registry';
import { executeAITask as executeOpenRouter, generateVideo as submitOpenRouterVideo, pollVideo, type AIResponse, type OpenRouterChatOptions } from '@/lib/adapters/openrouter-adapter';
import { getModelForCapability } from './model-registry';
import type { CameraConfig, MotionConfig, RenderStrategy, SceneAsset, StudioAsset } from '@/lib/types/database';
import type OpenAI from 'openai';

// Re-export types for consumers
export type { AIResponse } from '@/lib/adapters/openrouter-adapter';
export type { CameraConfig, MotionConfig } from '@/lib/types/database';
export type { AICapability, ExecutionProfile } from './model-registry';
export type { OpenRouterChatOptions, OpenRouterTransportOptions } from '@/lib/adapters/openrouter-adapter';
export { extractUsageAndCost, buildStructuredResponseFormat, buildChatCompletionRequest, generateImage, generateVideo, pollVideo, downloadVideo, synthesizeSpeech, transcribeAudio } from '@/lib/adapters/openrouter-adapter';

export interface VideoGenerationResult {
    taskId: string;
    status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
    videoUrl?: string;
    duration?: number;
    error?: string;
    executionProfile?: ExecutionProfile;
    provider: 'openrouter';
    model: string;
    usage?: unknown;
}

/**
 * Execute an AI task via the active provider.
 * Routes based on Capability.
 */
export async function executeAITask(
    capability: AICapability,
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    options?: OpenRouterChatOptions
): Promise<AIResponse> {
    // Note: VIDEO_ENGINE capability is handled via executeVideoGeneration for async orchestration
    if (capability === 'VIDEO_ENGINE') {
        throw new Error('VIDEO_ENGINE tasks must use executeVideoGeneration() for async orchestration.');
    }

    // Route to OpenRouter for AI_BRAIN, IMAGE_ENGINE, and VALIDATOR_ENGINE
    return executeOpenRouter(capability, messages, options);
}

/**
 * Execute video generation through the OpenRouter gateway.
 * The call remains compatible with the existing production action while the
 * provider work is asynchronous underneath. Runway is retained only as a
 * disabled legacy adapter and is not part of the production path.
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
): Promise<VideoGenerationResult> {
    const ratio = options.ratio || '16:9';
    const model = getModelForCapability('VIDEO_ENGINE').id;
    const enrichedPrompt = [
        prompt,
        options.cameraConfig ? `Camera: ${JSON.stringify(options.cameraConfig)}` : '',
        options.motionConfig ? `Motion: ${JSON.stringify(options.motionConfig)}` : '',
        `Execution profile: ${executionProfile}`,
        `Generation strategy: ${strategy}`,
    ].filter(Boolean).join('\n');

    const submitted = await submitOpenRouterVideo({
        model,
        prompt: enrichedPrompt,
        duration: options.duration || 6,
        aspectRatio: ratio,
        inputReferences: [
            ...(options.initImageUrl ? [{ url: options.initImageUrl }] : []),
            ...(options.initVideoUrl ? [{ url: options.initVideoUrl }] : []),
        ],
    });

    let current = await pollVideo(submitted.id);
    for (let attempt = 0; attempt < 60 && !['completed', 'succeeded', 'failed', 'error', 'canceled'].includes(String(current.status).toLowerCase()); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        current = await pollVideo(submitted.id);
    }

    const status = String(current.status).toLowerCase();
    if (['failed', 'error', 'canceled'].includes(status)) {
        throw new Error(current.error || 'OpenRouter video generation failed');
    }
    if (!['completed', 'succeeded'].includes(status)) {
        throw new Error('OpenRouter video generation timed out while polling');
    }

    const videoUrl = current.unsigned_urls?.[0];
    if (!videoUrl) throw new Error('OpenRouter completed the video but returned no downloadable URL');
    return {
        taskId: submitted.id,
        status: 'SUCCEEDED',
        videoUrl,
        duration: options.duration || 6,
        executionProfile,
        provider: 'openrouter' as const,
        model: submitted.modelUsed,
        usage: current.usage,
    };
}
