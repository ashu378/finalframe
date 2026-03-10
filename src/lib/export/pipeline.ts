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

        // 2. Fetch Source Asset from Snapshot
        // In simulation, we grab the 'completed' asset from layer manifest or similar.
        // For now, valid snapshots usually map to a composed video URL in a real renderer.
        // We will grab the 'output_result' from the *original* render job linked to the snapshot?
        // Actually, snapshots link to `layer_manifest`. 
        // We'll simulate by creating a "signed" URL pointing to a placeholder or the project original asset.

        // Let's assume the snapshot has a 'composed_asset_url' if strictly defined, 
        // OR we just use a placeholder that clearly indicates status.
        // Mock Output: use a valid public video for testing the UI flow
        const mockOutputUrl = `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4`;

        // Simulate Encoding Delay (2 seconds)
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 3. Complete
        await supabase
            .from('export_jobs')
            .update({
                status: 'completed',
                output_url: mockOutputUrl,
                updated_at: new Date().toISOString()
            })
            .eq('id', jobId);

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
