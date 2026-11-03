'use server';

import { api } from '../../../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import type { RenderJob } from '@/lib/types/database';
import { makeFunctionReference } from 'convex/server';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import type { FinishingRecoverySnapshot, FinishingProductionPage } from './recovery';

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
            selectionScope: sceneId ? 'SCENES' : 'FULL_PROJECT',
            selectedSceneIds: sceneId ? [sceneId as any] : undefined,
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
    void projectId;
    return { success: false, error: 'Choose an individual job in Finishing jobs to check whether it can be retried.' };
}

export async function resumeStuckJob(projectId: string): Promise<{ success: boolean; error?: string }> {
    return resetStuckRender(projectId);
}

export async function getFinishingProductions(projectId: string, cursor: string | null = null): Promise<{ success: boolean; choices?: FinishingProductionPage; error?: string }> {
    try {
        const client=await getAuthenticatedConvexClient();
        const result=await client.query(api.productions.listByProject,{projectExternalId:projectId,paginationOpts:{cursor,numItems:25}});
        return{success:true,choices:{page:result.page.map((production:Doc<'productions'>)=>({id:production._id.toString(),label:`${production.workflow.replaceAll('_',' ').slice(0,60)} · ${new Date(production.createdAt).toISOString().slice(0,10)} · ${production._id}`})),continueCursor:result.continueCursor,isDone:result.isDone}};
    } catch {return{success:false,error:'We could not load this project’s videos and episodes. Check your project access and try again.'};}
}

export async function getFinishingRecovery(projectId: string, productionId?: string): Promise<{ success: boolean; snapshot?: FinishingRecoverySnapshot; error?: string }> {
    try {
        const client = await getAuthenticatedConvexClient();
        const reference=makeFunctionReference<'query',{projectExternalId:string;productionId?:Id<'productions'>},FinishingRecoverySnapshot>('renderRecovery:list');
        return { success: true, snapshot: await client.query(reference,{projectExternalId:projectId,...(productionId?{productionId:productionId as Id<'productions'>}:{})}) };
    } catch {
        return { success: false, error: 'We could not load finishing jobs. Check your project access and episode selection.' };
    }
}

export async function retryFinishingJob(projectId: string, jobId: string, productionId?: string): Promise<{ success: boolean; retried: number; jobId?: string; error?: string }> {
    try {
        const client=await getAuthenticatedConvexClient();
        const reference=makeFunctionReference<'query',{projectExternalId:string;jobId:Id<'renderJobs'>;productionId?:Id<'productions'>},FinishingRecoverySnapshot>('renderRecovery:list');
        const snapshot=await client.query(reference,{projectExternalId:projectId,jobId:jobId as Id<'renderJobs'>,...(productionId?{productionId:productionId as Id<'productions'>}:{})});
        const job=snapshot.jobs.find(candidate=>candidate.id===jobId);
        if(!job?.canRetry)return{success:false,retried:0,error:job?.retryReason??'This finishing job is unavailable for retry.'};
        const result=await client.mutation(api.renderJobs.retry,{jobId:jobId as Id<'renderJobs'>});
        if(result?.status!=='QUEUED')return{success:false,retried:0,error:'The retry could not be confirmed. Refresh this job before trying again.'};
        return{success:true,retried:1,jobId};
    } catch {
        return{success:false,retried:0,error:'The retry could not be confirmed. Refresh this job and check your project access before trying again.'};
    }
}
