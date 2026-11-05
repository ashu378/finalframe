import { v } from 'convex/values';
import { OUTPUT_PRESETS } from '../renderer/src/output-presets';

export const outputPresetValidator = v.union(...OUTPUT_PRESETS.map(preset => v.literal(preset.id)), v.literal('SOCIAL_VERTICAL'));
