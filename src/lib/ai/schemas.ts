import { AICapabilityError, type AIProvider, type ApprovalStatus, type CapabilityId, type CreateIntent, type CreativeGuide, type DirectorPlan, type FeatureFlag, type FeatureFlagKey, type FeatureFlagSet, type GeneratedArtifactKind, type GenerationRequest, type InputMode, type Modality, type NormalizedGenerationOutput, type ProviderReference, type ProviderTask, type ProviderTaskStatus, type QCCheckName, type QCCheckResult, type QCResult, type QCStatus, type QualityEvidence, type QualityGateResult, type QualityGateStatus, type RetryClassification, type RetryDisposition, type RetryReasonCode, type ShotSpec, type SpeakerSegment, type WorkflowPreset, type WorkflowStage } from './types';
import { assertPlanQuality } from './planning/quality';

export interface StructuredSchemaDefinition {
    name: string;
    description: string;
    strict: true;
    schema: Record<string, unknown>;
}

const stringArray = { type: 'array', items: { type: 'string' } };
const PRESETS: readonly WorkflowPreset[] = ['ANIMATED_COMEDY_2D', 'REALISTIC_AI_SKIT', 'VOICEOVER_STORY', 'AI_PRODUCT_AD', 'FACELESS_EXPLAINER', 'SHORT_FILM'];
const INPUT_MODES: readonly InputMode[] = ['IDEA', 'SCRIPT', 'VOICE', 'CAST_REFERENCES', 'FOOTAGE', 'AD_BRIEF', 'MIXED_MEDIA'];
const STAGES: readonly WorkflowStage[] = ['BRIEF', 'PERFORMANCE', 'PLAN', 'BIBLE', 'SHOTS', 'MAKE', 'FINISH', 'REVIEW', 'EXPORT'];
const APPROVALS: readonly ApprovalStatus[] = ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED'];
const QUALITY_STATUSES: readonly QualityGateStatus[] = ['NOT_RUN', 'PASS', 'PASS_WITH_WARNINGS', 'BLOCKED', 'REQUIRES_HUMAN_REVIEW'];
const CAPABILITIES: readonly CapabilityId[] = ['AI_BRAIN', 'IMAGE_ENGINE', 'VIDEO_ENGINE', 'VALIDATOR_ENGINE', 'STRUCTURED_PLANNING', 'VALIDATION', 'VIDEO_GENERATION', 'IMAGE_GENERATION', 'TEXT_TO_SPEECH', 'TRANSCRIPTION'];
const TASK_STATUSES: readonly ProviderTaskStatus[] = ['QUEUED', 'SUBMITTED', 'POLLING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'TIMED_OUT', 'RECONCILIATION_REQUIRED'];
const RETRY_DISPOSITIONS: readonly RetryDisposition[] = ['RETRYABLE', 'NON_RETRYABLE', 'RECONCILIATION_REQUIRED', 'CANCELED', 'TIMED_OUT'];
const RETRY_CODES: readonly RetryReasonCode[] = ['RATE_LIMITED', 'PROVIDER_UNAVAILABLE', 'NETWORK_ERROR', 'REQUEST_TIMEOUT', 'INVALID_REQUEST', 'UNSUPPORTED_CAPABILITY', 'AUTHENTICATION_FAILED', 'CONTENT_POLICY', 'UNKNOWN_PROVIDER_STATE', 'CANCELED_BY_USER'];
const ARTIFACT_KINDS: readonly GeneratedArtifactKind[] = ['IMAGE', 'VIDEO', 'AUDIO', 'TRANSCRIPT', 'TEXT'];
const QC_STATUSES: readonly QCStatus[] = ['PENDING', 'PASS', 'PASS_WITH_WARNINGS', 'FAIL', 'REQUIRES_HUMAN_REVIEW'];
const QC_CHECKS: readonly QCCheckName[] = ['CONTENT_SAFETY', 'MEDIA_INTEGRITY', 'CONTINUITY', 'AUDIO_ALIGNMENT', 'CAPTION_ACCURACY', 'TEXT_ACCURACY', 'REFERENCE_MATCH'];
const FEATURE_FLAG_KEYS: readonly FeatureFlagKey[] = ['generation.real_provider', 'generation.qc', 'generation.retry', 'capability.image_generation', 'capability.video_generation', 'capability.text_to_speech', 'capability.transcription', 'workflow.animated_comedy_2d', 'workflow.realistic_ai_skit', 'workflow.voiceover_story', 'workflow.ai_product_ad', 'workflow.faceless_explainer', 'workflow.short_film'];
const cameraSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['framing', 'movement', 'lens'],
    properties: { framing: { type: 'string' }, movement: { type: 'string' }, lens: { type: 'string' } },
};
const speakerItem = {
    type: 'object', additionalProperties: false,
    required: ['id', 'speakerLabel', 'characterId', 'startSeconds', 'endSeconds', 'text', 'confidence', 'reviewed'],
    properties: { id: { type: 'string', minLength: 1 }, speakerLabel: { type: 'string', minLength: 1 }, characterId: { anyOf: [{ type: 'string' }, { type: 'null' }] }, startSeconds: { type: 'number', minimum: 0 }, endSeconds: { type: 'number', minimum: 0 }, text: { type: 'string', minLength: 1 }, confidence: { anyOf: [{ type: 'number' }, { type: 'null' }] }, reviewed: { type: 'boolean' } },
};
const shotItem = {
    type: 'object', additionalProperties: false,
    required: ['sequenceId', 'sceneId', 'orderIndex', 'purpose', 'durationSeconds', 'dialogueSegmentIds', 'characterIds', 'locationIds', 'productIds', 'referencePackIds', 'camera', 'action', 'prompt', 'negativePrompt', 'providerCapability'],
        properties: { sequenceId: { type: 'string', minLength: 1 }, sceneId: { type: 'string', minLength: 1 }, orderIndex: { type: 'integer', minimum: 0 }, purpose: { type: 'string', minLength: 1 }, durationSeconds: { type: 'number', exclusiveMinimum: 0 }, dialogueSegmentIds: stringArray, characterIds: stringArray, locationIds: stringArray, productIds: stringArray, referencePackIds: stringArray, camera: cameraSchema, action: { type: 'string', minLength: 1 }, prompt: { type: 'string', minLength: 1 }, negativePrompt: { anyOf: [{ type: 'string' }, { type: 'null' }] }, providerCapability: { type: 'string', enum: CAPABILITIES } },
};

