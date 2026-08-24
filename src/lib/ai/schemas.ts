import { AICapabilityError, type CapabilityId, type CreateIntent, type DirectorPlan, type ShotSpec, type SpeakerSegment } from './types';

export interface StructuredSchemaDefinition {
    name: string;
    schema: Record<string, unknown>;
    strict: true;
    description: string;
}

const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const nullableNumber = { anyOf: [{ type: 'number' }, { type: 'null' }] };
const stringArray = { type: 'array', items: { type: 'string' } };

const cameraSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['framing', 'movement', 'lens'],
    properties: {
        framing: { type: 'string' },
        movement: { type: 'string' },
        lens: { type: 'string' },
    },
};

export const SPEAKER_SEGMENTS_SCHEMA: StructuredSchemaDefinition = {
    name: 'finalframe_speaker_segments',
    description: 'Timestamped speakers extracted from an optional user performance.',
    strict: true,
    schema: {
        type: 'object',
        additionalProperties: false,
        required: ['segments'],
        properties: {
            segments: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['id', 'speakerLabel', 'characterId', 'startSeconds', 'endSeconds', 'text', 'confidence', 'reviewed'],
                    properties: {
                        id: { type: 'string', minLength: 1 },
                        speakerLabel: { type: 'string', minLength: 1 },
                        characterId: nullableString,
                        startSeconds: { type: 'number', minimum: 0 },
                        endSeconds: { type: 'number', minimum: 0 },
                        text: { type: 'string', minLength: 1 },
                        confidence: nullableNumber,
                        reviewed: { type: 'boolean' },
                    },
                },
            },
        },
    },
};

export const SHOT_SPEC_SCHEMA: StructuredSchemaDefinition = {
    name: 'finalframe_shot_specs',
    description: 'Ordered, executable shot specifications for independent generation.',
    strict: true,
    schema: {
        type: 'object',
        additionalProperties: false,
        required: ['shots'],
        properties: {
            shots: {
                type: 'array',
                minItems: 1,
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['sequenceId', 'sceneId', 'orderIndex', 'purpose', 'durationSeconds', 'dialogueSegmentIds', 'characterIds', 'locationIds', 'productIds', 'referencePackIds', 'camera', 'action', 'prompt', 'negativePrompt', 'providerCapability'],
                    properties: {
                        sequenceId: { type: 'string', minLength: 1 },
                        sceneId: { type: 'string', minLength: 1 },
                        orderIndex: { type: 'integer', minimum: 0 },
                        purpose: { type: 'string', minLength: 1 },
                        durationSeconds: { type: 'number', exclusiveMinimum: 0 },
                        dialogueSegmentIds: stringArray,
                        characterIds: stringArray,
                        locationIds: stringArray,
                        productIds: stringArray,
                        referencePackIds: stringArray,
                        camera: cameraSchema,
                        action: { type: 'string', minLength: 1 },
                        prompt: { type: 'string', minLength: 1 },
                        negativePrompt: nullableString,
                        providerCapability: { type: 'string', enum: ['IMAGE_GENERATION', 'VIDEO_GENERATION', 'TEXT_TO_SPEECH', 'TRANSCRIPTION'] },
                    },
                },
            },
        },
    },
};

