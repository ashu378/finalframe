'use server';

import { api } from '../../../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { ExportPlatform, ExportResolution } from '@/lib/types/database';

export async function submitExportJob(
    projectId: string,
    snapshotId: string,
    platform: ExportPlatform,
    resolution: ExportResolution
): Promise<{ success: boolean; jobId?: string; outputUrl?: string; error?: string }> {
    try {
        const client = await getAuthenticatedConvexClient();
        const workspace = await client.query(api.productions.getWorkspaceByProject, { projectExternalId: projectId });
        if (!workspace.production) return { success: false, error: 'We could not find this video project.' };
        const assembly = await client.mutation(api.assembly.createJob, {
            productionId: workspace.production._id,
            idempotencyKey: `export-assembly:${projectId}:${snapshotId || 'current'}`,
        });
        const renderJob = await client.mutation(api.renderJobs.create, {
            productionId: workspace.production._id,
            manifestId: assembly.manifestId,
            operation: 'EXPORT',
            preset: `${platform}-${resolution}`,
            idempotencyKey: `export:${projectId}:${snapshotId || 'current'}:${platform}:${resolution}`,
        });
        return { success: true, jobId: renderJob?._id?.toString() };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'We could not queue this export.' };
    }
}

export async function getStudioCredits(projectId: string) {
    try {
        const client = await getAuthenticatedConvexClient();
        const workspace = await client.query(api.productions.getWorkspaceByProject, { projectExternalId: projectId });
        if (!workspace.production) return 0;
        return await client.query(api.credits.getBalance, { studioExternalId: workspace.production.studioExternalId });
    } catch {
        return 0;
    }
}
