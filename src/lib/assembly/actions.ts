'use server';

import { api } from '../../../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';

export async function createAssemblyJob(productionId: string) {
    try {
        const client = await getAuthenticatedConvexClient();
        const account = await client.query(api.account.current, {});
        if (!account?.user) return { success: false, error: 'Unauthorized' };
        const result = await client.mutation(api.assembly.createJob, { productionId: productionId as any });
        return { success: true, jobId: result.jobId.toString(), manifest: result.manifest };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unable to create assembly job' };
    }
}
