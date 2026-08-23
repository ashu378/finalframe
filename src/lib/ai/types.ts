/**
 * Provider-neutral contracts used by the capability gateway.
 *
 * These types intentionally describe what a model can do, rather than which
 * vendor happens to provide it. Provider-specific request shapes stay in the
 * adapter layer.
 */

export type AIProvider = 'openrouter' | 'runway' | 'internal' | (string & {});

export type CapabilityId =
    | 'AI_BRAIN'
    | 'IMAGE_ENGINE'
    | 'VIDEO_ENGINE'
    | 'VALIDATOR_ENGINE'
    | 'VIDEO_GENERATION'
    | 'IMAGE_GENERATION'
    | 'TEXT_TO_SPEECH'
    | 'TRANSCRIPTION';

export type Modality = 'text' | 'image' | 'video' | 'audio' | 'file' | 'transcription';

export type CapabilityParameter =
    | 'temperature'
    | 'top_p'
    | 'max_tokens'
    | 'response_format'
    | 'resolution'
    | 'size'
    | 'quality'
    | 'aspect_ratio'
    | 'duration'
    | 'voice'
    | 'speed'
    | 'language'
    | 'input_references'
    | 'provider_options'
    | 'output_format'
    | 'background'
    | 'output_compression'
    | 'seed'
    | 'n'
    | 'instructions';

export interface CapabilityDescriptor {
    capability: CapabilityId;
    provider: AIProvider;
    model?: string;
    inputModalities: readonly Modality[];
    outputModalities: readonly Modality[];
    supportedParameters: readonly CapabilityParameter[];
    supportsStructuredOutput: boolean;
    enabled: boolean;
    discovery?: 'models' | 'images' | 'videos' | 'static';
}

export interface StructuredOutputDefinition {
    name: string;
    schema: Record<string, unknown>;
    /** OpenRouter structured outputs require strict mode for this gateway. */
    strict: true;
    description?: string;
}

export interface NormalizedUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    inputTokens?: number;
    outputTokens?: number;
    cachedTokens?: number;
    reasoningTokens?: number;
    seconds?: number;
    costUsd?: number;
    raw?: unknown;
    /** OpenAI-compatible aliases retained for existing callers. */
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost?: number;
}

export type AIErrorCode =
    | 'MISSING_API_KEY'
    | 'INVALID_REQUEST'
    | 'UNSUPPORTED_CAPABILITY'
    | 'UNSUPPORTED_MODEL'
    | 'PROVIDER_AUTHENTICATION'
    | 'PROVIDER_RATE_LIMIT'
    | 'PROVIDER_PAYMENT_REQUIRED'
    | 'PROVIDER_UNAVAILABLE'
    | 'PROVIDER_ERROR'
    | 'INVALID_PROVIDER_RESPONSE'
    | 'REQUEST_TIMEOUT'
    | 'NETWORK_ERROR';

export interface NormalizedAIErrorShape {
    name: 'AICapabilityError';
    code: AIErrorCode;
    message: string;
    provider: AIProvider;
    capability?: CapabilityId | string;
    model?: string;
    status?: number;
    requestId?: string;
    retryable: boolean;
    details?: unknown;
}

export class AICapabilityError extends Error implements NormalizedAIErrorShape {
    readonly name = 'AICapabilityError' as const;
    readonly code: AIErrorCode;
    readonly provider: AIProvider;
    readonly capability?: CapabilityId | string;
    readonly model?: string;
    readonly status?: number;
    readonly requestId?: string;
    readonly retryable: boolean;
    readonly details?: unknown;

    constructor(input: Omit<NormalizedAIErrorShape, 'name'> & { cause?: unknown }) {
        super(input.message, input.cause === undefined ? undefined : { cause: input.cause });
        this.code = input.code;
        this.provider = input.provider;
        this.capability = input.capability;
        this.model = input.model;
        this.status = input.status;
        this.requestId = input.requestId;
        this.retryable = input.retryable;
        this.details = input.details;
        Object.setPrototypeOf(this, new.target.prototype);
    }

    toJSON(): NormalizedAIErrorShape {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            provider: this.provider,
            capability: this.capability,
            model: this.model,
            status: this.status,
            requestId: this.requestId,
            retryable: this.retryable,
            details: this.details,
        };
    }
}

export interface ImageGenerationRequest {
    prompt: string;
    model?: string;
    n?: number;
    resolution?: string;
    aspectRatio?: string;
    size?: string;
    quality?: 'auto' | 'low' | 'medium' | 'high';
    outputFormat?: 'png' | 'jpeg' | 'webp';
    background?: 'auto' | 'transparent' | 'opaque';
    outputCompression?: number;
    seed?: number;
    inputReferences?: Array<{ url: string } | { data: string; mediaType?: string }>;
    providerOptions?: Record<string, unknown>;
}

export interface VideoGenerationRequest {
    prompt: string;
    model: string;
    aspectRatio?: string;
    duration?: number;
    resolution?: string;
    frameImages?: Array<{ url: string } | { data: string; mediaType?: string }>;
    inputReferences?: Array<{ url: string } | { data: string; mediaType?: string }>;
    providerOptions?: Record<string, unknown>;
}

export interface SpeechSynthesisRequest {
    input: string;
    model: string;
    voice: string;
    responseFormat?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
    speed?: number;
    instructions?: string;
    providerOptions?: Record<string, unknown>;
}

export interface TranscriptionRequest {
    model: string;
    audio: { data: string; format: string };
    language?: string;
    temperature?: number;
    providerOptions?: Record<string, unknown>;
}

export interface MediaUsageResult {
    usage?: NormalizedUsage;
    costUsd?: number;
}
