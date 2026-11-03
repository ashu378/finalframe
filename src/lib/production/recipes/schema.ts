import { RECIPE_LIMITS, RECIPE_VIDEO_TYPES, type RecipeDocument } from './contract';
type Schema = { type?: string; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: false; items?: Schema; oneOf?: Schema[]; enum?: readonly unknown[]; const?: unknown; minLength?: number; maxLength?: number; pattern?: string; minimum?: number; maximum?: number; maxItems?: number; minItems?: number };
const text = (maxLength = 4000): Schema => ({ type: 'string', minLength: 1, maxLength });
const id: Schema = { ...text(200), pattern: '^[A-Za-z0-9:._-]+$' };
const key: Schema = { ...text(64), pattern: '^[A-Za-z][A-Za-z0-9_-]*$' };
const hash: Schema = { ...text(64), pattern: '^[a-f0-9]{64}$' };
const frameOffset: Schema = { type: 'integer', minimum: 0, maximum: 2160000 };
const integer = (minimum = 0): Schema => ({ type: 'integer', minimum, maximum: 3600 });
const object = (properties: Record<string, Schema>, optional: string[] = []): Schema => ({ type: 'object', properties, required: Object.keys(properties).filter(name => !optional.includes(name)), additionalProperties: false });
const step = (operation: string, fields: Record<string, Schema>, optional: string[] = []) => object({ key, operation: { const: operation }, ...fields }, optional);
export const RECIPE_DOCUMENT_SCHEMA = {
  ...object({ kind: { const: 'finalframe.recipe' }, version: { const: 1 }, videoType: { enum: RECIPE_VIDEO_TYPES }, binding: object({ projectId: id, productionId: id, productionVersionId: id, snapshotHash: hash, continuityBibleId: id, continuityHash: hash }, ['continuityBibleId', 'continuityHash']), fps: { enum: [24, 25, 30, 50, 60] },
    steps: { type: 'array', minItems: 1, maxItems: RECIPE_LIMITS.maxSteps, items: { oneOf: [
      step('PREPARATION', { kind: { enum: ['CHARACTER_REFERENCE', 'TRANSCRIPT'] }, text: { type: 'string', maxLength: 4000 }, sourceAssetId: id, sourceStepKey: key }, ['sourceAssetId', 'sourceStepKey']),
      step('NARRATION', { mode: { const: 'GENERATE' }, text: text(), voiceId: id, primaryVoiceSampleAssetId: id }, ['primaryVoiceSampleAssetId']),
      step('NARRATION', { mode: { const: 'RECORDING' }, sourceAssetId: id, startFrame: frameOffset, durationFrames: integer(1) }),
      step('GENERATION', { shotId: id, references: { type: 'array', maxItems: 20, items: { oneOf: [object({ assetId: id }), object({ stepKey: key })] } } }),
      step('GRAPHIC', { templateId: { enum: ['kinetic-title', 'brand-card', 'feature-callout', 'end-card'] }, durationFrames: integer(1), title: text(200), subtitle: { type: 'string', maxLength: 500 }, brandName: { type: 'string', maxLength: 160 }, eyebrow:text(500),feature:text(2000),detail:text(2000),index:text(100),callToAction:text(500),url:text(500),accentColor:{type:'string',pattern:'^#[a-fA-F0-9]{6}$'},backgroundColor:{type:'string',pattern:'^#[a-fA-F0-9]{6}$'},textColor:{type:'string',pattern:'^#[a-fA-F0-9]{6}$'}, logoAssetId: id }, ['logoAssetId','eyebrow','feature','detail','index','callToAction','url','accentColor','backgroundColor','textColor']),
      step('SOURCE_RANGE', { sourceAssetId: id, startFrame: frameOffset, durationFrames: integer(1), audioPolicy: { enum: ['KEEP_SOURCE', 'MUTE'] }, fit: { enum: ['contain', 'cover'] } }, ['fit']),
      step('MUSIC_ANALYSIS', { sourceAssetId: id, trimStartFrame: frameOffset, durationFrames: integer(1) }),
      step('CAPTIONS', { transcriptStepKey: key, language: text(35) }),
    ] } }, visualOrder: { type: 'array', minItems: 1, maxItems: RECIPE_LIMITS.maxSteps, items: key }, narrationStepKey: key, musicStepKey: key, captionStepKey: key }, ['narrationStepKey', 'musicStepKey', 'captionStepKey']),
} satisfies Schema;
function matches(value: unknown, schema: Schema): boolean {
  if (schema.oneOf) return schema.oneOf.filter(candidate => matches(value, candidate)).length === 1;
  if ('const' in schema && value !== schema.const || schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type === 'string') return typeof value === 'string' && value.length >= (schema.minLength ?? 0) && value.length <= (schema.maxLength ?? Infinity) && (!schema.pattern || new RegExp(schema.pattern).test(value));
  if (schema.type === 'integer') return typeof value === 'number' && Number.isSafeInteger(value) && value >= (schema.minimum ?? -Infinity) && value <= (schema.maximum ?? Infinity);
  if (schema.type === 'array') return Array.isArray(value) && value.length >= (schema.minItems ?? 0) && value.length <= (schema.maxItems ?? Infinity) && value.every(item => !schema.items || matches(item, schema.items));
  if (schema.type === 'object') { if (!value || typeof value !== 'object' || Array.isArray(value)) return false; const row = value as Record<string, unknown>; return !(schema.required ?? []).some(name => !Object.prototype.hasOwnProperty.call(row, name)) && Object.keys(row).every(name => !!schema.properties && Object.prototype.hasOwnProperty.call(schema.properties, name) && matches(row[name], schema.properties[name])); }
  return true;
}
export function parseRecipeDocument(value: unknown): RecipeDocument {
  let serialized: string; try { serialized = JSON.stringify(value); } catch { throw new Error('Recipe must be bounded JSON.'); }
  if (typeof serialized !== 'string' || new TextEncoder().encode(serialized).length > RECIPE_LIMITS.maxBytes) throw new Error('Recipe does not satisfy version 1 bounded schema.');
  const snapshot: unknown = JSON.parse(serialized);
  if (!matches(snapshot, RECIPE_DOCUMENT_SCHEMA)) throw new Error('Recipe does not satisfy version 1 bounded schema.');
  return snapshot as RecipeDocument;
}
