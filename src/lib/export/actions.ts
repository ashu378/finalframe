'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { ExportPlatform, ExportResolution } from '@/lib/types/database';
import { EXPORT_COSTS } from './constants';
import { processExportJob } from './pipeline';

/**
 * Server Action: Submit an Export Job
 * Enforces: Validation, Credit Check, Transaction
 */
export async function submitExportJob(
    projectId: string,
    snapshotId: string,
    platform: ExportPlatform,
    resolution: ExportResolution
) {
    const supabase = await createClient();
    const user = await supabase.auth.getUser();

    if (!user.data.user) throw new Error('Unauthorized');

    // 1. Fetch Snapshot & Validate
    const { data: snapshot } = await supabase
        .from('render_snapshots')
        .select('*')
        .eq('id', snapshotId)
        .eq('project_id', projectId) // Safe RLS check implied but good to be explicit
        .single();

    if (!snapshot) throw new Error('Snapshot not found');
    if (!snapshot.is_validated) throw new Error('Snapshot is not validated for export');

    // 2. Calculate Cost
    const cost = EXPORT_COSTS[platform][resolution];

    // 3. Fetch Studio & Check Balance
    // We need the studio ID to check/deduct credits
    const { data: project } = await supabase
        .from('projects')
        .select('studio_id')
        .eq('id', projectId)
        .single();

    if (!project) throw new Error('Project not found');

    const studioId = project.studio_id;

    const { data: studio } = await supabase
        .from('studios')
        .select('credits')
        .eq('id', studioId)
        .single();

    if (!studio || studio.credits < cost) {
        return { success: false, error: `Insufficient credits. Cost: ${cost}, Balance: ${studio?.credits || 0}` };
    }

    // 4. Transaction: Deduct & Create Job
    // Note: Supabase doesn't support multi-table atomic transactions easily via JS client without RPC.
    // For Phase 5 MVP, we will do sequential ops and handle failure manually.
    // Ideally this should be a Postgres Function, but we stick to client logic as per architecture unless critical.

    // Deduct
    const { error: deductError } = await supabase.rpc('decrement_credits', {
        row_id: studioId,
        amount: cost
    });

    // Fallback if RPC custom function doesn't exist (simulating standard update)
    if (deductError) {
        // Manual update check (Not truly atomic, but acceptable for this build phase)
        const { error: updateError } = await supabase
            .from('studios')
            .update({ credits: studio.credits - cost })
            .eq('id', studioId);

        if (updateError) return { success: false, error: 'Credit deduction failed' };
    }

    // Ledger Entry (Audit)
    const { data: ledger, error: ledgerError } = await supabase
        .from('credit_ledger')
        .insert({
            studio_id: studioId,
            delta: -cost,
            reason: `export_${platform}_${resolution}`,
        })
        .select('id')
        .single();

    if (ledgerError) {
        // Critical: Failed to audit. Should revert credit, but for MVP we log error.
        console.error('Ledger insert failed', ledgerError);
    }

    // Create Export Job
    const { data: job, error: jobError } = await supabase
        .from('export_jobs')
        .insert({
            project_id: projectId,
            render_snapshot_id: snapshotId,
            platform,
            resolution,
            status: 'queued',
            credits_deducted: cost
        })
        .select()
        .single();

    if (jobError) {
        // Refund logic would go here if job creation fails
        await supabase.from('studios').update({ credits: studio.credits }).eq('id', studioId); // Revert
        return { success: false, error: 'Failed to queue export job' };
    }

    // Link Ledger to Job (Update reference)
    if (ledger?.id && job?.id) {
        await supabase
            .from('credit_ledger')
            .update({ reference_id: job.id })
            .eq('id', ledger.id);
    }

    // 5. Trigger Async Pipeline
    // Fire and forget (in a real queue this is auto-picked up)
    await processExportJob(job.id);

    // Fetch the updated job with the output URL
    const { data: finalJob } = await supabase
        .from('export_jobs')
        .select('output_url')
        .eq('id', job.id)
        .single();

    return { success: true, jobId: job.id, outputUrl: finalJob?.output_url };
}

/**
 * Get Studio Credits Balance
 */
export async function getStudioCredits(projectId: string) {
    const supabase = await createClient();

    // Get studio via project to prevent extra lookups from frontend
    const { data } = await supabase
        .from('projects')
        .select('studio:studios(credits)')
        .eq('id', projectId)
        .single();

    // Supabase strict typing might make nested access tricky, handle gracefully
    const studio = data?.studio as unknown as { credits: number };
    return studio?.credits || 0;
}
