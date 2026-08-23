'use server';

import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { api } from '../../../convex/_generated/api';
import { isValidTransition, validateTransition, InvalidStateTransitionError } from '@/lib/project/state-machine';
import type { ProjectState, FullProject, CreativeDNASnapshot, MessageBlocksSnapshot, ProjectContentType } from '@/lib/types/database';

type ConvexProject = {
    _id: string;
    externalId: string;
    studioExternalId: string;
    name: string;
    description?: string;
    status?: string;
    metadata?: Record<string, unknown>;
    createdAt: number;
    updatedAt: number;
};

function stateFor(status?: string): ProjectState {
    const map: Record<string, ProjectState> = {
        DRAFT: 'draft', PLANNING: 'draft', READY: 'blueprint_ready',
        APPROVED: 'approved', IN_PROGRESS: 'rendering', PROCESSING: 'rendering',
        COMPLETED: 'rendered', EXPORTED: 'exported', ARCHIVED: 'archived',
    };
    return map[status || 'DRAFT'] || 'draft';
}

function projectFromConvex(project: ConvexProject): FullProject {
    const metadata = project.metadata || {};
    return {
        id: project.externalId,
        studio_id: project.studioExternalId,
        name: project.name,
        state: stateFor(project.status),
        outcome_goal: (metadata.outcomeGoal as FullProject['outcome_goal']) || null,
        platform: (metadata.platform as FullProject['platform']) || null,
        content_type: (metadata.contentType as FullProject['content_type']) || null,
        project_description: project.description || null,
        context: (metadata.context as FullProject['context']) || null,
        identity_presence: (metadata.identityPresence as FullProject['identity_presence']) || null,
        actor_id: (metadata.actorId as string) || null,
        actor_locked: Boolean(metadata.actorLocked),
        creative_dna_snapshot: (metadata.creativeDnaSnapshot as CreativeDNASnapshot) || null,
        message_blocks_snapshot: (metadata.messageBlocksSnapshot as MessageBlocksSnapshot) || null,
        branding: (metadata.branding as FullProject['branding']) || null,
        execution_locked: Boolean(metadata.executionLocked),
        aspect_ratio: (metadata.aspectRatio as string) || null,
        is_shared: Boolean(metadata.isShared),
        creative_dna_context: (metadata.creativeDnaContext as string) || null,
        created_at: new Date(project.createdAt).toISOString(),
        updated_at: new Date(project.updatedAt).toISOString(),
        archived_at: (metadata.archivedAt as string) || null,
        deleted_at: (metadata.deletedAt as string) || null,
    };
}

async function currentStudio() {
    const convex = await getAuthenticatedConvexClient();
    const current = await convex.query(api.account.current, {});
    if (!current.studio) return { convex, studio: null };
    return { convex, studio: current.studio };
}

async function findProject(projectId: string) {
    const { convex, studio } = await currentStudio();
    if (!studio) return { convex, studio: null, project: null };
    const projects = await convex.query(api.projects.list, { studioExternalId: studio.externalId });
    const project = projects.find((row) => row.externalId === projectId || row._id === projectId);
    return { convex, studio, project };
}

export async function createProject(options: {
    name: string;
    contentType: ProjectContentType;
    description: string;
    outcomeGoal?: string;
    platform?: string;
    context?: string;
    dnaOverride?: Partial<CreativeDNASnapshot>;
    blocksOverride?: Partial<MessageBlocksSnapshot>;
    identityPresence?: string;
}): Promise<{ success: boolean; projectId?: string; error?: string }> {
    try {
        const { convex, studio } = await currentStudio();
        if (!studio) return { success: false, error: 'Studio setup is required before creating a project' };
        const project = await convex.mutation(api.projects.create, {
            name: options.name.trim(),
            description: options.description.trim(),
            contentType: options.contentType,
            outcomeGoal: options.outcomeGoal,
        });
        return { success: true, projectId: project.externalId };
    } catch (error) {
        console.error('Convex createProject failed:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to create project' };
    }
}

export async function getProjectsForUser(): Promise<{ success: boolean; projects?: FullProject[]; error?: string }> {
    try {
        const { convex, studio } = await currentStudio();
        if (!studio) return { success: true, projects: [] };
        const projects = await convex.query(api.projects.list, { studioExternalId: studio.externalId });
        return { success: true, projects: projects.map(projectFromConvex) };
    } catch (error) {
        console.error('Convex getProjectsForUser failed:', error);
        return { success: false, error: 'Failed to fetch projects' };
    }
}

export async function getProjectById(projectId: string): Promise<{ success: boolean; project?: FullProject; error?: string }> {
    try {
        const { project } = await findProject(projectId);
        if (!project) return { success: false, error: 'Project not found' };
        return { success: true, project: projectFromConvex(project) };
    } catch (error) {
        console.error('Convex getProjectById failed:', error);
        return { success: false, error: 'Project not found' };
    }
}

function unsupportedMutation(operation: string): { success: false; error: string } {
    return { success: false, error: `${operation} is not available in the current Convex project contract.` };
}

export async function updateProject(projectId: string, data: { name?: string; description?: string; content_type?: ProjectContentType; outcome_goal?: any }): Promise<{ success: boolean; error?: string }> {
    const result = await findProject(projectId);
    if (!result.project) return { success: false, error: 'Project not found' };
    void data;
    return unsupportedMutation('Updating a project');
}

export async function archiveProject(projectId: string): Promise<{ success: boolean; error?: string }> {
    const result = await findProject(projectId);
    if (!result.project) return { success: false, error: 'Project not found' };
    return unsupportedMutation('Archiving a project');
}

export async function deleteProject(projectId: string): Promise<{ success: boolean; error?: string }> {
    return archiveProject(projectId);
}

export async function transitionProjectState(projectId: string, newState: ProjectState): Promise<{ success: boolean; error?: string }> {
    const result = await findProject(projectId);
    if (!result.project) return { success: false, error: 'Project not found' };
    try {
        validateTransition(stateFor(result.project.status), newState);
    } catch (error) {
        if (error instanceof InvalidStateTransitionError) return { success: false, error: error.message };
        throw error;
    }
    return unsupportedMutation('Changing project state');
}

export async function approveBlueprint(projectId: string): Promise<{ success: boolean; error?: string }> {
    const result = await findProject(projectId);
    if (!result.project) return { success: false, error: 'Project not found' };
    if (!isValidTransition(stateFor(result.project.status), 'approved')) {
        return { success: false, error: 'The project is not ready for blueprint approval' };
    }
    return unsupportedMutation('Approving a blueprint');
}

export async function getSnapshotsForProject(projectId: string): Promise<any[]> {
    const result = await findProject(projectId);
    return result.project ? [] : [];
}

export async function getStudioContext(): Promise<{ success: boolean; studioId?: string; defaults?: any; dna?: any; blocks?: any; error?: string }> {
    try {
        const { studio } = await currentStudio();
        if (!studio) return { success: false, error: 'Studio not found' };
        return { success: true, studioId: studio.externalId, defaults: studio.metadata || {}, dna: undefined, blocks: undefined };
    } catch (error) {
        console.error('Convex getStudioContext failed:', error);
        return { success: false, error: 'Unauthorized' };
    }
}

export async function unlockBlueprint(projectId: string): Promise<{ success: boolean; error?: string }> {
    const result = await findProject(projectId);
    if (!result.project) return { success: false, error: 'Project not found' };
    return unsupportedMutation('Unlocking a blueprint');
}

