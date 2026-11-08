'use server';

import { revalidatePath } from 'next/cache';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { api } from '../../../convex/_generated/api';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import { normalizeVideoType, VIDEO_TYPES, type VideoType } from '@/lib/ai/video-routing';
import { parseStartingMode } from '@/lib/templates/catalog';
import type { OutputPreset, ProductionInputMode, ProductionWorkflow } from '@/lib/types/database';
import { readPlanSettings } from './plan-settings';
import { normalizeOutputPresetId } from '../../../renderer/src/output-presets';

export interface EpisodeSettings {
    mode: ProductionInputMode;
    workflow: ProductionWorkflow;
    outputPreset: OutputPreset;
    language: string;
}

function supportedSettings(value: { inputMode: string; workflow: string; outputPreset: string; language: string }) {
    return Boolean(parseStartingMode(value.inputMode) && ['SOCIAL', 'COMEDY', 'BUSINESS_AD', 'FOOTAGE_TRANSFORM'].includes(value.workflow) && normalizeOutputPresetId(value.outputPreset) && /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value.language) && value.language.length <= 35);
}

class UnsupportedSettingsError extends Error {}

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

async function selectedProductionWorkspace(projectExternalId: string, productionId: string) {
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
    return { project, workspace, production };
}

export async function getSelectedProductionDefaults(projectExternalId: string, productionId: string): Promise<SelectedProductionDefaults | null> {
    const selected = await selectedProductionWorkspace(projectExternalId, productionId);
    if (!selected) return null;
    const { project, workspace, production } = selected;
    const candidatePlan = workspace.plan?.productionId === production._id ? workspace.plan : null;
    const selectedPlan=candidatePlan&&(!workspace.version?.sourcePlanId||workspace.version.sourcePlanId===candidatePlan._id)?candidatePlan:null;
    const input = selectedPlan?.input;
    const savedInput = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const isDraft=workspace.version?.status==='DRAFT'&&selectedPlan&&(!workspace.version.sourcePlanId||workspace.version.sourcePlanId===selectedPlan._id);
    let settings;try{settings=isDraft?readPlanSettings(savedInput,production):readPlanSettings({},production);}catch{throw new UnsupportedSettingsError('This draft has conflicting or unsupported settings. Review its selected duration, mode, workflow, format and language.');}
    const mode = parseStartingMode(settings.mode);
    const workflow = settings.workflow as ProductionWorkflow;
    const outputPreset = settings.outputPreset === 'SOCIAL_VERTICAL' ? 'SOCIAL_VERTICAL' : normalizeOutputPresetId(settings.outputPreset)!;
    if (!mode || !supportedSettings({...settings,inputMode:settings.mode}) || settings.requestedDurationSeconds < 4) throw new UnsupportedSettingsError('This older production needs explicit settings. Return to its workspace, choose New episode, then choose its mode, workflow, format, and language.');
    const brief = mode === 'SCRIPT' ? savedInput.script : savedInput.prompt;
    const draftVideoType = isDraft && typeof savedInput.videoType === 'string' && (VIDEO_TYPES as readonly string[]).includes(savedInput.videoType) ? savedInput.videoType as VideoType : undefined;
    return {
        projectExternalId: project.externalId, productionId, studioExternalId: production.studioExternalId,
        durationSeconds: settings.requestedDurationSeconds, mode, workflow, language: settings.language,
        outputPreset, videoType: draftVideoType ?? normalizeVideoType(production.projectType ?? project.projectType), brief: typeof brief === 'string' ? brief : '',
    };
}

