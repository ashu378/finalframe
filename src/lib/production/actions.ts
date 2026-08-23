'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getConvexClient } from '@/lib/convex/server';
import { api } from '../../../convex/_generated/api';
import { executeAITask } from '@/lib/ai/engine';
import { estimateProductionCost, getStudioCreditBalance } from '@/lib/credits/service';
import type { CreateIntent, DirectorPlan, DirectorScenePlan, QualityTier, ProductionWorkflow } from '@/lib/types/database';

function clampDuration(seconds: number) {
    return Math.min(60, Math.max(15, Math.round(seconds || 30)));
}

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
    const scenes: DirectorScenePlan[] = [{
        title: 'Opening',
        purpose: 'Establish the premise and visual world quickly.',
        visualDirection: 'Clear vertical social composition with readable action.',
        orderIndex: 0,
        shots: Array.from({ length: shotCount }, (_, index) => ({
            title: `Shot ${index + 1}`,
            prompt: `${index === 0 ? 'Establish' : index === shotCount - 1 ? 'Resolve' : 'Continue'} the story: ${title}. Shot ${index + 1} of ${shotCount}. Keep the visual identity consistent.`,
            durationSeconds: shotDuration,
            orderIndex: index,
            requiredAssetIds: intent.inputAssetIds,
            camera: { angle: 'eye_level', movement: index === 0 ? 'static' : 'zoom_in', lens: 'standard' },
        })),
    }];
    return {
        summary: `A ${duration}-second ${inferWorkflow(intent).toLowerCase().replace('_', ' ')} production built from your ${intent.mode.toLowerCase()} input.`,
        assumptions: ['Vertical social framing is the default output.', 'Shots will be assembled automatically in order.', 'Uploaded assets will be reused as references where supported.'],
        questions: [],
        workflow: inferWorkflow(intent),
        bible: { projectContext: { title, duration, language: intent.language || 'en' }, characters: [], locations: [], products: [], style: { visualStyle: 'clean, expressive, social-first' }, story: { premise: intent.prompt || intent.script || '' } },
        sequences: [{ title: 'Main Story', description: 'The complete short-form production.', orderIndex: 0, scenes }],
        operations: [{ operation: 'VIDEO', quantity: duration, unit: 'second', qualityTier: intent.qualityTier || 'STANDARD' }],
    };
}

function parsePlan(content: string | null, intent: CreateIntent): DirectorPlan {
    if (!content) return fallbackPlan(intent);
    try {
        const parsed = JSON.parse(content) as Partial<DirectorPlan>;
        if (!parsed.sequences?.length || !parsed.summary) return fallbackPlan(intent);
        return { ...fallbackPlan(intent), ...parsed } as DirectorPlan;
    } catch {
        return fallbackPlan(intent);
    }
}

async function getUserStudio(supabase: any) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { user: null, studio: null };
    const { data: studio } = await supabase.from('studios').select('id,credits').eq('user_id', user.id).single();
    return { user, studio };
}