export const SPEAKER_SEGMENTS_SCHEMA: StructuredSchemaDefinition = {
    name: 'finalframe_speaker_segments',
    description: 'Timestamped speakers extracted from an optional performance.',
    strict: true,
    schema: { type: 'object', additionalProperties: false, required: ['segments'], properties: { segments: { type: 'array', items: speakerItem } } },
};

export const SHOT_SPEC_SCHEMA: StructuredSchemaDefinition = {
    name: 'finalframe_shot_specs',
    description: 'Ordered, independently generatable shot specifications.',
    strict: true,
    schema: {
        type: 'object', additionalProperties: false, required: ['shots'], properties: {
            shots: { type: 'array', minItems: 1, items: {
                type: 'object', additionalProperties: false,
                required: ['sequenceId', 'sceneId', 'orderIndex', 'purpose', 'durationSeconds', 'dialogueSegmentIds', 'characterIds', 'locationIds', 'productIds', 'referencePackIds', 'camera', 'action', 'prompt', 'providerCapability'],
                properties: shotItem.properties,
            } },
        },
    },
};

export const DIRECTOR_PLAN_SCHEMA: StructuredSchemaDefinition = {
    name: 'finalframe_director_plan',
    description: 'A strict executable FinalFrame plan with script, creative guide, risks, and shot-level work.',
    strict: true,
    schema: {
        type: 'object', additionalProperties: false,
        required: ['planVersion', 'intentSummary', 'preset', 'inputMode', 'language', 'platform', 'durationSeconds', 'aspectRatio', 'script', 'speakers', 'shots', 'creativeGuide', 'riskFlags', 'estimatedCredits', 'approvalStatus', 'currentStage', 'qualityGateStatus', 'qualityGates'],
        properties: {
            planVersion: { type: 'integer', minimum: 1 }, intentSummary: { type: 'string', minLength: 1 }, preset: { type: 'string', enum: PRESETS }, inputMode: { type: 'string', enum: INPUT_MODES }, language: { type: 'string', minLength: 1 }, platform: { type: 'string', minLength: 1 }, durationSeconds: { type: 'number', exclusiveMinimum: 0 }, aspectRatio: { type: 'string', minLength: 1 }, script: { type: 'string' }, speakers: { type: 'array', items: speakerItem }, shots: { type: 'array', minItems: 1, items: shotItem }, riskFlags: stringArray, estimatedCredits: { type: 'number', minimum: 0 }, approvalStatus: { type: 'string', enum: APPROVALS }, currentStage: { type: 'string', enum: STAGES }, qualityGateStatus: { type: 'string', enum: QUALITY_STATUSES }, qualityGates: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['status', 'evidence', 'continuityScore', 'audioAlignmentScore', 'captionAccuracyScore'], properties: { status: { type: 'string', enum: QUALITY_STATUSES }, evidence: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['rule', 'result', 'explanation'], properties: { rule: { type: 'string', minLength: 1 }, result: { type: 'string', enum: ['PASS', 'WARN', 'FAIL'] }, explanation: { type: 'string', minLength: 1 } } } }, continuityScore: { anyOf: [{ type: 'number', minimum: 0 }, { type: 'null' }] }, audioAlignmentScore: { anyOf: [{ type: 'number', minimum: 0 }, { type: 'null' }] }, captionAccuracyScore: { anyOf: [{ type: 'number', minimum: 0 }, { type: 'null' }] } } } },
            creativeGuide: { type: 'object', additionalProperties: false, required: ['visualStyle', 'palette', 'continuityRules', 'audioDirection', 'lighting', 'cameraLanguage', 'typography', 'culturalContext'], properties: { visualStyle: { type: 'string' }, palette: stringArray, continuityRules: stringArray, audioDirection: { type: 'string' }, lighting: { anyOf: [{ type: 'string' }, { type: 'null' }] }, cameraLanguage: { anyOf: [{ type: 'string' }, { type: 'null' }] }, typography: { anyOf: [{ type: 'string' }, { type: 'null' }] }, culturalContext: { anyOf: [{ type: 'string' }, { type: 'null' }] } } },
        },
    },
};

