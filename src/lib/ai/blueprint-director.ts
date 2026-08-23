'use server';

/**
 * FinalFrame — AI Director Blueprint Generator
 * Reference: MASTER_PRD.md § 2.2 — Creative Director AI (Scene intent only)
 * Reference: BUILD_PHASES.md — Phase 2 AI Director Blueprint
 * 
 * Generates structured scene plans (text only) based on studio defaults.
 * NO media generation, NO free-form prompts in this phase.
 * 
 */

import { createClient } from '@/lib/supabase/server';
import { createScenesFromBlueprint } from '@/lib/scene/actions';
import type {
    CreativeDNASnapshot,
    MessageBlocksSnapshot,
    CameraConfig,
    MotionConfig
} from '@/lib/types/database';
import { executeAITask } from './engine';

interface BlueprintScene {
    scene_title: string;
    scene_goal: string;
    scene_text: string;
    visual_description: string;
    action_sequence: string;
    emotional_beat: string;
    differentiation_note: string;
    why_this_scene_exists: string;
    camera_config: CameraConfig;
    motion_config: MotionConfig;
}

interface BlueprintInput {
    outcome_goal: string;
    platform: string;
    content_type: string;
    project_description: string;
    context: string;
    creative_dna: CreativeDNASnapshot;
    message_blocks: MessageBlocksSnapshot;
}

const BLUEPRINT_SCHEMA: Record<string, unknown> = {
    type: 'object',
    additionalProperties: false,
    required: ['scenes'],
    properties: {
        scenes: {
            type: 'array',
            minItems: 4,
            maxItems: 6,
            items: {
                type: 'object',
                additionalProperties: false,
                required: [
                    'scene_title', 'scene_goal', 'scene_text', 'visual_description',
                    'action_sequence', 'emotional_beat', 'differentiation_note',
                    'why_this_scene_exists', 'camera_config', 'motion_config',
                ],
                properties: {
                    scene_title: { type: 'string', minLength: 1 },
                    scene_goal: { type: 'string', minLength: 1 },
                    scene_text: { type: 'string', minLength: 1 },
                    visual_description: { type: 'string', minLength: 1 },
                    action_sequence: { type: 'string', minLength: 1 },
                    emotional_beat: { type: 'string', minLength: 1 },
                    differentiation_note: { type: 'string', minLength: 1 },
                    why_this_scene_exists: { type: 'string', minLength: 1 },
                    camera_config: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['angle', 'movement', 'lens'],
                        properties: {
                            angle: { type: 'string', enum: ['eye_level', 'low_angle', 'high_angle', 'drone', 'macro'] },
                            movement: { type: 'string', enum: ['static', 'pan_left', 'pan_right', 'tilt_up', 'tilt_down', 'zoom_in', 'zoom_out', 'orbit'] },
                            lens: { type: 'string', enum: ['wide', 'standard', 'telephoto'] },
                        },
                    },
                    motion_config: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['speed', 'stability'],
                        properties: {
                            speed: { type: 'string', enum: ['slow', 'normal', 'fast'] },
                            stability: { type: 'number', minimum: 0, maximum: 1 },
                        },
                    },
                },
            },
        },
    },
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Blueprint scene field ${field} is required.`);
    return value.trim();
}

function parseBlueprint(content: string): BlueprintScene[] {
    const parsed = JSON.parse(content) as unknown;
    const scenesValue = isRecord(parsed) ? parsed.scenes : undefined;
    if (!Array.isArray(scenesValue) || scenesValue.length < 4 || scenesValue.length > 6) {
        throw new Error('Blueprint must contain 4-6 scenes.');
    }
    const scenes = scenesValue.map((value, index): BlueprintScene => {
        if (!isRecord(value)) throw new Error(`Blueprint scene ${index + 1} is invalid.`);
        const camera = value.camera_config;
        const motion = value.motion_config;
        if (!isRecord(camera) || !isRecord(motion)) throw new Error(`Blueprint scene ${index + 1} camera and motion configuration are required.`);
        const stability = motion.stability;
        if (typeof stability !== 'number' || stability < 0 || stability > 1) throw new Error(`Blueprint scene ${index + 1} has invalid motion stability.`);
        return {
            scene_title: requiredString(value.scene_title, 'scene_title'),
            scene_goal: requiredString(value.scene_goal, 'scene_goal'),
            scene_text: requiredString(value.scene_text, 'scene_text'),
            visual_description: requiredString(value.visual_description, 'visual_description'),
            action_sequence: requiredString(value.action_sequence, 'action_sequence'),
            emotional_beat: requiredString(value.emotional_beat, 'emotional_beat'),
            differentiation_note: requiredString(value.differentiation_note, 'differentiation_note'),
            why_this_scene_exists: requiredString(value.why_this_scene_exists, 'why_this_scene_exists'),
            camera_config: camera as CameraConfig,
            motion_config: motion as MotionConfig,
        };
    });
    const descriptions = new Set(scenes.map((scene) => scene.visual_description.toLowerCase()));
    if (descriptions.size !== scenes.length) throw new Error('Blueprint scenes must have distinct visual descriptions.');
    return scenes;
}

/**
 * Generate AI Director Blueprint for a project using LLM expansion.
 */
export async function generateBlueprint(projectId: string): Promise<{
    success: boolean;
    scenesGenerated?: number;
    error?: string;
}> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { success: false, error: 'Unauthorized' };

    // Get project with all inherited data
    const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

    if (projectError || !project) return { success: false, error: 'Project not found' };

    // Verify ownership
    const { data: studio } = await supabase
        .from('studios')
        .select('id')
        .eq('id', project.studio_id)
        .eq('user_id', user.id)
        .single();

    if (!studio) return { success: false, error: 'Access denied' };

    // Check project state
    if (project.state !== 'draft' && project.state !== 'blueprint_ready') {
        return { success: false, error: 'Blueprint can only be generated in draft or blueprint_ready state' };
    }

    const dna = project.creative_dna_snapshot as CreativeDNASnapshot || {};
    const blocks = project.message_blocks_snapshot as MessageBlocksSnapshot || {};

    const systemPrompt = `You are the **FinalFrame AI Director**.

