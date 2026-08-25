'use server';

import { revalidatePath } from 'next/cache';
import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { api } from '../../../convex/_generated/api';
import { executeAITask } from '@/lib/ai/engine';
import { estimateProductionCost } from '@/lib/credits/service';
import type { CostEstimate, CreateIntent, DirectorPlan, DirectorScenePlan, ProductionWorkflow } from '@/lib/types/database';

export interface PlanningPreview {
    title: string;
    summary: string;
    script: {
        text: string;
        source: 'USER_SCRIPT' | 'AI_DRAFT' | 'BRIEF';
        label: string;
    };
    creativeGuide: {
        visualStyle: string;
        tone: string;
        pace: string;
        palette: string;
        notes: string[];
        characters: Array<{ name: string; description: string }>;
        locations: Array<{ name: string; description: string }>;
        products: Array<{ name: string; description: string }>;
    };
    parts: Array<{
        id: string;
        title: string;
        purpose: string;
        description: string;
        takes: Array<{
            id: string;
            title: string;
            prompt: string;
            durationSeconds: number;
            status: 'PLANNED';
            requiredAssetCount: number;
        }>;
    }>;
    estimate: CostEstimate;
}

export type CreateDirectorPlanResult =
    | { success: false; error: string }
    | {
        success: true;
        planId: string;
        productionId: string;
        plan: DirectorPlan;
        planningPreview: PlanningPreview;
        estimate: CostEstimate;
        balance: number;
    };