function isRecord(value: unknown): value is Record<string, any> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function fail(message: string, details?: unknown): never { throw new AICapabilityError({ code: 'INVALID_PROVIDER_RESPONSE', message, provider: 'openrouter', retryable: false, details }); }
function stringValue(value: unknown, field: string): string { if (typeof value !== 'string' || !value.trim()) fail(`${field} must be a non-empty string.`); return value.trim(); }
function numberValue(value: unknown, field: string, minimum = Number.NEGATIVE_INFINITY): number { if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) fail(`${field} must be a finite number >= ${minimum}.`); return value; }
function stringArrayValue(value: unknown, field: string): string[] { if (!Array.isArray(value)) fail(`${field} must be an array.`); return value.map((item, index) => stringValue(item, `${field}[${index}]`)); }
function optionalString(value: unknown, field: string): string | undefined { return value === undefined || value === null ? undefined : stringValue(value, field); }
function optionalNumber(value: unknown, field: string): number | undefined { return value === undefined || value === null ? undefined : numberValue(value, field, 0); }
function enumValue<T extends string>(value: unknown, field: string, allowed: readonly T[]): T { if (typeof value !== 'string' || !allowed.includes(value as T)) fail(`${field} must be one of: ${allowed.join(', ')}.`); return value as T; }

