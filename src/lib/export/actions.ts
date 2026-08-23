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
    void projectId;
    void snapshotId;
    void platform;
    void resolution;
    return { success: false, error: 'UNSUPPORTED_CONVEX_OPERATION: Export job creation is not exposed by the current Convex API.' };
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
