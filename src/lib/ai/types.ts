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
    | 'STRUCTURED_PLANNING'
    | 'VALIDATION'
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

/** Customer-facing planning vocabulary. Provider/model names do not belong in these contracts. */
export type WorkflowPreset =
    | 'ANIMATED_COMEDY_2D'
    | 'REALISTIC_AI_SKIT'
    | 'VOICEOVER_STORY'
    | 'AI_PRODUCT_AD'
    | 'FACELESS_EXPLAINER'
    | 'SHORT_FILM';

export type InputMode =
    | 'IDEA'
    | 'SCRIPT'
    | 'VOICE'
    | 'CAST_REFERENCES'
    | 'FOOTAGE'
    | 'AD_BRIEF'
    | 'MIXED_MEDIA';

export type WorkflowStage =
    | 'BRIEF'
    | 'PERFORMANCE'
    | 'PLAN'
    | 'BIBLE'
    | 'SHOTS'
    | 'MAKE'
    | 'FINISH'
    | 'REVIEW'
    | 'EXPORT';

export type ApprovalStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';

export type QualityGateStatus =
    | 'NOT_RUN'
    | 'PASS'
    | 'PASS_WITH_WARNINGS'
    | 'BLOCKED'
    | 'REQUIRES_HUMAN_REVIEW';

export type QualityEvidenceResult = 'PASS' | 'WARN' | 'FAIL';

export interface QualityEvidence {
    rule: string;
    result: QualityEvidenceResult;
    explanation: string;
}

export interface QualityGateResult {
    status: QualityGateStatus;
    continuityScore?: number;
    audioAlignmentScore?: number;
    captionAccuracyScore?: number;
    evidence: QualityEvidence[];
}

/**
 * A user can begin with an idea, script, recording, references, footage, or
 * any combination. Voice is never mandatory for idea/script creation.
 */
export interface CreateIntent {
    preset: WorkflowPreset;
    inputMode: InputMode;
    /** Empty is allowed for voice-only and reference-only intake; the validator enforces mode-specific requirements. */
    brief: string;
    script?: string;
    inputAssetIds: string[];
    performanceAssetIds?: string[];
    referenceAssetIds?: string[];
    language: string;
    platform: string;
    aspectRatio: string;
    durationSeconds: number;
    qualityTier: 'ECONOMY' | 'STANDARD' | 'PREMIUM';
}

export interface SpeakerSegment {
    id: string;
    speakerLabel: string;
    characterId?: string;
    startSeconds: number;
    endSeconds: number;
    text: string;
    confidence?: number;
    reviewed: boolean;
}

export interface CreativeGuide {
    visualStyle: string;
    palette: string[];
    lighting?: string;
    cameraLanguage?: string;
    typography?: string;
    continuityRules: string[];
    characterRules?: string[];
    locationRules?: string[];
    productRules?: string[];
    audioDirection: string;
    culturalContext?: string;
}

export interface ShotSpec {
    sequenceId: string;
    sceneId: string;
    orderIndex: number;
    purpose: string;
    durationSeconds: number;
    dialogueSegmentIds: string[];
    characterIds: string[];
    locationIds: string[];
    productIds: string[];
    referencePackIds: string[];
    camera: Record<string, unknown>;
    action: string;
    prompt: string;
    negativePrompt?: string;
    providerCapability: CapabilityId;
}

export interface DirectorPlan {
    planVersion: number;
    intentSummary: string;
    preset: WorkflowPreset;
    inputMode: InputMode;
    language: string;
    platform: string;
    durationSeconds: number;
    aspectRatio: string;
    script: string;
    speakers: SpeakerSegment[];
    shots: ShotSpec[];
    creativeGuide: CreativeGuide;
    riskFlags: string[];
    estimatedCredits: number;
    approvalStatus: ApprovalStatus;
    currentStage: WorkflowStage;
    qualityGateStatus: QualityGateStatus;
    qualityGates: QualityGateResult[];
}

export interface AnchorPack {
    productionVersionId: string;
    characterAssetIds: string[];
    locationAssetIds: string[];
    styleAssetIds: string[];
    productAssetIds: string[];
    approvalStatus: 'DRAFT' | 'APPROVED' | 'REJECTED';
    continuityRules: string[];
}

export interface ProviderReference {
    url?: string;
    data?: string;
    mediaType?: string;
}