export function validateCreateIntent(input: CreateIntent): CreateIntent {
    if (!isRecord(input)) fail('Creation intent must be an object.');
    const inputMode = enumValue(input.inputMode, 'inputMode', INPUT_MODES);
    const preset = enumValue(input.preset, 'preset', PRESETS);
    const brief = typeof input.brief === 'string' ? input.brief.trim() : '';
    const script = optionalString(input.script, 'script');
    const inputAssetIds = stringArrayValue(input.inputAssetIds, 'inputAssetIds');
    const performanceAssetIds = input.performanceAssetIds === undefined ? undefined : stringArrayValue(input.performanceAssetIds, 'performanceAssetIds');
    const referenceAssetIds = input.referenceAssetIds === undefined ? undefined : stringArrayValue(input.referenceAssetIds, 'referenceAssetIds');
    const hasPerformance = Boolean(performanceAssetIds?.length) || inputAssetIds.length > 0;
    const hasReferences = Boolean(referenceAssetIds?.length) || inputAssetIds.length > 0;
    if (inputMode === 'IDEA' && !brief) fail('Idea-first creation requires a brief.');
    if (inputMode === 'SCRIPT' && !script) fail('Script-first creation requires a script.');
    if (inputMode === 'VOICE' && !hasPerformance) fail('Voice-first creation requires an audio or performance asset.');
    if (inputMode === 'CAST_REFERENCES' && !hasReferences) fail('Reference-first creation requires a reference asset.');
    if (inputMode === 'FOOTAGE' && inputAssetIds.length === 0) fail('Footage-first creation requires a footage asset.');
    if (inputMode === 'AD_BRIEF' && !brief) fail('An ad brief is required for product advertising.');
    if (inputMode === 'MIXED_MEDIA' && !brief && !script && !hasPerformance && !hasReferences) fail('Mixed-media creation requires an idea, script, recording, or reference asset.');
    return { ...input, preset, inputMode, brief, script, inputAssetIds, performanceAssetIds, referenceAssetIds, language: stringValue(input.language, 'language'), platform: stringValue(input.platform, 'platform'), aspectRatio: stringValue(input.aspectRatio, 'aspectRatio'), durationSeconds: numberValue(input.durationSeconds, 'durationSeconds', 0.1), qualityTier: enumValue(input.qualityTier, 'qualityTier', ['ECONOMY', 'STANDARD', 'PREMIUM'] as const) };
}

export function validateSpeakerSegments(value: unknown): SpeakerSegment[] {
    if (!isRecord(value) || !Array.isArray(value.segments)) fail('Speaker output must contain a segments array.', value);
    const ids = new Set<string>();
    return value.segments.map((item, index) => {
        if (!isRecord(item)) fail(`Speaker segment ${index + 1} is invalid.`);
        const id = stringValue(item.id, `segments[${index}].id`); if (ids.has(id)) fail(`Speaker segment id ${id} is duplicated.`); ids.add(id);
        const startSeconds = numberValue(item.startSeconds, `segments[${index}].startSeconds`, 0); const endSeconds = numberValue(item.endSeconds, `segments[${index}].endSeconds`, 0);
        if (endSeconds <= startSeconds) fail(`segments[${index}].endSeconds must be greater than startSeconds.`);
        const confidence = item.confidence == null ? undefined : numberValue(item.confidence, `segments[${index}].confidence`, 0);
        if (confidence !== undefined && confidence > 1) fail(`segments[${index}].confidence must be between 0 and 1.`);
        return { id, speakerLabel: stringValue(item.speakerLabel, `segments[${index}].speakerLabel`), characterId: typeof item.characterId === 'string' ? item.characterId : undefined, startSeconds, endSeconds, text: stringValue(item.text, `segments[${index}].text`), confidence, reviewed: item.reviewed === true };
    });
}

