'use server';

import { api } from '../../../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';

export type AssemblySelection = {
    selectionScope?: 'FULL_PROJECT' | 'TIMELINE' | 'SCENES' | 'SHOTS';
    selectedSceneIds?: string[];
    shotVersionIds?: string[];
    confirmOlderVersions?: boolean;
};

export async function createAssemblyJob(productionId: string, selection: AssemblySelection = {}) {
    try {
        const client = await getAuthenticatedConvexClient();
        const account = await client.query(api.account.current, {});
        if (!account?.user) return { success: false, error: 'Unauthorized' };
        const result = await client.mutation(api.assembly.createJob, {
            productionId: productionId as any,
            selectionScope: selection.selectionScope,
            selectedSceneIds: selection.selectedSceneIds as any,
            shotVersionIds: selection.shotVersionIds as any,
            confirmOlderVersions: selection.confirmOlderVersions,
        });
        return { success: true, jobId: result.jobId?.toString(), manifest: result.manifest };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unable to create assembly job' };
    }
}