function readText(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readStringList(value: unknown): string[] {
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    return [];
}

function readEntityList(value: unknown): Array<{ name: string; description: string }> {
    if (!Array.isArray(value)) return [];
    return value.map((entity, index) => {
        const record = entity && typeof entity === 'object' ? entity as Record<string, unknown> : {};
        return {
            name: readText(record.name) || readText(record.title) || `Reference ${index + 1}`,
            description: readText(record.description) || readText(record.details) || readText(record.role) || 'Planned reference for this video.',
        };
    });
}

function buildPlanningPreview(plan: DirectorPlan, intent: CreateIntent, estimate: CostEstimate): PlanningPreview {
    const story = plan.bible.story ?? {};
    const style = plan.bible.style ?? {};
    const scriptText = readText(story.script) || readText(story.dialogue) || readText(story.narration) || readText(intent.script) || readText(intent.prompt) || 'FinalFrame will shape your brief into a clear script before the video is made.';
    const scriptSource = readText(intent.script) ? 'USER_SCRIPT' : readText(story.script) || readText(story.dialogue) || readText(story.narration) ? 'AI_DRAFT' : 'BRIEF';
    const title = readText(plan.bible.projectContext?.title) || readText(intent.prompt)?.slice(0, 60) || 'Your FinalFrame video';
    const visualStyle = readText(style.visualStyle) || readText(style.style) || 'Clear, expressive visuals shaped around your story.';
    const tone = readText(style.tone) || readText(story.tone) || 'Purposeful and audience-aware';
    const pace = readText(style.pace) || readText(story.pace) || 'A rhythm that keeps the story easy to follow';
    const palette = readText(style.palette) || readStringList(style.colors).join(', ') || 'Chosen to support the story and brand';
    const notes = [
        ...readStringList(style.lighting),
        ...readStringList(style.camera),
        ...readStringList(style.notes),
        ...readStringList(plan.assumptions),
    ].slice(0, 5);
    const parts = plan.sequences.flatMap((sequence, sequenceIndex) => sequence.scenes.map((scene, sceneIndex) => ({
        id: `${sequenceIndex}-${sceneIndex}-${scene.orderIndex}`,
        title: scene.title,
        purpose: scene.purpose,
        description: scene.visualDirection,
        takes: scene.shots.map((shot, shotIndex) => ({
            id: `${sequenceIndex}-${sceneIndex}-${shotIndex}-${shot.orderIndex}`,
            title: shot.title,
            prompt: shot.prompt,
            durationSeconds: shot.durationSeconds,
            status: 'PLANNED' as const,
            requiredAssetCount: shot.requiredAssetIds.length,
        })),
    })));

    return {
        title,
        summary: plan.summary,
        script: { text: scriptText, source: scriptSource, label: scriptSource === 'USER_SCRIPT' ? 'Your script' : scriptSource === 'AI_DRAFT' ? 'Draft from your brief' : 'Story direction from your brief' },
        creativeGuide: {
            visualStyle,
            tone,
            pace,
            palette,
            notes,
            characters: readEntityList(plan.bible.characters),
            locations: readEntityList(plan.bible.locations),
            products: readEntityList(plan.bible.products),
        },
        parts,
        estimate,
    };
}

function clampDuration(seconds: number) { return Math.min(60, Math.max(15, Math.round(seconds || 30))); }

function inferWorkflow(intent: CreateIntent): ProductionWorkflow {
    if (intent.workflow) return intent.workflow;
    if (intent.mode === 'AD') return 'BUSINESS_AD';
    if (intent.mode === 'FOOTAGE') return 'FOOTAGE_TRANSFORM';
    if (intent.mode === 'IDEA' || intent.mode === 'SCRIPT') return 'SOCIAL';
    return 'COMEDY';
}
function fallbackPlan(intent: CreateIntent): DirectorPlan {
    const duration = clampDuration(intent.requestedDurationSeconds);
    const shotCount = duration <= 20 ? 3 : duration <= 40 ? 5 : 7;
    const shotDuration = Number((duration / shotCount).toFixed(2));
    const title = intent.prompt?.slice(0, 60) || intent.script?.split('\n')[0]?.slice(0, 60) || 'Your FinalFrame video';
    const scenes: DirectorScenePlan[] = [{ title: 'Opening', purpose: 'Establish the premise and visual world quickly.', visualDirection: 'Clear social composition with readable action.', orderIndex: 0, shots: Array.from({ length: shotCount }, (_, index) => ({ title: `Shot ${index + 1}`, prompt: `${index === 0 ? 'Establish' : index === shotCount - 1 ? 'Resolve' : 'Continue'} the story: ${title}.`, durationSeconds: shotDuration, orderIndex: index, requiredAssetIds: intent.inputAssetIds, camera: { angle: 'eye_level', movement: index === 0 ? 'static' : 'zoom_in', lens: 'standard' } })) }];
    return { summary: `A ${duration}-second ${inferWorkflow(intent).toLowerCase().replace('_', ' ')} production.`, assumptions: ['Vertical social framing is the default output.', 'Shots will be assembled automatically in order.'], questions: [], workflow: inferWorkflow(intent), bible: { projectContext: { title, duration, language: intent.language || 'en' }, characters: [], locations: [], products: [], style: { visualStyle: 'clean, expressive, social-first' }, story: { premise: intent.prompt || intent.script || '' } }, sequences: [{ title: 'Main Story', description: 'The complete short-form production.', orderIndex: 0, scenes }], operations: [{ operation: 'VIDEO', quantity: duration, unit: 'second', qualityTier: intent.qualityTier || 'STANDARD' }] };
}

function parsePlan(content: string | null, intent: CreateIntent): DirectorPlan {
    if (!content) return fallbackPlan(intent);
    try {
        const parsed = JSON.parse(content) as Partial<DirectorPlan>;
        return parsed.sequences?.length && parsed.summary ? { ...fallbackPlan(intent), ...parsed } as DirectorPlan : fallbackPlan(intent);
    } catch { return fallbackPlan(intent); }
}

async function authenticatedStudio() {
    if (!(await convexAuthNextjsToken())) return null;
    const convex = await getAuthenticatedConvexClient();
    const current = await convex.query(api.account.current, {});
    return current.studio ? { convex, studio: current.studio } : null;
}

export async function createDirectorPlan(intent: CreateIntent): Promise<CreateDirectorPlanResult> {
    try {
        const context = await authenticatedStudio();
        if (!context) return { success: false, error: 'Authentication or studio setup required' };
        const normalized: CreateIntent = { ...intent, requestedDurationSeconds: clampDuration(intent.requestedDurationSeconds), inputAssetIds: intent.inputAssetIds || [], outputPreset: intent.outputPreset || 'SOCIAL_VERTICAL', qualityTier: intent.qualityTier || 'STANDARD' };
        if (!normalized.projectId) return { success: false, error: 'A project is required before creating a production plan' };
        const projects = await context.convex.query(api.projects.list, { studioExternalId: context.studio.externalId });
        if (!projects.some((project) => project.externalId === normalized.projectId || project._id === normalized.projectId)) return { success: false, error: 'Project not found' };
        let plan = fallbackPlan(normalized);
        if (process.env.OPENROUTER_API_KEY) {
            try {
                const response = await executeAITask('AI_BRAIN', [{ role: 'system', content: 'You are FinalFrame AI Director. Return only valid JSON matching DirectorPlan. Keep every shot independently generatable.' }, { role: 'user', content: JSON.stringify({ intent: normalized, requiredKeys: ['summary', 'assumptions', 'questions', 'workflow', 'bible', 'sequences', 'operations'] }) }], { jsonMode: true, temperature: 0.4 });
                plan = parsePlan(response.content, normalized);
            } catch (error) { console.warn('[Director] Using validated fallback plan:', error); }
        }
        const totalShots = plan.sequences.reduce((total, sequence) => total + sequence.scenes.reduce((sum, scene) => sum + scene.shots.length, 0), 0);
        const totalSeconds = plan.sequences.reduce((total, sequence) => total + sequence.scenes.reduce((sum, scene) => sum + scene.shots.reduce((shotSum, shot) => shotSum + shot.durationSeconds, 0), 0), 0);
        const estimate = await estimateProductionCost({ shotCount: totalShots, videoSeconds: Math.ceil(totalSeconds), qualityTier: normalized.qualityTier || 'STANDARD', hasVoice: normalized.mode === 'VOICE', needsCaptions: normalized.mode === 'VOICE' || normalized.mode === 'FOOTAGE', needsAssembly: true });
        const production = await context.convex.mutation(api.productions.createPlan, { studioExternalId: context.studio.externalId, projectExternalId: normalized.projectId, workflow: plan.workflow, inputMode: normalized.mode, durationSeconds: normalized.requestedDurationSeconds, language: normalized.language || 'en', outputPreset: normalized.outputPreset, input: normalized, plan, estimate });
        const balance = await context.convex.query(api.credits.getBalance, { studioExternalId: context.studio.externalId });
        return { success: true, planId: production.planId.toString(), productionId: production.productionId.toString(), plan, planningPreview: buildPlanningPreview(plan, normalized, estimate), estimate, balance };
    } catch (error) {
        console.error('Convex createDirectorPlan failed:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unable to create production plan' };
    }
}

export async function reviseDirectorPlan(intent: CreateIntent, revision: string): Promise<CreateDirectorPlanResult> {
    const note = revision.trim();
    if (!note) return { success: false, error: 'Tell us what you would like to change first.' };
    const revisedIntent: CreateIntent = {
        ...intent,
        prompt: intent.mode === 'SCRIPT' ? intent.prompt : [intent.prompt, `Revision request: ${note}`].filter(Boolean).join('\n\n'),
        script: intent.mode === 'SCRIPT' ? [intent.script, `Revision request: ${note}`].filter(Boolean).join('\n\n') : intent.script,
    };
    return createDirectorPlan(revisedIntent);
}

export async function approveDirectorPlan(planId: string) {
    try {
        const context = await authenticatedStudio();
        if (!context) return { success: false, error: 'Unauthorized' };
        const result = await context.convex.mutation(api.productions.approvePlan, { planId: planId as any });
        revalidatePath('/dashboard');
        return { success: true, productionId: result.productionId.toString(), versionId: result.versionId.toString() };
    } catch (error) {
        console.error('Convex approveDirectorPlan failed:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unable to approve plan' };
    }
}

export async function getProductionWorkspace(projectId: string): Promise<any> {
    try {
        const context = await authenticatedStudio();
        if (!context) return { success: false, error: 'Unauthorized' };
        const projects = await context.convex.query(api.projects.list, { studioExternalId: context.studio.externalId });
        if (!projects.some((project) => project.externalId === projectId || project._id === projectId)) return { success: false, error: 'Project not found' };
        const workspace = await context.convex.query(api.productions.getWorkspaceByProject, { projectExternalId: projectId });
        return { success: true, ...workspace };
    } catch (error) {
        console.error('Convex getProductionWorkspace failed:', error);
        return { success: false, error: 'Unable to load production workspace' };
    }
}
