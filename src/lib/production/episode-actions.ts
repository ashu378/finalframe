'use server';

import { revalidatePath } from 'next/cache';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { api } from '../../../convex/_generated/api';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import { normalizeVideoType, type VideoType } from '@/lib/ai/video-routing';
import { parseStartingMode } from '@/lib/templates/catalog';
import type { OutputPreset, ProductionInputMode, ProductionWorkflow } from '@/lib/types/database';

export interface SelectedProductionDefaults {
    projectExternalId: string;
    productionId: string;
    studioExternalId: string;
    durationSeconds: number;
    mode: ProductionInputMode;
    workflow: ProductionWorkflow;
    language: string;
    outputPreset: OutputPreset;
    videoType: VideoType;
    brief: string;
}

export async function getSelectedProductionDefaults(projectExternalId: string, productionId: string): Promise<SelectedProductionDefaults | null> {
    const convex = await getAuthenticatedConvexClient();
    const selected = await Promise.all([
        convex.query(api.projects.getByExternalId, { externalId: projectExternalId }),
        convex.query(api.productions.getWorkspaceByProject, { projectExternalId, productionId: productionId as Id<'productions'> }),
    ]).catch((error: unknown) => {
        const code = error && typeof error === 'object' && 'data' in error ? (error.data as { code?: string })?.code : undefined;
        if (code && ['PROJECT_NOT_FOUND', 'PROJECT_ACCESS_DENIED', 'NOT_A_MEMBER'].includes(code) || error instanceof Error && /Production not found in this project/.test(error.message)) return null;
        throw error;
    });
    if (!selected) return null;
    const [project, workspace] = selected;
    const production = workspace.production;
    if (!project || !production || String(production._id) !== productionId || production.externalProjectId !== project.externalId || production.studioExternalId !== project.studioExternalId || production.projectId && production.projectId !== project._id) return null;
    const mode = parseStartingMode(production.inputMode);
    const workflow = production.workflow as ProductionWorkflow;
    const outputPreset = production.outputPreset as OutputPreset;
    if (!mode || !['SOCIAL', 'COMEDY', 'BUSINESS_AD', 'FOOTAGE_TRANSFORM'].includes(workflow) || !['SOCIAL_VERTICAL', 'SQUARE', 'LANDSCAPE'].includes(outputPreset) || !Number.isFinite(production.requestedDurationSeconds) || production.requestedDurationSeconds < 4 || production.requestedDurationSeconds > 60) throw new Error('The selected production needs supported planning settings.');
    const input = workspace.plan?.input;
    const savedInput = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const brief = mode === 'SCRIPT' ? savedInput.script : savedInput.prompt;
    return {
        projectExternalId: project.externalId, productionId, studioExternalId: production.studioExternalId,
        durationSeconds: production.requestedDurationSeconds, mode, workflow, language: production.language,
        outputPreset, videoType: normalizeVideoType(production.projectType ?? project.projectType), brief: typeof brief === 'string' ? brief : '',
    };
}

export interface EpisodeOption {
    productionId: string;
    episodeId?: string;
    episodeNumber?: number;
    title: string;
    continuityStatus?: 'CURRENT' | 'STALE';
}

export interface PlanningContinuityOptions {
    productionId?: string;
    requiresBible: boolean;
    bibles: Array<{
        id: string;
        versionNumber: number;
        referenceCount: number;
        ruleCount: number;
        rulePreview: string[];
        storyPreview: string;
        visualStylePreview: string;
    }>;
    selectionError: string | null;
}

export async function getEpisodeNavigation(projectExternalId: string) {
    const convex = await getAuthenticatedConvexClient();
    const project = await convex.query(api.projects.getByExternalId, { externalId: projectExternalId });
    if (!project) return null;
    const [productions, episodes] = await Promise.all([
        convex.query(api.productions.listByProject, { projectExternalId, paginationOpts: { numItems: 100, cursor: null } }),
        convex.query(api.episodes.list, { projectId: project._id, paginationOpts: { numItems: 100, cursor: null } }),
    ]);
    const productionRows: Doc<'productions'>[] = [...productions.page];
    const episodeRows = [...episodes.page];
    let productionPage = productions;
    let episodePage = episodes;
    while (!productionPage.isDone && productionRows.length < 500) {
        productionPage = await convex.query(api.productions.listByProject, { projectExternalId, paginationOpts: { numItems: 100, cursor: productionPage.continueCursor } });
        productionRows.push(...productionPage.page);
    }
    while (!episodePage.isDone && episodeRows.length < 500) {
        episodePage = await convex.query(api.episodes.list, { projectId: project._id, paginationOpts: { numItems: 100, cursor: episodePage.continueCursor } });
        episodeRows.push(...episodePage.page);
    }
    const options: EpisodeOption[] = productionRows.map((production) => {
        const episode = episodeRows.find((value) => value.productionId === production._id);
        return {
            productionId: production._id.toString(), episodeId: episode?._id.toString(), episodeNumber: episode?.episodeNumber,
            title: episode ? `Episode ${episode.episodeNumber}: ${episode.title}` : `Production · ${production.workflow.replaceAll('_', ' ').toLowerCase()}`,
            continuityStatus: episode?.continuityStatus,
        };
    }).sort((left, right) => (left.episodeNumber ?? 0) - (right.episodeNumber ?? 0));
    const latest = productionRows[0];
    return {
        options, projectId: project._id.toString(), projectExternalId: project.externalId,
        nextEpisodeNumber: Math.max(0, ...episodeRows.map((value) => value.episodeNumber), episodeRows.length === 0 && productionRows.length === 1 ? 1 : 0) + 1,
        workflow: latest?.workflow || 'SOCIAL', inputMode: latest?.inputMode || 'IDEA',
        language: latest?.language || 'en', outputPreset: latest?.outputPreset || 'SOCIAL_VERTICAL',
    };
}

