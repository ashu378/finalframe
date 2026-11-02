import type { OutputPreset, ProductionInputMode, Template, TemplateCategory } from '../types/database';
import type { VideoType } from '../ai/video-routing';

export type TemplateDefaults = {
  mode: ProductionInputMode;
  name: string;
  brief: string;
  videoType: VideoType;
  durationSeconds: number;
  outputPreset: OutputPreset;
};

export type StarterTemplate = TemplateDefaults & {
  id: string;
  version: number;
  description: string;
  category: TemplateCategory;
};

// These are authored starting briefs, never generated media or approved plans.
export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
  { id: 'character-comedy', version: 1, name: 'Character comedy', description: 'A setup, a misunderstanding, and a visual payoff.', category: 'custom', mode: 'IDEA', videoType: 'ANIMATED_COMEDY_2D', durationSeconds: 30, outputPreset: 'SOCIAL_VERTICAL', brief: 'Create a playful 2D animated comedy about a fictional market bird who mistakes a shiny bottle cap for treasure. Establish the character, build one misunderstanding, and end with a visual payoff. Keep the same character design throughout. Help me choose the dialogue and location before making takes.' },
  { id: 'realistic-skit', version: 1, name: 'Everyday skit', description: 'A small everyday conflict, performed by fictional characters.', category: 'ugc', mode: 'IDEA', videoType: 'REALISTIC_SKIT_UGC', durationSeconds: 30, outputPreset: 'SOCIAL_VERTICAL', brief: 'Plan a realistic short skit with two fictional coworkers trying to choose the perfect lunch. Use a clear setup, two contrasting reactions, and a warm final joke. Ask me about the setting and dialogue. Do not imply a real person endorsed anything.' },
  { id: 'product-launch', version: 1, name: 'Product launch', description: 'Introduce a problem, show the product, and finish with one action.', category: 'social_ad', mode: 'AD', videoType: 'PRODUCT_SAAS_LAUNCH', durationSeconds: 30, outputPreset: 'LANDSCAPE', brief: 'Plan a product launch video: introduce the audience problem, show the product solving it, highlight one concrete benefit, and end with a clear call to action. Ask me for the product name, audience, substantiated benefits, logo, screenshots, and final call to action. Preserve exact supplied brand text.' },
  { id: 'motion-announcement', version: 1, name: 'Motion announcement', description: 'An exact-title announcement built around designed cards.', category: 'social_ad', mode: 'IDEA', videoType: 'MOTION_GRAPHICS', durationSeconds: 15, outputPreset: 'SQUARE', brief: 'Plan a clean motion graphics announcement using designed title cards, a brand name, and a final call to action. Ask for the exact headline, supporting message, brand colors, logo, and destination. Keep text readable and use supported graphic templates.' },
  { id: 'narrated-explainer', version: 1, name: 'Narrated explainer', description: 'Teach one idea with a clear beginning, example, and takeaway.', category: 'explainer', mode: 'IDEA', videoType: 'EXPLAINER_STORY', durationSeconds: 60, outputPreset: 'LANDSCAPE', brief: 'Plan a narrated explainer that teaches one useful idea. Open with a question, explain the concept in plain language, show a concrete example, and finish with one takeaway. Ask me for the topic, intended audience, supporting facts, and narration language before writing the final script.' },
  { id: 'cinematic-scene', version: 1, name: 'Cinematic scene', description: 'A short self-contained scene with an emotional turn.', category: 'custom', mode: 'IDEA', videoType: 'CINEMATIC_FILM', durationSeconds: 60, outputPreset: 'LANDSCAPE', brief: 'Plan a short cinematic scene about a fictional traveler returning to a familiar place after many years. Build a clear emotional turn through setting, action, and reaction. Ask me for visual references, the location, and whether dialogue is needed. Keep the scene self-contained.' },
  { id: 'music-montage', version: 1, name: 'Music montage', description: 'Shape supplied music and footage into a visual sequence.', category: 'custom', mode: 'FOOTAGE', videoType: 'MUSIC_VIDEO', durationSeconds: 30, outputPreset: 'LANDSCAPE', brief: 'Plan a visual montage around music and footage I supply. Ask for the intended mood, owned music track, known tempo or cue times, and visual references. Use the supplied timing cues to propose cuts and preserve the approved soundtrack.' },
  { id: 'social-cutdown', version: 1, name: 'Social cutdown', description: 'Reframe supplied footage around one clear message.', category: 'social_ad', mode: 'FOOTAGE', videoType: 'SOCIAL_CUTDOWN', durationSeconds: 15, outputPreset: 'SOCIAL_VERTICAL', brief: 'Turn footage I supply into a focused vertical social video. Ask which message and moments matter most, identify a hook and ending, and propose trims and reframing. Preserve original meaning, approved source audio, and important on-screen content.' },
];

export function getStarterTemplate(id: string | undefined) {
  return STARTER_TEMPLATES.find((template) => template.id === id);
}

export function parseStartingMode(value: string | undefined): ProductionInputMode | undefined {
  if (value === 'ASSETS') return 'IMAGES';
  return ['IDEA', 'SCRIPT', 'VOICE', 'IMAGES', 'FOOTAGE', 'AD'].includes(value || '') ? value as ProductionInputMode : undefined;
}

export function asTemplate(template: StarterTemplate, saved = false): Template {
  return { id: template.id, name: template.name, description: template.description, category: template.category, studio_id: null, thumbnail_url: null, is_public: true, blueprint_data: { ...template, saved }, created_at: '2026-11-02T00:00:00.000Z', updated_at: '2026-11-02T00:00:00.000Z' };
}