export const DIRECTOR_PLAN_SCHEMA: StructuredSchemaDefinition = {
    name: 'finalframe_director_plan',
    description: 'A strict, executable FinalFrame plan with optional voice timing and shot-level work.',
    strict: true,
    schema: {
        type: 'object',
        additionalProperties: false,
        required: ['intentSummary', 'preset', 'language', 'platform', 'durationSeconds', 'aspectRatio', 'script', 'speakers', 'shots', 'creativeGuide', 'riskFlags', 'estimatedCredits'],
        properties: {
            intentSummary: { type: 'string', minLength: 1 },
            preset: { type: 'string', enum: ['2D_ANIMATION', 'REALISTIC_SKIT', 'VOICEOVER_STORY', 'PRODUCT_AD', 'FACELESS_EXPLAINER', 'SHORT_FILM'] },
            language: { type: 'string', minLength: 1 },
            platform: { type: 'string', minLength: 1 },
            durationSeconds: { type: 'number', exclusiveMinimum: 0 },
            aspectRatio: { type: 'string', minLength: 1 },
            script: { type: 'string' },
            speakers: { ...((SPEAKER_SEGMENTS_SCHEMA.schema.properties as Record<string, unknown>).segments as Record<string, unknown>) },
            shots: { ...((SHOT_SPEC_SCHEMA.schema.properties as Record<string, unknown>).shots as Record<string, unknown>) },
            creativeGuide: {
                type: 'object',
                additionalProperties: false,
                required: ['visualStyle', 'palette', 'continuityRules', 'audioDirection'],
                properties: {
                    visualStyle: { type: 'string', minLength: 1 },
                    palette: stringArray,
                    continuityRules: stringArray,
                    audioDirection: { type: 'string', minLength: 1 },
                },
            },
            riskFlags: stringArray,
            estimatedCredits: { type: 'number', minimum: 0 },
        },
    },
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(message: string, details?: unknown): never {
    throw new AICapabilityError({
        code: 'INVALID_PROVIDER_RESPONSE',
        message,
        provider: 'openrouter',
        retryable: false,
        details,
    });
}

function stringValue(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) fail(`${field} must be a non-empty string.`);
    return value.trim();
}

function numberValue(value: unknown, field: string, minimum = Number.NEGATIVE_INFINITY): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) fail(`${field} must be a finite number >= ${minimum}.`);
    return value;
}

function stringArrayValue(value: unknown, field: string): string[] {
    if (!Array.isArray(value)) fail(`${field} must be an array.`);
    return value.map((item, index) => stringValue(item, `${field}[${index}]`));
}

function nullableStringValue(value: unknown, field: string): string | null {
    if (value === null) return null;
    return stringValue(value, field);
}

function nullableNumberValue(value: unknown, field: string): number | null {
    if (value === null) return null;
    return numberValue(value, field, 0);
}

export function validateCreateIntent(input: CreateIntent): CreateIntent {
    if (!isRecord(input)) fail('Creation intent must be an object.');
    if (input.brief !== undefined) stringValue(input.brief, 'brief');
    stringValue(input.language, 'language');
    stringValue(input.platform, 'platform');
    stringValue(input.aspectRatio, 'aspectRatio');
    numberValue(input.durationSeconds, 'durationSeconds', 0.1);
    if (!Array.isArray(input.inputAssetIds) || input.inputAssetIds.some((id) => typeof id !== 'string' || !id.trim())) fail('inputAssetIds must contain only non-empty strings.');
    if (input.inputMode === 'SCRIPT' && !input.script?.trim()) fail('Script-first creation requires a script.');
    if (input.inputMode === 'VOICE' && input.inputAssetIds.length === 0) fail('Voice-first creation requires an audio asset.');
    if (input.inputMode === 'MIXED_MEDIA' && input.inputAssetIds.length === 0 && !input.script?.trim()) fail('Mixed-media creation requires at least one asset or script.');
    if (input.inputMode === 'IDEA' && !input.brief?.trim()) fail('Idea-first creation requires a brief.');
    return input;
}

export function validateSpeakerSegments(value: unknown): SpeakerSegment[] {
    if (!isRecord(value) || !Array.isArray(value.segments)) fail('Speaker output must contain a segments array.', value);
    const ids = new Set<string>();
    return value.segments.map((item, index) => {
        if (!isRecord(item)) fail(`Speaker segment ${index + 1} is invalid.`);
        const id = stringValue(item.id, `segments[${index}].id`);
        if (ids.has(id)) fail(`Speaker segment id ${id} is duplicated.`);
        ids.add(id);
        const startSeconds = numberValue(item.startSeconds, `segments[${index}].startSeconds`, 0);
        const endSeconds = numberValue(item.endSeconds, `segments[${index}].endSeconds`, 0);
        if (endSeconds <= startSeconds) fail(`segments[${index}].endSeconds must be greater than startSeconds.`);
        const confidence = nullableNumberValue(item.confidence, `segments[${index}].confidence`);
        if (confidence !== null && confidence > 1) fail(`segments[${index}].confidence must be between 0 and 1.`);
        return {
            id,
            speakerLabel: stringValue(item.speakerLabel, `segments[${index}].speakerLabel`),
            characterId: nullableStringValue(item.characterId, `segments[${index}].characterId`),
            startSeconds,
            endSeconds,
            text: stringValue(item.text, `segments[${index}].text`),
            confidence,
            reviewed: item.reviewed === true,
        };
    });
}