export async function createProjectEpisode(input: { projectExternalId: string; episodeNumber: number; title: string; durationSeconds: number; sourceProductionId?: string }) {
    try {
        const navigation = await getEpisodeNavigation(input.projectExternalId);
        if (!navigation) return { success: false as const, error: 'Project not found.' };
        const source = input.sourceProductionId ? await getSelectedProductionDefaults(input.projectExternalId, input.sourceProductionId) : null;
        if (input.sourceProductionId && !source) return { success: false as const, error: 'Choose a source episode from this project.' };
        const convex = await getAuthenticatedConvexClient();
        const unlinked = navigation.options.filter((option) => !option.episodeId);
        if (unlinked.length === 1 && navigation.options.length === 1) {
            await convex.mutation(api.episodes.adoptLegacyProduction, {
                projectId: navigation.projectId as Id<'projects'>, productionId: unlinked[0].productionId as Id<'productions'>, title: 'First production',
            });
        } else if (unlinked.length) return { success: false as const, error: 'Existing productions need an explicit episode mapping before a new episode can be added.' };
        const result = await convex.mutation(api.episodes.create, {
            projectId: navigation.projectId as Id<'projects'>, episodeNumber: input.episodeNumber, title: input.title,
            durationSeconds: input.durationSeconds, workflow: source?.workflow ?? navigation.workflow, inputMode: source?.mode ?? navigation.inputMode, language: source?.language ?? navigation.language,
            outputPreset: source?.outputPreset ?? (navigation.outputPreset === 'SQUARE' ? 'SQUARE' : navigation.outputPreset === 'LANDSCAPE' ? 'LANDSCAPE' : 'SOCIAL_VERTICAL'),
        });
        revalidatePath(`/dashboard/projects/${input.projectExternalId}`);
        return { success: true as const, episodeId: result.episodeId.toString(), productionId: result.productionId.toString() };
    } catch {
        return { success: false as const, error: 'The episode could not be created. Check its title, episode number, and 4–60 second duration, then try again.' };
    }
}

export async function getPlanningContinuityOptions(projectExternalId: string, productionId?: string): Promise<PlanningContinuityOptions> {
    const convex = await getAuthenticatedConvexClient();
    const project = await convex.query(api.projects.getByExternalId, { externalId: projectExternalId });
    if (!project) return { requiresBible: false, bibles: [], selectionError: 'Project not found.' };
    try {
        const [requirements, bibles] = await Promise.all([
            convex.query(api.continuity.planningRequirements, { projectId: project._id, productionId: productionId as Id<'productions'> | undefined }),
            convex.query(api.continuity.listBibles, { projectId: project._id, limit: 100 }),
        ]);
        return {
            productionId: requirements.productionId?.toString(), requiresBible: requirements.requiresBible,
            bibles: bibles.filter((bible) => bible.state === 'APPROVED').map((bible) => ({
                id: bible.bibleId.toString(), versionNumber: bible.versionNumber,
                referenceCount: bible.snapshot.resourceBindings.length, ruleCount: bible.snapshot.rules.length,
                rulePreview: bible.snapshot.rules.slice(0, 3).map((rule: string) => rule.slice(0, 240)),
                storyPreview: bible.snapshot.story.slice(0, 400), visualStylePreview: bible.snapshot.visualStyle.slice(0, 240),
            })), selectionError: null,
        };
    } catch {
        return { requiresBible: false, bibles: [], selectionError: 'Select the episode to plan from its project workspace.' };
    }
}

export async function refreshProjectEpisodeContinuity(projectExternalId: string, episodeId: string) {
    try {
        const convex = await getAuthenticatedConvexClient();
        const project = await convex.query(api.projects.getByExternalId, { externalId: projectExternalId });
        if (!project) return { success: false as const, error: 'Project not found.' };
        await convex.mutation(api.episodes.refreshContinuity, { projectId: project._id, episodeId: episodeId as Id<'episodes'> });
        revalidatePath(`/dashboard/projects/${projectExternalId}`);
        return { success: true as const };
    } catch {
        return { success: false as const, error: 'Approve the preceding episode’s current story state before refreshing continuity.' };
    }
}