export function validateShotSpecs(value: unknown): ShotSpec[] {
    if (!isRecord(value) || !Array.isArray(value.shots) || value.shots.length === 0) fail('Shot output must contain at least one shot.', value);
    const orderKeys = new Set<string>();
    return value.shots.map((item, index) => {
        if (!isRecord(item)) fail(`Shot ${index + 1} is invalid.`);
        const sequenceId = stringValue(item.sequenceId, `shots[${index}].sequenceId`); const sceneId = stringValue(item.sceneId, `shots[${index}].sceneId`); const orderIndex = numberValue(item.orderIndex, `shots[${index}].orderIndex`, 0);
        if (!Number.isInteger(orderIndex)) fail(`shots[${index}].orderIndex must be an integer.`);
        const orderKey = `${sequenceId}:${sceneId}:${orderIndex}`; if (orderKeys.has(orderKey)) fail(`Duplicate shot order ${orderKey}.`); orderKeys.add(orderKey);
        if (!isRecord(item.camera)) fail(`shots[${index}].camera must be an object.`);
        return { sequenceId, sceneId, orderIndex, purpose: stringValue(item.purpose, `shots[${index}].purpose`), durationSeconds: numberValue(item.durationSeconds, `shots[${index}].durationSeconds`, 0.1), dialogueSegmentIds: stringArrayValue(item.dialogueSegmentIds, `shots[${index}].dialogueSegmentIds`), characterIds: stringArrayValue(item.characterIds, `shots[${index}].characterIds`), locationIds: stringArrayValue(item.locationIds, `shots[${index}].locationIds`), productIds: stringArrayValue(item.productIds, `shots[${index}].productIds`), referencePackIds: stringArrayValue(item.referencePackIds, `shots[${index}].referencePackIds`), camera: item.camera, action: stringValue(item.action, `shots[${index}].action`), prompt: stringValue(item.prompt, `shots[${index}].prompt`), negativePrompt: typeof item.negativePrompt === 'string' ? item.negativePrompt : undefined, providerCapability: stringValue(item.providerCapability, `shots[${index}].providerCapability`) as CapabilityId };
    });
}

export function validateDirectorPlan(value: unknown): DirectorPlan {
    if (!isRecord(value)) fail('Director plan must be an object.', value);
    const speakers = validateSpeakerSegments({ segments: value.speakers });
    const shots = validateShotSpecs({ shots: value.shots });
    if (!isRecord(value.creativeGuide)) fail('Director plan creativeGuide is required.');
    const guide = value.creativeGuide;
    const creativeGuide: CreativeGuide = { visualStyle: stringValue(guide.visualStyle, 'creativeGuide.visualStyle'), palette: stringArrayValue(guide.palette, 'creativeGuide.palette'), continuityRules: stringArrayValue(guide.continuityRules, 'creativeGuide.continuityRules'), audioDirection: stringValue(guide.audioDirection, 'creativeGuide.audioDirection'), lighting: optionalString(guide.lighting, 'creativeGuide.lighting'), cameraLanguage: optionalString(guide.cameraLanguage, 'creativeGuide.cameraLanguage'), typography: optionalString(guide.typography, 'creativeGuide.typography'), culturalContext: optionalString(guide.culturalContext, 'creativeGuide.culturalContext') };
    const qualityGates = Array.isArray(value.qualityGates) ? value.qualityGates as QualityGateResult[] : fail('qualityGates must be an array.');
    const planVersion = numberValue(value.planVersion, 'planVersion', 1);
    if (!Number.isInteger(planVersion)) fail('planVersion must be an integer.');
    const plan: DirectorPlan = { planVersion, intentSummary: stringValue(value.intentSummary, 'intentSummary'), preset: enumValue(value.preset, 'preset', PRESETS), inputMode: enumValue(value.inputMode, 'inputMode', INPUT_MODES), language: stringValue(value.language, 'language'), platform: stringValue(value.platform, 'platform'), durationSeconds: numberValue(value.durationSeconds, 'durationSeconds', 0.1), aspectRatio: stringValue(value.aspectRatio, 'aspectRatio'), script: typeof value.script === 'string' ? value.script : fail('script must be a string.'), speakers, shots, creativeGuide, riskFlags: stringArrayValue(value.riskFlags ?? [], 'riskFlags'), estimatedCredits: numberValue(value.estimatedCredits, 'estimatedCredits', 0), approvalStatus: enumValue(value.approvalStatus ?? 'DRAFT', 'approvalStatus', APPROVALS), currentStage: enumValue(value.currentStage ?? 'PLAN', 'currentStage', STAGES), qualityGateStatus: enumValue(value.qualityGateStatus ?? 'NOT_RUN', 'qualityGateStatus', QUALITY_STATUSES), qualityGates };
    try { return assertPlanQuality(plan); } catch (error) { fail(error instanceof Error ? error.message : 'Director plan quality validation failed.'); }
}