export async function createDirectorPlan(intent: CreateIntent) {
    const supabase = await createClient();
    const { user, studio } = await getUserStudio(supabase);
    if (!user || !studio) return { success: false, error: 'Authentication or studio setup required' };
    const normalized: CreateIntent = { ...intent, requestedDurationSeconds: clampDuration(intent.requestedDurationSeconds), inputAssetIds: intent.inputAssetIds || [], outputPreset: intent.outputPreset || 'SOCIAL_VERTICAL', qualityTier: intent.qualityTier || 'STANDARD' };

    let plan = fallbackPlan(normalized);
    if (process.env.OPENROUTER_API_KEY) {
        try {
            const response = await executeAITask('AI_BRAIN', [
                { role: 'system', content: 'You are FinalFrame AI Director. Return only valid JSON matching the requested DirectorPlan shape. Plan short-form video production, never mention providers, and keep every shot independently generatable.' },
                { role: 'user', content: JSON.stringify({ intent: normalized, requiredKeys: ['summary', 'assumptions', 'questions', 'workflow', 'bible', 'sequences', 'operations'] }) },
            ], { jsonMode: true, temperature: 0.4 });
            plan = parsePlan(response.content, normalized);
        } catch (error) {
            console.warn('[Director] Falling back to deterministic plan:', error);
        }
    }

    const totalShots = plan.sequences.reduce((total, sequence) => total + sequence.scenes.reduce((sceneTotal, scene) => sceneTotal + scene.shots.length, 0), 0);
    const totalSeconds = plan.sequences.reduce((total, sequence) => total + sequence.scenes.reduce((sceneTotal, scene) => sceneTotal + scene.shots.reduce((shotTotal, shot) => shotTotal + shot.durationSeconds, 0), 0), 0);
    const estimate = await estimateProductionCost({ shotCount: totalShots, videoSeconds: Math.ceil(totalSeconds), qualityTier: normalized.qualityTier || 'STANDARD', hasVoice: normalized.mode === 'VOICE', needsCaptions: normalized.mode === 'VOICE' || normalized.mode === 'FOOTAGE', needsAssembly: true });

    const authToken = await import('@convex-dev/auth/nextjs/server').then((module) => module.convexAuthNextjsToken());
    if (authToken) {
        const convex = getConvexClient();
        convex.setAuth(authToken);
        const current = await convex.query(api.account.current, {});
        if (!current.studio) return { success: false, error: 'Studio setup is required before creating a video.' };
        const production = await convex.mutation(api.productions.createPlan, { studioExternalId: current.studio.externalId, projectExternalId: normalized.projectId || `project_${Date.now()}`, workflow: plan.workflow, inputMode: normalized.mode, durationSeconds: normalized.requestedDurationSeconds, language: normalized.language || 'en', outputPreset: normalized.outputPreset, input: normalized, plan, estimate });
        return { success: true, planId: production.planId.toString(), productionId: production.productionId.toString(), plan, estimate, balance: await convex.query(api.credits.getBalance, { studioExternalId: current.studio.externalId }) };
    }

    if (!normalized.projectId || !normalized.projectId.includes('-')) {
        return { success: false, error: 'A project is required before creating a production plan' };
    }

    const { data: project } = await supabase.from('projects').select('id,studio_id,name,description').eq('id', normalized.projectId).single();
    if (!project || project.studio_id !== studio.id) return { success: false, error: 'Project not found' };
    const convex = getConvexClient();
    await convex.mutation(api.bootstrap.ensureStudio, { studioExternalId: studio.id, name: project.name || 'FinalFrame Studio', initialCredits: Number(studio.credits || 0) });
    await convex.mutation(api.bootstrap.mirrorProject, { studioExternalId: studio.id, projectExternalId: project.id, name: project.name || 'Untitled production', description: project.description || undefined });
    const production = await convex.mutation(api.productions.createPlan, { studioExternalId: studio.id, projectExternalId: project.id, workflow: plan.workflow, inputMode: normalized.mode, durationSeconds: normalized.requestedDurationSeconds, language: normalized.language || 'en', outputPreset: normalized.outputPreset, input: normalized, plan, estimate });

    if (normalized.inputAssetIds.length > 0) {
        const { data: assets } = await supabase.from('studio_assets').select('id,name,type,mime_type,size,url').eq('studio_id', studio.id).in('id', normalized.inputAssetIds);
        if ((assets || []).length !== normalized.inputAssetIds.length) return { success: false, error: 'One or more selected assets are unavailable' };
        for (const asset of assets || []) {
            await convex.mutation(api.bootstrap.mirrorAsset, { studioExternalId: studio.id, productionId: production.productionId, assetExternalId: asset.id, source: 'USER_UPLOAD', roles: [normalized.mode === 'VOICE' ? 'VOICE' : normalized.mode === 'FOOTAGE' ? 'SOURCE_VIDEO' : normalized.mode === 'AD' ? 'PRODUCT_REFERENCE' : 'IMAGE_REFERENCE'], name: asset.name, mimeType: asset.mime_type || undefined, storageUrl: asset.url || undefined, metadata: asset });
        }
    }
    return { success: true, planId: production.planId.toString(), productionId: production.productionId.toString(), plan, estimate, balance: await convex.query(api.credits.getBalance, { studioExternalId: studio.id }) };
}

export async function approveDirectorPlan(planId: string) {
    const authToken = await import('@convex-dev/auth/nextjs/server').then((module) => module.convexAuthNextjsToken());
    if (authToken) {
        const convex = getConvexClient();
        convex.setAuth(authToken);
        const result = await convex.mutation(api.productions.approvePlan, { planId: planId as any });
        revalidatePath('/dashboard');
        return { success: true, productionId: result.productionId.toString(), versionId: result.versionId.toString() };
    }
    const supabase = await createClient();
    const { user, studio } = await getUserStudio(supabase);
    if (!user || !studio) return { success: false, error: 'Unauthorized' };
    const convex = getConvexClient();
    const result = await convex.mutation(api.productions.approvePlan, { planId: planId as any });
    revalidatePath('/dashboard');
    return { success: true, productionId: result.productionId.toString(), versionId: result.versionId.toString() };
}

export async function getProductionWorkspace(projectId: string): Promise<any> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };
    const { data: project } = await supabase.from('projects').select('id,studio_id').eq('id', projectId).single();
    if (!project) return { success: false, error: 'Project not found' };
    const { data: studio } = await supabase.from('studios').select('id').eq('id', project.studio_id).eq('user_id', user.id).single();
    if (!studio) return { success: false, error: 'Project not found' };
    const convex = getConvexClient();
    const workspace = await convex.query(api.productions.getWorkspaceByProject, { projectExternalId: projectId });
    return { success: true, ...workspace };
}
