'use server';

import { revalidatePath } from 'next/cache';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { api } from '../../../convex/_generated/api';
import type { Doc, Id } from '../../../convex/_generated/dataModel';

export interface EpisodeOption {
    productionId: string;
    episodeId?: string;
    episodeNumber?: number;
    title: string;
    continuityStatus?: 'CURRENT' | 'STALE';
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
    const latest = productionRows.at(-1);
    return {
        options, projectId: project._id.toString(), projectExternalId: project.externalId,
        nextEpisodeNumber: Math.max(0, ...episodeRows.map((value) => value.episodeNumber), episodeRows.length === 0 && productionRows.length === 1 ? 1 : 0) + 1,
        workflow: latest?.workflow || 'SOCIAL', inputMode: latest?.inputMode || 'IDEA',
        language: latest?.language || 'en', outputPreset: latest?.outputPreset || 'SOCIAL_VERTICAL',
    };
}

export async function createProjectEpisode(input: { projectExternalId: string; episodeNumber: number; title: string; durationSeconds: number }) {
    try {
        const navigation = await getEpisodeNavigation(input.projectExternalId);
        if (!navigation) return { success: false as const, error: 'Project not found.' };
        const convex = await getAuthenticatedConvexClient();
        const unlinked = navigation.options.filter((option) => !option.episodeId);
        if (unlinked.length === 1 && navigation.options.length === 1) {
            await convex.mutation(api.episodes.adoptLegacyProduction, {
                projectId: navigation.projectId as Id<'projects'>, productionId: unlinked[0].productionId as Id<'productions'>, title: 'First production',
            });
        } else if (unlinked.length) return { success: false as const, error: 'Existing productions need an explicit episode mapping before a new episode can be added.' };
        const result = await convex.mutation(api.episodes.create, {
            projectId: navigation.projectId as Id<'projects'>, episodeNumber: input.episodeNumber, title: input.title,
            durationSeconds: input.durationSeconds, workflow: navigation.workflow, inputMode: navigation.inputMode, language: navigation.language,
            outputPreset: navigation.outputPreset === 'SQUARE' ? 'SQUARE' : navigation.outputPreset === 'LANDSCAPE' ? 'LANDSCAPE' : 'SOCIAL_VERTICAL',
        });
        revalidatePath(`/dashboard/projects/${input.projectExternalId}`);
        return { success: true as const, episodeId: result.episodeId.toString(), productionId: result.productionId.toString() };
    } catch {
        return { success: false as const, error: 'The episode could not be created. Check its title, episode number, and 4–60 second duration, then try again.' };
    }
}

export async function getPlanningContinuityOptions(projectExternalId: string, productionId?: string) {
    const convex = await getAuthenticatedConvexClient();
    const project = await convex.query(api.projects.getByExternalId, { externalId: projectExternalId });
    if (!project) return { requiresBible: false, bibles: [], selectionError: 'Project not found.' };
    try {
        const [requirements, bibles] = await Promise.all([
            convex.query(api.continuity.planningRequirements, { projectId: project._id, productionId: productionId as Id<'productions'> | undefined }),
            convex.query(api.continuity.listBibles, { projectId: project._id, limit: 100 }),
        ]);
        return { requiresBible: requirements.requiresBible, bibles: bibles.filter((bible) => bible.state === 'APPROVED').map((bible) => ({ id: bible.bibleId.toString(), versionNumber: bible.versionNumber })), selectionError: null };
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