export const GENERATION_REQUEST_SCHEMA: StructuredSchemaDefinition = {
    name: 'finalframe_generation_request',
    description: 'Provider-neutral, idempotent request for one real generation task.',
    strict: true,
    schema: {
        type: 'object', additionalProperties: false,
        required: ['capability', 'prompt', 'parameters', 'idempotencyKey', 'productionId'],
        properties: {
            capability: { type: 'string', enum: CAPABILITIES }, prompt: { type: 'string', minLength: 1 }, model: { type: 'string' }, provider: { type: 'string' }, modality: { type: 'string' },
            references: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { url: { type: 'string' }, data: { type: 'string' }, mediaType: { type: 'string' } } } }, parameters: { type: 'object' }, idempotencyKey: { type: 'string', minLength: 8 }, productionId: { type: 'string', minLength: 1 }, shotId: { type: 'string' }, reservationId: { type: 'string' }, requestHash: { type: 'string' }, correlationId: { type: 'string' },
        },
    },
};

function validateReferences(value: unknown): ProviderReference[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) fail('references must be an array.');
    return value.map((item, index) => {
        if (!isRecord(item)) fail(`references[${index}] must be an object.`);
        const url = optionalString(item.url, `references[${index}].url`);
        const data = optionalString(item.data, `references[${index}].data`);
        if (!url && !data) fail(`references[${index}] must contain a url or data payload.`);
        return { url, data, mediaType: optionalString(item.mediaType, `references[${index}].mediaType`) };
    });
}

export function validateGenerationRequest(value: unknown): GenerationRequest {
    if (!isRecord(value)) fail('Generation request must be an object.');
    const request: GenerationRequest = {
        capability: enumValue(value.capability, 'capability', CAPABILITIES), prompt: stringValue(value.prompt, 'prompt'), model: optionalString(value.model, 'model'), provider: optionalString(value.provider, 'provider') as AIProvider | undefined,
        modality: optionalString(value.modality, 'modality') as Modality | undefined, references: validateReferences(value.references), parameters: isRecord(value.parameters) ? value.parameters : fail('parameters must be an object.'), idempotencyKey: stringValue(value.idempotencyKey, 'idempotencyKey'), productionId: stringValue(value.productionId, 'productionId'), shotId: optionalString(value.shotId, 'shotId'), reservationId: optionalString(value.reservationId, 'reservationId'), requestHash: optionalString(value.requestHash, 'requestHash'), correlationId: optionalString(value.correlationId, 'correlationId'),
    };
    if (request.idempotencyKey.length < 8) fail('idempotencyKey must contain at least 8 characters.');
    return request;
}

export function validateRetryClassification(value: unknown): RetryClassification {
    if (!isRecord(value)) fail('Retry classification must be an object.');
    return { disposition: enumValue(value.disposition, 'retry.disposition', RETRY_DISPOSITIONS), reasonCode: enumValue(value.reasonCode, 'retry.reasonCode', RETRY_CODES), retryable: value.retryable === true, reason: stringValue(value.reason, 'retry.reason'), attempt: numberValue(value.attempt, 'retry.attempt', 1), maxAttempts: numberValue(value.maxAttempts, 'retry.maxAttempts', 1), retryAfterSeconds: optionalNumber(value.retryAfterSeconds, 'retry.retryAfterSeconds') };
}

function validateNormalizedOutput(value: unknown): NormalizedGenerationOutput {
    if (!isRecord(value)) fail('Normalized generation output must be an object.');
    const remoteUrl = optionalString(value.remoteUrl, 'output.remoteUrl');
    const inlineData = optionalString(value.inlineData, 'output.inlineData');
    if (!remoteUrl && !inlineData) fail('Output must contain a remoteUrl or inlineData payload.');
    return { outputId: stringValue(value.outputId, 'output.outputId'), kind: enumValue(value.kind, 'output.kind', ARTIFACT_KINDS), provider: stringValue(value.provider, 'output.provider') as AIProvider, model: stringValue(value.model, 'output.model'), providerTaskId: stringValue(value.providerTaskId, 'output.providerTaskId'), contentType: stringValue(value.contentType, 'output.contentType'), remoteUrl, inlineData, checksum: optionalString(value.checksum, 'output.checksum'), byteSize: optionalNumber(value.byteSize, 'output.byteSize'), width: optionalNumber(value.width, 'output.width'), height: optionalNumber(value.height, 'output.height'), durationSeconds: optionalNumber(value.durationSeconds, 'output.durationSeconds'), frameRate: optionalNumber(value.frameRate, 'output.frameRate'), usage: value.usage as NormalizedGenerationOutput['usage'], metadata: isRecord(value.metadata) ? value.metadata : fail('output.metadata must be an object.') };
}

