import { createClient } from '@/lib/supabase/server';
import { executeAITask } from '@/lib/ai/engine';
import { AICapability } from '@/lib/ai/model-registry';
import type { RemixJob, RemixLayerType, RenderLayer } from '@/lib/types/database';

/**
 * Orchestrates the Remix Process
 * Phase 4 Core Logic
 */
export async function processRemixJob(jobId: string) {
    const supabase = await createClient();

    // 1. Fetch Job
    const { data: job, error } = await supabase
        .from('remix_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

    if (error || !job) {
        console.error('Remix Pipeline: Job not found', jobId);
        return;
    }

    // 2. Lock / Status Check
    if (job.status !== 'queued') return;

    await supabase
        .from('remix_jobs')
        .update({ status: 'processing' })
        .eq('id', jobId);

    try {
        // 3. Fetch Context (Original Layer)
        // We need the current active layer for this type
        // In a real system, we'd query render_snapshots to find the *current* version.
        // For MVP Phase 4, we query the most recent render_layer of this type for this render_job.
        const { data: currentLayer } = await supabase
            .from('render_layers')
            .select('*')
            .eq('render_job_id', job.render_job_id)
            .eq('layer_type', job.target_layer)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        // If no layer exists (e.g. adding new overlay), that's fine.
        const currentAsset = currentLayer?.asset_url || 'None';

        // 4. Route to Locked Capability
        let capability: AICapability = 'AI_BRAIN'; // Default (Text, Motion, Audio logic)
        if (['background', 'overlay', 'actor'].includes(job.target_layer)) capability = 'IMAGE_ENGINE';

        // 5. Execute Remix
        const prompt = `
        ORIGINAL_ASSET: ${currentAsset}
        INTENT: ${job.intent}
        OPERATION: ${job.operation}
        PARAMS: ${JSON.stringify(job.parameters)}
        
        Execute the remix. output the new content or URL.
        `;

        const result = await executeAITask(capability, [
            { role: 'system', content: 'You are a creative remix engine.' },
            { role: 'user', content: prompt }
        ]);

        // 6. Validation (Safety Check)
        // Phase 4 Requirement: Validation before Snapshot
        const validation = await executeAITask('VALIDATOR_ENGINE', [
            { role: 'system', content: 'Verify if the content is safe and matches intent.' },
            { role: 'user', content: `INPUT: ${job.intent}\nOUTPUT: ${result.content}` }
        ]);

        const validationContent = validation.content || '';
        if (validationContent.includes('UNSAFE')) {
            throw new Error('Remix rejected by safety filters.');
        }

        // 7. Persist New Layer
        // Mocking URL generation if text model returned description
        const content = result.content || 'No content generated';
        const newAssetUrl = content.startsWith('http') ? content : `https://mock-asset.com/${Date.now()}.png`;

        const { data: newLayer, error: layerError } = await supabase
            .from('render_layers')
            .insert({
                project_id: job.project_id,
                render_job_id: job.render_job_id,
                layer_type: job.target_layer,
                asset_url: newAssetUrl,
                metadata: {
                    generated_by: capability,
                    full_response: content
                },
                is_original: false
            })
            .select()
            .single();

        if (layerError) throw layerError;

        // 8. Create Snapshot (Manifest)
        // Link all current layers (latest of each type)
        // We fetch latest of ALL types
        // This is a simplification; ideally we copy previous snapshot and update one key.
        const { data: allLayers } = await supabase
            .from('render_layers')
            .select('id, layer_type')
            .eq('render_job_id', job.render_job_id)
            .order('created_at', { ascending: false }); // We need to filter distinct on client or distinct query

        // Construct manifest: { type: id }
        const manifest: Record<string, string> = {};
        // Iterate and pick first occurrence (latest)
        allLayers?.forEach((row: any) => {
            if (!manifest[row.layer_type]) {
                manifest[row.layer_type] = row.id;
            }
        });

        await supabase.from('render_snapshots').insert({
            project_id: job.project_id,
            render_job_id: job.render_job_id,
            label: `Remix: ${job.intent}`,
            layer_manifest: manifest
        });

        // 9. Complete Job
        await supabase
            .from('remix_jobs')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                ai_models_used: { [capability]: result.modelUsed }
            })
            .eq('id', jobId);

    } catch (err) {
        console.error('Remix Failed:', err);
        await supabase
            .from('remix_jobs')
            .update({
                status: 'failed',
                error_message: err instanceof Error ? err.message : 'Unknown error',
                completed_at: new Date().toISOString()
            })
            .eq('id', jobId);
    } finally {
        // 10. Unlock Render Job
        await supabase
            .from('render_jobs')
            .update({ remix_locked: false })
            .eq('id', job.render_job_id);
    }
}