Your job is to produce a **production-ready video blueprint** that a professional video team or AI video engine can execute without guessing.

You are NOT writing marketing copy.
You are NOT writing generic ideas.
You ARE directing scenes.

---

## GLOBAL RULES (NON-NEGOTIABLE)

1. **Every scene MUST be unique**
   - No repeated context
   - No reused phrasing
   - No generic filler

2. **Every scene MUST contain:**
   - A clear GOAL (why this scene exists)
   - VISUALS (what is seen on screen)
   - ACTION (what happens over time)

3. **Scenes must be visually executable**
   - Describe framing, environment, lighting, motion
   - Assume the output is video, not text

4. **No vague language**
   - ❌ “show the app”
   - ❌ “highlight benefits”
   - ✅ “close-up of smartphone screen showing payment confirmation animation”

5. **Time awareness**
   - Include durations, beats, or transitions where relevant
   - Think in seconds, not paragraphs

---

## SCENE STRUCTURE (MANDATORY JSON FORMAT)

For EACH scene, you must provide:
- scene_title: Concise name.
- why_this_scene_exists: A 1-sentence explanation of why this scene is necessary for the goal (THE GOAL).
- emotional_intent: What the viewer should feel (the EMOTIONAL INTENT).
- visual_description: Concrete description of environment, framing, lighting, objects, UI, people (the VISUALS).
- action_sequence: What changes, animates, transitions, appears, disappears, or moves over time (the ACTION).
- differentiation_note: Why this scene matters in the narrative flow or how it differs visually (the NOTE).
- camera_config: JSON object with { angle, movement, lens }.
    - angle: eye_level, low_angle, high_angle, drone, macro
    - movement: static, pan_left, pan_right, tilt_up, tilt_down, zoom_in, zoom_out, orbit
    - lens: wide, standard, telephoto
- motion_config: JSON object with { speed, stability }.
    - speed: slow, normal, fast
    - stability: number (0.0 to 1.0)

---

## CONTENT TYPE ADAPTATION RULES

Adapt the blueprint automatically based on Content Type:

### Commercial / Ad
- Cinematic pacing
- Emotional arc (tension → relief → desire)
- Visual symbolism allowed

### SaaS / Product Demo
- UI clarity over emotion
- Screens, flows, interactions
- No cinematic fluff

### Explainer
- Concept visualization
- Simple metaphors
- Clear progression

### UGC / Social
- Handheld realism
- Imperfect framing allowed
- Human presence emphasized

### Motion Graphics
- Abstract shapes, typography, icons
- Rhythm and transitions over realism

### Avatar / Talking Head
- Camera framing consistency
- Explicit spoken script per scene
- Minimal background distraction

---

## PROJECT CONTEXT
- Platform: ${project.platform}
- Identity Presence: ${project.identity_presence || 'no_people'}
- Outcome Goal: ${project.outcome_goal}
- Content Type: ${project.content_type || 'social_ad'}
- Brand Energy: ${dna.brand_energy}
- Visual Style: ${dna.visual_style}
- Value Prop: ${blocks.value_proposition}
- User Description: ${project.project_description}

---

## OUTPUT QUALITY BAR

If a scene:
- Could apply to ANY product → rewrite it
- Does not clearly describe what the camera sees → rewrite it
- Repeats another scene’s idea → rewrite it

This blueprint must feel like it was created by:
**A creative director + cinematographer + motion designer working together.**

Return a JSON object with a "scenes" array containing 4-6 scenes.`;

    try {
        const response = await executeAITask('AI_BRAIN', [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Expand this project into a 4-6 scene blueprint: ${project.project_description}` }
        ], {
            structuredOutput: {
                name: 'finalframe_blueprint',
                schema: BLUEPRINT_SCHEMA,
                strict: true,
                description: 'A production-ready FinalFrame scene blueprint.',
            },
        });

        if (!response.content) return { success: false, error: 'AI returned no blueprint.' };
        const scenes = parseBlueprint(response.content);

        // Save to DB
        const result = await createScenesFromBlueprint(projectId, scenes);
        if (!result.success) return { success: false, error: result.error };

        return { success: true, scenesGenerated: scenes.length };

    } catch (err) {
        console.error('Blueprint Director Error:', err);
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Critical error during blueprint generation'
        };
    }
}
