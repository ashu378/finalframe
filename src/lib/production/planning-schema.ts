/**
 * Structured output contract for the production form.
 *
 * The production form stores the sequence/scene/shot plan used by the
 * Convex production mutations. Keep this contract separate from the newer
 * shot-only AI planning contract until both persistence paths are migrated.
 */

const stringList = { type: 'array', items: { type: 'string' } };

const camera = {
    type: 'object',
    additionalProperties: false,
    required: ['angle', 'movement', 'lens'],
    properties: {
        angle: { type: 'string' },
        movement: { type: 'string' },
        lens: { type: 'string' },
    },
};

const shot = {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'prompt', 'durationSeconds', 'orderIndex', 'requiredAssetIds', 'camera'],
    properties: {
        title: { type: 'string', minLength: 1 },
        prompt: { type: 'string', minLength: 1 },
        durationSeconds: { type: 'number', exclusiveMinimum: 0 },
        orderIndex: { type: 'integer', minimum: 0 },
        requiredAssetIds: stringList,
        camera,
    },
};

const scene = {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'purpose', 'visualDirection', 'orderIndex', 'shots'],
    properties: {
        title: { type: 'string', minLength: 1 },
        purpose: { type: 'string', minLength: 1 },
        visualDirection: { type: 'string', minLength: 1 },
        orderIndex: { type: 'integer', minimum: 0 },
        shots: { type: 'array', minItems: 1, items: shot },
    },
};

const entity = {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'description'],
    properties: {
        name: { type: 'string', minLength: 1 },
        description: { type: 'string', minLength: 1 },
    },
};

const projectContext = {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'duration', 'language'],
    properties: {
        title: { type: 'string', minLength: 1 },
        duration: { type: 'number', exclusiveMinimum: 0 },
        language: { type: 'string', minLength: 1 },
    },
};

const style = {
    type: 'object',
    additionalProperties: false,
    required: ['visualStyle', 'tone', 'pace', 'palette', 'lighting', 'camera', 'notes', 'colors'],
    properties: {
        visualStyle: { type: 'string', minLength: 1 },
        tone: { type: 'string', minLength: 1 },
        pace: { type: 'string', minLength: 1 },
        palette: { type: 'string', minLength: 1 },
        lighting: { type: 'string', minLength: 1 },
        camera: { type: 'string', minLength: 1 },
        notes: stringList,
        colors: stringList,
    },
};

const story = {
    type: 'object',
    additionalProperties: false,
    required: ['premise', 'script', 'dialogue', 'narration', 'tone'],
    properties: {
        premise: { type: 'string' },
        script: { type: 'string' },
        dialogue: { type: 'string' },
        narration: { type: 'string' },
        tone: { type: 'string' },
    },
};

export const LEGACY_DIRECTOR_PLAN_SCHEMA = {
    name: 'finalframe_production_plan',
    description: 'An executable FinalFrame sequence, scene, and shot production plan.',
    strict: true,
    schema: {
        type: 'object',
        additionalProperties: false,
        required: ['summary', 'assumptions', 'questions', 'workflow', 'bible', 'sequences', 'operations'],
        properties: {
            summary: { type: 'string', minLength: 1 },
            assumptions: stringList,
            questions: stringList,
            workflow: { type: 'string', enum: ['SOCIAL', 'COMEDY', 'BUSINESS_AD', 'FOOTAGE_TRANSFORM'] },
            bible: {
                type: 'object',
                additionalProperties: false,
                required: ['projectContext', 'characters', 'locations', 'products', 'style', 'story'],
                properties: {
                    projectContext,
                    characters: { type: 'array', items: entity },
                    locations: { type: 'array', items: entity },
                    products: { type: 'array', items: entity },
                    style,
                    story,
                },
            },
            sequences: {
                type: 'array',
                minItems: 1,
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['title', 'description', 'orderIndex', 'scenes'],
                    properties: {
                        title: { type: 'string', minLength: 1 },
                        description: { type: 'string', minLength: 1 },
                        orderIndex: { type: 'integer', minimum: 0 },
                        scenes: { type: 'array', minItems: 1, items: scene },
                    },
                },
            },
            operations: {
                type: 'array',
                minItems: 1,
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['operation', 'quantity', 'unit', 'qualityTier'],
                    properties: {
                        operation: { type: 'string', minLength: 1 },
                        quantity: { type: 'number', exclusiveMinimum: 0 },
                        unit: { type: 'string', minLength: 1 },
                        qualityTier: { type: 'string', enum: ['ECONOMY', 'STANDARD', 'PREMIUM'] },
                    },
                },
            },
        },
    },
};
