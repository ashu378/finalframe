/** Reviewed graphic copy is structured data, never inferred from prose at execution. */
export interface PlannedGraphicCard {
    narrationText?: string;
    templateId: 'kinetic-title' | 'brand-card' | 'feature-callout' | 'end-card';
    durationSeconds: number;
    title: string;
    subtitle: string;
    brandName: string;
    callToAction: string;
    accentColor: string;
    backgroundColor: string;
    textColor: string;
}
export const PLANNED_GRAPHICS_SCHEMA = {
    type: 'array', maxItems: 16, items: {
        type: 'object', additionalProperties: false,
        required: ['templateId', 'durationSeconds', 'title', 'subtitle', 'brandName', 'callToAction', 'accentColor', 'backgroundColor', 'textColor'],
        properties: {
            narrationText: { type: 'string', maxLength: 1024 },
            templateId: { type: 'string', enum: ['kinetic-title', 'brand-card', 'feature-callout', 'end-card'] },
            durationSeconds: { type: 'number', minimum: 1, maximum: 60 },
            title: { type: 'string', minLength: 1, maxLength: 200 },
            subtitle: { type: 'string', maxLength: 500 }, brandName: { type: 'string', maxLength: 160 }, callToAction: { type: 'string', maxLength: 500 },
            accentColor: { type: 'string', pattern: '^#[a-fA-F0-9]{6}$' },
            backgroundColor: { type: 'string', pattern: '^#[a-fA-F0-9]{6}$' },
            textColor: { type: 'string', pattern: '^#[a-fA-F0-9]{6}$' },
        },
    },
};
export function parsePlannedGraphics(value: unknown, expectedSeconds?: number): PlannedGraphicCard[] {
    if (value === undefined) return []; // Historical plans remain readable.
    if (!Array.isArray(value) || value.length > 16) throw Error('PLANNED_GRAPHICS_INVALID');
    const cards = value.map(card => {
        if (!card || typeof card !== 'object' || Array.isArray(card) || Object.keys(card).some(key => !Object.prototype.hasOwnProperty.call(PLANNED_GRAPHICS_SCHEMA.items.properties,key))) throw Error('PLANNED_GRAPHICS_INVALID');
        if (!PLANNED_GRAPHICS_SCHEMA.items.properties.templateId.enum.includes(card.templateId) || !Number.isFinite(card.durationSeconds) || card.durationSeconds < 1 || card.durationSeconds > 60) throw Error('PLANNED_GRAPHICS_INVALID');
        for (const [key, max] of [['title', 200], ['subtitle', 500], ['brandName', 160], ['callToAction', 500]] as const) {
            if (typeof card[key] !== 'string' || card[key].length > max || key === 'title' && !card[key].trim()) throw Error('PLANNED_GRAPHICS_INVALID');
        }
        if (card.narrationText !== undefined && (typeof card.narrationText !== 'string' || card.narrationText.length > 1024)) throw Error('PLANNED_GRAPHICS_INVALID');
        for (const key of ['accentColor', 'backgroundColor', 'textColor']) if (typeof card[key] !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(card[key])) throw Error('PLANNED_GRAPHICS_INVALID');
        return { ...card } as PlannedGraphicCard;
    });
    const total = cards.reduce((sum, card) => sum + card.durationSeconds, 0);
    if (total > 60 || cards.length && expectedSeconds !== undefined && Math.abs(total - expectedSeconds) > 0.001) throw Error('PLANNED_GRAPHICS_DURATION');
    return cards;
}

/** An explicit plan contract, not a guess from the presence of an end card. */
export type VisualProductionMode = 'GRAPHICS_ONLY' | 'FOOTAGE';
export function plannedVisualMode(plan: unknown): VisualProductionMode | undefined {
    const value = (plan as { visualProductionMode?: unknown } | null)?.visualProductionMode;
    if (value !== undefined && value !== 'GRAPHICS_ONLY' && value !== 'FOOTAGE') throw Error('PLANNED_VISUAL_MODE_INVALID');
    return value;
}
export function validateGraphicsOnlyPlan(plan: unknown, expectedSeconds?: number): boolean {
    if (plannedVisualMode(plan) !== 'GRAPHICS_ONLY') return false;
    const value = plan as { graphicCards?: unknown; sequences?: Array<{ scenes?: Array<{ shots?: Array<Record<string, any>> }> }> };
    if (!parsePlannedGraphics(value.graphicCards, expectedSeconds).length) throw Error('PLANNED_GRAPHICS_REQUIRED');
    const shots = value.sequences?.flatMap(sequence => sequence.scenes?.flatMap(scene => scene.shots ?? []) ?? []) ?? [];
    if (!shots.length) throw Error('PLANNED_GRAPHICS_SHOTS_REQUIRED');
    for (const shot of shots) {
        const controls = { ...(shot.metadata ?? {}), ...shot };
        if (['requiredAssetIds', 'referenceAssetIds', 'resourceBindings', 'resourceVersionIds', 'dialogueSegments', 'storyActions', 'recipeReferenceSlots'].some(key => controls[key]?.length)
            || ['firstFrameAssetId', 'lastFrameAssetId', 'requiresFirstFrame', 'requiresLastFrame', 'requiresMask', 'maskAssetId', 'sourceAssetId', 'previousJobId', 'generateAudio', 'requiresSourceAudioPreservation'].some(key => controls[key])
            || ![undefined, 'GENERATE'].includes(controls.operation) || ![undefined, 'GENERATE'].includes(controls.videoTask)
            || ![undefined, 'SILENT'].includes(controls.audioPolicy)) throw Error('PLANNED_GRAPHICS_FOOTAGE_CONFLICT');
    }
    return true;
}
