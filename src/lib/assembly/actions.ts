'use server';

import { createClient } from '@/lib/supabase/server';
import { getConvexClient } from '@/lib/convex/server';
import { api } from '../../../convex/_generated/api';

export async function createAssemblyJob(productionId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };
    try {
        const result = await getConvexClient().mutation(api.assembly.createJob, { ownerExternalId: user.id, productionId: productionId as any });
        return { success: true, jobId: result.jobId.toString(), manifest: result.manifest };
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Unable to create assembly job' }; }
}