export function validateShotSpecs(value: unknown): ShotSpec[] {
    if (!isRecord(value) || !Array.isArray(value.shots) || value.shots.length === 0) fail('Shot output must contain at least one shot.', value);
    const orderKeys = new Set<string>();
    return value.shots.map((item, index) => {
        if (!isRecord(item)) fail(`Shot ${index + 1} is invalid.`);
        const sequenceId = stringValue(item.sequenceId, `shots[${index}].sequenceId`);
        const sceneId = stringValue(item.sceneId, `shots[${index}].sceneId`);
        const orderIndex = numberValue(item.orderIndex, `shots[${index}].orderIndex`, 0);
        if (!Number.isInteger(orderIndex)) fail(`shots[${index}].orderIndex must be an integer.`);
        const orderKey = `${sequenceId}:${sceneId}:${orderIndex}`;
        if (orderKeys.has(orderKey)) fail(`Duplicate shot order ${orderKey}.`);
        orderKeys.add(orderKey);
        const camera = item.camera;
        if (!isRecord(camera)) fail(`shots[${index}].camera must be an object.`);
        return {
            sequenceId,
            sceneId,
            orderIndex,
            purpose: stringValue(item.purpose, `shots[${index}].purpose`),
            durationSeconds: numberValue(item.durationSeconds, `shots[${index}].durationSeconds`, 0.1),
            dialogueSegmentIds: stringArrayValue(item.dialogueSegmentIds, `shots[${index}].dialogueSegmentIds`),
            characterIds: stringArrayValue(item.characterIds, `shots[${index}].characterIds`),
            locationIds: stringArrayValue(item.locationIds, `shots[${index}].locationIds`),
            productIds: stringArrayValue(item.productIds, `shots[${index}].productIds`),
            referencePackIds: stringArrayValue(item.referencePackIds, `shots[${index}].referencePackIds`),
            camera,
            action: stringValue(item.action, `shots[${index}].action`),
            prompt: stringValue(item.prompt, `shots[${index}].prompt`),
            negativePrompt: nullableStringValue(item.negativePrompt, `shots[${index}].negativePrompt`),
            providerCapability: stringValue(item.providerCapability, `shots[${index}].providerCapability`) as CapabilityId,
        };
    });
}

export function validateDirectorPlan(value: unknown): DirectorPlan {
    if (!isRecord(value)) fail('Director plan must be an object.', value);
    const speakers = validateSpeakerSegments({ segments: value.speakers });
    const shots = validateShotSpecs({ shots: value.shots });
    if (!isRecord(value.creativeGuide)) fail('Director plan creativeGuide is required.');
    const creativeGuide = {
        visualStyle: stringValue(value.creativeGuide.visualStyle, 'creativeGuide.visualStyle'),
        palette: stringArrayValue(value.creativeGuide.palette, 'creativeGuide.palette'),
        continuityRules: stringArrayValue(value.creativeGuide.continuityRules, 'creativeGuide.continuityRules'),
        audioDirection: stringValue(value.creativeGuide.audioDirection, 'creativeGuide.audioDirection'),
    };
    return {
        intentSummary: stringValue(value.intentSummary, 'intentSummary'),
        preset: stringValue(value.preset, 'preset') as DirectorPlan['preset'],
        language: stringValue(value.language, 'language'),
        platform: stringValue(value.platform, 'platform'),
        durationSeconds: numberValue(value.durationSeconds, 'durationSeconds', 0.1),
        aspectRatio: stringValue(value.aspectRatio, 'aspectRatio'),
        script: typeof value.script === 'string' ? value.script : fail('script must be a string.'),
        speakers,
        shots,
        creativeGuide,
        riskFlags: stringArrayValue(value.riskFlags, 'riskFlags'),
        estimatedCredits: numberValue(value.estimatedCredits, 'estimatedCredits', 0),
    };
}
