import type OpenAI from 'openai';
import {
    executeAITask,
    generateImage,
    generateVideo,
    synthesizeSpeech,
    transcribeAudio,
    type OpenRouterChatOptions,
    type OpenRouterTransportOptions,
} from '@/lib/adapters/openrouter-adapter';
import { getModelForCapability, type AICapability } from './model-registry';
import { DIRECTOR_PLAN_SCHEMA, validateCreateIntent, validateDirectorPlan } from './schemas';
import type {
    CreateIntent,
    ImageGenerationRequest,
    SpeechSynthesisRequest,
    TranscriptionRequest,
    VideoGenerationRequest,
} from './types';

export type ProviderCapabilityInput =
    | { kind: 'planning' | 'validation'; messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]; options?: OpenRouterChatOptions }
    | { kind: 'image'; request: ImageGenerationRequest; options?: OpenRouterTransportOptions }
    | { kind: 'video'; request: VideoGenerationRequest; options?: OpenRouterTransportOptions }
    | { kind: 'speech'; request: SpeechSynthesisRequest; options?: OpenRouterTransportOptions }
    | { kind: 'transcription'; request: TranscriptionRequest; options?: OpenRouterTransportOptions };

/**
 * Provider-neutral execution boundary. The rest of the application selects a
 * workload by intent, not by an OpenRouter model ID or endpoint.
 */
export async function executeProviderCapability(input: ProviderCapabilityInput) {
    switch (input.kind) {
        case 'planning':
            return executeAITask('STRUCTURED_PLANNING', input.messages, input.options);
        case 'validation':
            return executeAITask('VALIDATION', input.messages, input.options);
        case 'image':
            return generateImage(input.request, input.options);
        case 'video':
            return generateVideo(input.request, input.options);
        case 'speech':
            return synthesizeSpeech(withConfiguredModel('TEXT_TO_SPEECH', input.request), input.options);
        case 'transcription':
            return transcribeAudio(withConfiguredModel('TRANSCRIPTION', input.request), input.options);
    }
}

function withConfiguredModel<T extends { model: string }>(capability: 'TEXT_TO_SPEECH' | 'TRANSCRIPTION', request: Omit<T, 'model'> & { model?: string }): T {
    return { ...request, model: request.model || getModelForCapability(capability).id } as T;
}

function creationInputSummary(intent: CreateIntent, transcript?: string): string {
    const inputLines = [
        `Preset: ${intent.preset}`,
        `Input mode: ${intent.inputMode}`,
        `Language: ${intent.language}`,
        `Platform: ${intent.platform}`,
        `Aspect ratio: ${intent.aspectRatio}`,
        `Target duration: ${intent.durationSeconds} seconds`,
        `Quality tier: ${intent.qualityTier}`,
        `Brief: ${intent.brief.trim()}`,
        intent.script?.trim() ? `Script: ${intent.script.trim()}` : 'Script: not provided; create one from the brief.',
        transcript?.trim() ? `Performance transcript: ${transcript.trim()}` : 'Performance transcript: not provided.',
    ];
    return inputLines.join('\n');
}

/**
 * Converts idea-first, script-first, voice-first, and mixed-media input into a
 * durable structured plan. Voice is optional; when present, its transcript is
 * used as the timing and dialogue source without making upload mandatory.
 */
export async function generateDirectorPlan(input: CreateIntent, options: OpenRouterChatOptions = {}, transcript?: string) {
    const intent = validateCreateIntent(input);
    const response = await executeAITask('STRUCTURED_PLANNING', [
        {
            role: 'system',
            content: [
                'You are FinalFrame\'s production director.',
                'Create an executable plan for a creator-friendly video production studio.',
                'A user may provide only an idea, a script, an optional performance recording transcript, or mixed media.',
                'Never require a voice recording when the input mode is idea-first or script-first.',
                'Use distinct characters, locations, timing, references, and shot purposes.',
                'Return only JSON matching the supplied strict schema.',
            ].join('\n'),
        },
        { role: 'user', content: creationInputSummary(intent, transcript) },
    ], {
        ...options,
        structuredOutput: options.structuredOutput || DIRECTOR_PLAN_SCHEMA,
    });
    if (!response.content) {
        throw new Error('FinalFrame planning returned no plan content.');
    }
    const parsed = typeof response.content === 'string' ? JSON.parse(response.content) as unknown : response.content;
    return { ...response, plan: validateDirectorPlan(parsed) };
}