function validateQCCheck(value: unknown, index: number): QCCheckResult {
    if (!isRecord(value)) fail(`qc.checks[${index}] must be an object.`);
    return { check: enumValue(value.check, `qc.checks[${index}].check`, QC_CHECKS), status: enumValue(value.status, `qc.checks[${index}].status`, QC_STATUSES), score: optionalNumber(value.score, `qc.checks[${index}].score`), explanation: stringValue(value.explanation, `qc.checks[${index}].explanation`), evidence: value.evidence === undefined ? undefined : stringArrayValue(value.evidence, `qc.checks[${index}].evidence`) };
}

export function validateQCResult(value: unknown): QCResult {
    if (!isRecord(value) || !Array.isArray(value.checks)) fail('QC result must contain checks.');
    return { status: enumValue(value.status, 'qc.status', QC_STATUSES), checks: value.checks.map(validateQCCheck), qualityVersion: stringValue(value.qualityVersion, 'qc.qualityVersion'), checkedAt: stringValue(value.checkedAt, 'qc.checkedAt'), blockingReasons: stringArrayValue(value.blockingReasons, 'qc.blockingReasons') };
}

export function validateProviderTask(value: unknown): ProviderTask {
    if (!isRecord(value)) fail('Provider task must be an object.');
    const output = value.output === undefined ? undefined : validateNormalizedOutput(value.output);
    const qc = value.qc === undefined ? undefined : validateQCResult(value.qc);
    const retry = value.retry === undefined ? undefined : validateRetryClassification(value.retry);
    return { taskId: stringValue(value.taskId, 'taskId'), provider: stringValue(value.provider, 'provider') as AIProvider, providerTaskId: stringValue(value.providerTaskId, 'providerTaskId'), capability: enumValue(value.capability, 'capability', CAPABILITIES), status: enumValue(value.status, 'status', TASK_STATUSES), idempotencyKey: stringValue(value.idempotencyKey, 'idempotencyKey'), requestHash: stringValue(value.requestHash, 'requestHash'), attempt: numberValue(value.attempt, 'attempt', 1), maxAttempts: numberValue(value.maxAttempts, 'maxAttempts', 1), createdAt: stringValue(value.createdAt, 'createdAt'), updatedAt: stringValue(value.updatedAt, 'updatedAt'), nextPollAt: optionalString(value.nextPollAt, 'nextPollAt'), submittedAt: optionalString(value.submittedAt, 'submittedAt'), completedAt: optionalString(value.completedAt, 'completedAt'), retry, output, qc, error: value.error as ProviderTask['error'] };
}

export function validateFeatureFlag(value: unknown): FeatureFlag {
    if (!isRecord(value)) fail('Feature flag must be an object.');
    const rolloutPercent = optionalNumber(value.rolloutPercent, 'flag.rolloutPercent');
    if (rolloutPercent !== undefined && rolloutPercent > 100) fail('flag.rolloutPercent must be at most 100.');
    return { key: enumValue(value.key, 'flag.key', FEATURE_FLAG_KEYS), state: enumValue(value.state, 'flag.state', ['DISABLED', 'INTERNAL', 'BETA', 'ENABLED'] as const), reason: optionalString(value.reason, 'flag.reason'), rolloutPercent, updatedAt: stringValue(value.updatedAt, 'flag.updatedAt'), expiresAt: optionalString(value.expiresAt, 'flag.expiresAt') };
}

export function validateFeatureFlagSet(value: unknown): FeatureFlagSet {
    if (!isRecord(value)) fail('Feature flag set must be an object.');
    const result: FeatureFlagSet = {};
    for (const [key, flag] of Object.entries(value)) {
        if (!FEATURE_FLAG_KEYS.includes(key as FeatureFlagKey)) fail(`Unknown feature flag: ${key}.`);
        const normalized = validateFeatureFlag({ ...(isRecord(flag) ? flag : {}), key });
        result[normalized.key] = normalized;
    }
    return result;
}
