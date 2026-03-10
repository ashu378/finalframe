'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { parseRemixIntent } from './parser';
import type { RemixLayerType } from '@/lib/types/database';

/**
 * server action to submit a remix job
 * Reference: Phase 4 - Remix Flow
 */
export async function submitRemixJob(projectId: string, renderJobId: string, query: string) {
    const supabase = await createClient();
    const user = await supabase.auth.getUser();

    if (!user.data.user) {
        throw new Error('Unauthorized');
    }

    // 1. Check Locks
    const { data: renderJob } = await supabase
        .from('render_jobs')
        .select('remix_locked, project_id')
        .eq('id', renderJobId)
        .single();

    if (!renderJob) throw new Error('Render job not found');
    if (renderJob.project_id !== projectId) throw new Error('Project mismatch');

    // Check Project Lock (Global guard)
    const { data: project } = await supabase.from('projects').select('execution_locked').eq('id', projectId).single();
    if (project?.execution_locked) {
        throw new Error('Project is locked for execution. Please wait.');
    }

    if (renderJob.remix_locked) {
        throw new Error('Remix in progress. Please wait.');
    }

    // 2. Parse Intent (Strict)
    const parsed = await parseRemixIntent(query);

    // 3. Estimate Cost
    const cost = getCostForLayer(parsed.target_layer);

    // 4. Create Job & Lock
    // We transactionally lock and insert to prevent races (best effort with Supabase calls)
    await supabase
        .from('render_jobs')
        .update({ remix_locked: true })
        .eq('id', renderJobId);

    const { data: job, error } = await supabase
        .from('remix_jobs')
        .insert({
            project_id: projectId,
            render_job_id: renderJobId,
            status: 'queued',
            intent: query,
            target_layer: parsed.target_layer,
            operation: parsed.operation,
            parameters: parsed.parameters,
            cost_credits: cost
        })
        .select()
        .single();

    if (error) {
        // Unlock if insert failed
        await supabase.from('render_jobs').update({ remix_locked: false }).eq('id', renderJobId);
        throw new Error(`Failed to create job: ${error.message}`);
    }

    // 5. Trigger Pipeline (Async)
    import('@/lib/remix/pipeline').then(mod => {
        (mod as any).processRemixJob(job.id).catch((err: any) => console.error('Remix Pipeline Error:', err));
    });

    revalidatePath(`/dashboard/projects/${projectId}/editor`);
    return { success: true, jobId: job.id, parsedIntent: parsed };
}

/**
 * Estimate cost without submitting
 * Reference: Phase 4 Upgrade - Cost Estimation
 */
export async function estimateRemixCost(query: string) {
    try {
        const parsed = await parseRemixIntent(query);
        const cost = getCostForLayer(parsed.target_layer);
        return { cost, parsed };
    } catch (err) {
        return { error: 'Could not parse intent' };
    }
}

function getCostForLayer(layer: RemixLayerType): number {
    switch (layer) {
        case 'text': return 1;
        case 'audio': return 2;
        case 'background': return 5;
        case 'overlay': return 3;
        case 'actor': return 10;
        case 'motion': return 5;
        default: return 1;
    }
}

export async function checkRemixStatus(renderJobId: string) {
    const supabase = await createClient();
    const { data } = await supabase
        .from('render_jobs')
        .select('remix_locked')
        .eq('id', renderJobId)
        .single();

    return data?.remix_locked ?? false;
}