export interface GenerationRequest {
    capability: CapabilityId;
    prompt: string;
    model?: string;
    provider?: AIProvider;
    modality?: Modality;
    references?: ProviderReference[];
    parameters: Record<string, unknown>;
    idempotencyKey: string;
    productionId: string;
    shotId?: string;
    reservationId?: string;
    requestHash?: string;
    correlationId?: string;
}

export type ProviderTaskStatus =
    | 'QUEUED'
    | 'SUBMITTED'
    | 'POLLING'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'CANCELED'
    | 'TIMED_OUT'
    | 'RECONCILIATION_REQUIRED';

export type RetryDisposition =
    | 'RETRYABLE'
    | 'NON_RETRYABLE'
    | 'RECONCILIATION_REQUIRED'
    | 'CANCELED'
    | 'TIMED_OUT';

export type RetryReasonCode =
    | 'RATE_LIMITED'
    | 'PROVIDER_UNAVAILABLE'
    | 'NETWORK_ERROR'
    | 'REQUEST_TIMEOUT'
    | 'INVALID_REQUEST'
    | 'UNSUPPORTED_CAPABILITY'
    | 'AUTHENTICATION_FAILED'
    | 'CONTENT_POLICY'
    | 'UNKNOWN_PROVIDER_STATE'
    | 'CANCELED_BY_USER';

export interface RetryClassification {
    disposition: RetryDisposition;
    reasonCode: RetryReasonCode;
    retryable: boolean;
    reason: string;
    attempt: number;
    maxAttempts: number;
    retryAfterSeconds?: number;
}

export type GeneratedArtifactKind = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'TRANSCRIPT' | 'TEXT';

export interface NormalizedGenerationOutput {
    outputId: string;
    kind: GeneratedArtifactKind;
    provider: AIProvider;
    model: string;
    providerTaskId: string;
    contentType: string;
    remoteUrl?: string;
    inlineData?: string;
    checksum?: string;
    byteSize?: number;
    width?: number;
    height?: number;
    durationSeconds?: number;
    frameRate?: number;
    usage?: NormalizedUsage;
    metadata: Record<string, unknown>;
}

export type QCStatus = 'PENDING' | 'PASS' | 'PASS_WITH_WARNINGS' | 'FAIL' | 'REQUIRES_HUMAN_REVIEW';

export type QCCheckName =
    | 'CONTENT_SAFETY'
    | 'MEDIA_INTEGRITY'
    | 'CONTINUITY'
    | 'AUDIO_ALIGNMENT'
    | 'CAPTION_ACCURACY'
    | 'TEXT_ACCURACY'
    | 'REFERENCE_MATCH';

export interface QCCheckResult {
    check: QCCheckName;
    status: QCStatus;
    score?: number;
    explanation: string;
    evidence?: string[];
}

export interface QCResult {
    status: QCStatus;
    checks: QCCheckResult[];
    qualityVersion: string;
    checkedAt: string;
    blockingReasons: string[];
}

export interface ProviderTask {
    taskId: string;
    provider: AIProvider;
    providerTaskId: string;
    capability: CapabilityId;
    status: ProviderTaskStatus;
    idempotencyKey: string;
    requestHash: string;
    attempt: number;
    maxAttempts: number;
    createdAt: string;
    updatedAt: string;
    nextPollAt?: string;
    submittedAt?: string;
    completedAt?: string;
    retry?: RetryClassification;
    output?: NormalizedGenerationOutput;
    qc?: QCResult;
    error?: NormalizedAIErrorShape;
}

export type FeatureFlagKey =
    | 'generation.real_provider'
    | 'generation.qc'
    | 'generation.retry'
    | 'capability.image_generation'
    | 'capability.video_generation'
    | 'capability.text_to_speech'
    | 'capability.transcription'
    | 'workflow.animated_comedy_2d'
    | 'workflow.realistic_ai_skit'
    | 'workflow.voiceover_story'
    | 'workflow.ai_product_ad'
    | 'workflow.faceless_explainer'
    | 'workflow.short_film';

export type FeatureFlagState = 'DISABLED' | 'INTERNAL' | 'BETA' | 'ENABLED';

export interface FeatureFlag {
    key: FeatureFlagKey;
    state: FeatureFlagState;
    reason?: string;
    rolloutPercent?: number;
    updatedAt: string;
    expiresAt?: string;
}

export type FeatureFlagSet = Partial<Record<FeatureFlagKey, FeatureFlag>>;

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