export interface EpisodeOption {
    productionId: string;
    episodeId?: string;
    episodeNumber?: number;
    title: string;
    continuityStatus?: 'CURRENT' | 'STALE';
    settingsSupported?: boolean;
    continuityMode?: 'STORY_CONTINUATION' | 'PROJECT_IDENTITY';
    updatedAt?: number;
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
            settingsSupported: supportedSettings(production),
            continuityMode: episode?.continuityMode ?? 'STORY_CONTINUATION', updatedAt: episode?.updatedAt,
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

export async function createProjectEpisode(input: { projectExternalId: string; episodeNumber: number; title: string; durationSeconds: number; sourceProductionId?: string; settings?: EpisodeSettings; continuityMode?: 'STORY_CONTINUATION' | 'PROJECT_IDENTITY' }) {
    try {
        if (input.continuityMode !== undefined && !['STORY_CONTINUATION', 'PROJECT_IDENTITY'].includes(input.continuityMode)) return { success: false as const, error: 'Choose how this episode relates to the project.' };
        if (!Number.isInteger(input.episodeNumber) || input.episodeNumber < 1 || input.episodeNumber > 500 || !Number.isFinite(input.durationSeconds) || input.durationSeconds < 4 || input.durationSeconds > 60 || typeof input.title !== 'string' || !input.title.trim() || input.title.trim().length > 160) return { success: false as const, error: 'Enter a title, episode number from 1–500, and a duration from 4–60 seconds.' };
        const navigation = await getEpisodeNavigation(input.projectExternalId);
        if (!navigation) return { success: false as const, error: 'Project not found.' };
        const sourceId = input.sourceProductionId;
        const selected = sourceId ? await selectedProductionWorkspace(input.projectExternalId, sourceId) : null;
        if (sourceId && !selected) return { success: false as const, error: 'Choose a source episode from this project.' };
        let settings: EpisodeSettings;
        if (input.settings) {
            if (!['IDEA', 'SCRIPT', 'VOICE', 'IMAGES', 'FOOTAGE', 'AD'].includes(input.settings.mode) || !supportedSettings({ ...input.settings, inputMode: input.settings.mode }) || !input.settings.outputPreset || input.settings.outputPreset !== 'SOCIAL_VERTICAL' && input.settings.outputPreset !== normalizeOutputPresetId(input.settings.outputPreset)) return { success: false as const, requiresSettings: true, error: 'Choose a supported mode, workflow, format, and language code (for example en, pcm, or fr) for this episode.' };
            settings = input.settings;
        } else {
            const draftDefaults=selected?await getSelectedProductionDefaults(input.projectExternalId,selected.production._id):null;
            const saved = draftDefaults?{inputMode:draftDefaults.mode,workflow:draftDefaults.workflow,outputPreset:draftDefaults.outputPreset,language:draftDefaults.language}:selected?.production ?? { inputMode: navigation.inputMode, workflow: navigation.workflow, outputPreset: navigation.outputPreset, language: navigation.language };
            if (!supportedSettings(saved)) throw new UnsupportedSettingsError();
            settings = { mode: parseStartingMode(saved.inputMode)!, workflow: saved.workflow as ProductionWorkflow, language: saved.language, outputPreset: saved.outputPreset === 'SOCIAL_VERTICAL' ? 'SOCIAL_VERTICAL' : normalizeOutputPresetId(saved.outputPreset)! };
        }
        const convex = await getAuthenticatedConvexClient();
        const unlinked = navigation.options.filter((option) => !option.episodeId);
        if (unlinked.length === 1 && navigation.options.length === 1) {
            await convex.mutation(api.episodes.adoptLegacyProduction, {
                projectId: navigation.projectId as Id<'projects'>, productionId: unlinked[0].productionId as Id<'productions'>, title: 'First production',
            });
        } else if (unlinked.length) return { success: false as const, error: 'Existing productions need an explicit episode mapping before a new episode can be added.' };
        const result = await convex.mutation(api.episodes.create, {
            projectId: navigation.projectId as Id<'projects'>, episodeNumber: input.episodeNumber, title: input.title,
            durationSeconds: input.durationSeconds, workflow: settings.workflow, inputMode: settings.mode, language: settings.language,
            outputPreset: settings.outputPreset,
            ...(input.continuityMode ? { continuityMode: input.continuityMode } : {}),
        });
        revalidatePath(`/dashboard/projects/${input.projectExternalId}`);
        return { success: true as const, episodeId: result.episodeId.toString(), productionId: result.productionId.toString() };
    } catch (error) {
        if (error instanceof UnsupportedSettingsError) return { success: false as const, requiresSettings: true, error: 'This source has older settings. Enable explicit episode settings and choose its mode, workflow, format, and language. Existing project references and approved episodes stay unchanged.' };
        return { success: false as const, error: 'The episode could not be created. Check its title, episode number, and 4–60 second duration, then try again.' };
    }
}

export async function changeProjectEpisodeRelationship(input: { projectExternalId: string; episodeId: string; continuityMode: 'STORY_CONTINUATION' | 'PROJECT_IDENTITY'; expectedUpdatedAt: number }) {
    try {
        if (!['STORY_CONTINUATION', 'PROJECT_IDENTITY'].includes(input.continuityMode) || !Number.isFinite(input.expectedUpdatedAt)) return { success: false as const, error: 'Choose a relationship and reload the current episode before saving.' };
        const convex = await getAuthenticatedConvexClient();
        const project = await convex.query(api.projects.getByExternalId, { externalId: input.projectExternalId });
        if (!project) return { success: false as const, error: 'Project not found.' };
        const result = await convex.mutation(api.episodes.changeContinuityMode, { projectId: project._id, episodeId: input.episodeId as Id<'episodes'>, continuityMode: input.continuityMode, expectedUpdatedAt: input.expectedUpdatedAt });
        revalidatePath(`/dashboard/projects/${input.projectExternalId}`);
        revalidatePath('/dashboard/create');
        return { success: true as const, requiresNewPlan: result.requiresNewPlan };
    } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const safe = /(Approved or assembled episodes keep their relationship\. Create a new episode instead\.|This episode changed\. Reload before changing its relationship\.|The current plan cannot change relationship\. Create a new episode instead\.)/.exec(message)?.[0];
        return { success: false as const, error: safe ?? 'This relationship could not be changed. Reload the episode and check project permissions.' };
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
