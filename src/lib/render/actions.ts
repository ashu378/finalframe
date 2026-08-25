'use server';

import { api } from '../../../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import type { RenderJob } from '@/lib/types/database';

async function resolveWorkspace(client: Awaited<ReturnType<typeof getAuthenticatedConvexClient>>, projectOrProductionId: string) {
    const byProject = await client.query(api.productions.getWorkspaceByProject, { projectExternalId: projectOrProductionId });
    if (byProject.production) return byProject;
    try {
        return await client.query(api.productions.getWorkspace, { productionId: projectOrProductionId as any });
    } catch {
        return byProject;
    }
}

export async function submitRenderJob(
    projectId: string,
    sceneId?: string
): Promise<{ success: boolean; jobId?: string; error?: string }> {
    try {
        const client = await getAuthenticatedConvexClient();
        const workspace = await resolveWorkspace(client, projectId);
        if (!workspace.production) return { success: false, error: 'We could not find this video project.' };
        const assembly = await client.mutation(api.assembly.createJob, {
            productionId: workspace.production._id,
            idempotencyKey: `assembly:${projectId}:${sceneId || 'all'}`,
        });
        const renderJob = await client.mutation(api.renderJobs.create, {
            productionId: workspace.production._id,
            manifestId: assembly.manifestId,
            operation: 'RENDER',
            preset: workspace.production.outputPreset,
            idempotencyKey: `render:${projectId}:${assembly.manifestId.toString()}:${sceneId || 'all'}`,
        });
        return { success: true, jobId: renderJob?._id?.toString() };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'We could not queue the finishing step.' };
    }
}

export async function getRenderJobs(projectId: string): Promise<{ success: boolean; jobs?: RenderJob[]; error?: string }> {
    try {
        const client = await getAuthenticatedConvexClient();
        const workspace = await resolveWorkspace(client, projectId);
        if (!workspace.production) return { success: true, jobs: [] };
        const jobs = await client.query(api.renderJobs.list, { productionId: workspace.production._id });
        return { success: true, jobs: jobs.map((job) => ({
            id: job._id.toString(),
            project_id: projectId,
            scene_id: null,
            status: job.status === 'COMPLETED' ? 'completed' : job.status === 'FAILED' || job.status === 'CANCELED' ? 'failed' : job.status === 'PROCESSING' || job.status === 'SUBMITTED' ? 'processing' : 'queued',
            input_params: { preset: job.preset, operation: job.operation, manifestId: job.manifestId?.toString() },
            output_result: job.exportUrl ? { video_url: job.exportUrl } : null,
            ai_models_used: null,
            ai_provider: null,
            cost_credits: job.actualCost ?? job.estimatedCost ?? 0,
            error_message: job.errorMessage ?? null,
            remix_locked: false,
            created_at: new Date(job.createdAt).toISOString(),
            updated_at: new Date(job.updatedAt).toISOString(),
            started_at: job.startedAt ? new Date(job.startedAt).toISOString() : null,
            completed_at: job.completedAt ? new Date(job.completedAt).toISOString() : null,
        } as RenderJob)) };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'We could not load finishing jobs.' };
    }
}

export async function resetStuckRender(projectId: string): Promise<{ success: boolean; error?: string }> {
    return resumeStuckJob(projectId);
}

export async function resumeStuckJob(projectId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const client = await getAuthenticatedConvexClient();
        const workspace = await resolveWorkspace(client, projectId);
        if (!workspace.production) return { success: false, error: 'We could not find this video project.' };
        const jobs = await client.query(api.renderJobs.list, { productionId: workspace.production._id });
        const stuck = jobs.filter((job) => job.status === 'FAILED' || job.status === 'RETRYING');
        for (const job of stuck) await client.mutation(api.renderJobs.retry, { jobId: job._id });
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'We could not resume the finishing jobs.' };
    }
}
