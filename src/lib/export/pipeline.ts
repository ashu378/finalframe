import { createClient } from '@/lib/supabase/server';

/**
 * Phase 5 Pipeline: Process Export Job
 * Handles the "Encoding" simulation and Final Delivery.
 */
export async function processExportJob(jobId: string) {
    const supabase = await createClient(); // Server context

    // 1. Fetch Job
    const { data: job } = await supabase
        .from('export_jobs')
        .select('*, project:projects(studio_id)')
        .eq('id', jobId)
        .single();

    if (!job) return;

    try {
        // Update Status -> Processing
        await supabase
            .from('export_jobs')
            .update({ status: 'processing' })
            .eq('id', jobId);

        throw new Error('Legacy export records require a completed Convex renderer artifact.');

    } catch (err) {
        console.error("Export Failed", err);

        // 4. Failure & Refund
        // Mark failed
        await supabase
            .from('export_jobs')
            .update({
                status: 'failed',
                error_message: err instanceof Error ? err.message : 'Unknown error'
            })
            .eq('id', jobId);

        // Refund Credits
        const studioId = (job.project as any)?.studio_id;
        if (studioId && job.credits_deducted > 0) {

            // Get current credits
            const { data: studio } = await supabase
                .from('studios')
                .select('credits')
                .eq('id', studioId)
                .single();

            if (studio) {
                // Update Balance
                await supabase
                    .from('studios')
                    .update({ credits: studio.credits + job.credits_deducted })
                    .eq('id', studioId);

                // Ledger Refund
                await supabase.from('credit_ledger').insert({
                    studio_id: studioId,
                    delta: job.credits_deducted,
                    reason: 'refund_export_failure',
                    reference_id: jobId
                });
            }
        }
    }
}
