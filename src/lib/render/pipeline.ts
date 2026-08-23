import { createClient } from '@/lib/supabase/server';
import { executeAITask } from '@/lib/ai/engine';
import { getModelForCapability, ExecutionProfile } from '@/lib/ai/model-registry';
import type { FullProject, Scene, RenderJob } from '@/lib/types/database';

/**
 * Process a Render Job ("Magic Oven")
 * Reference: MASTER_PRD.md § 7 — AI Processing Pipeline
 * Reference: BUILD_PHASES.md — Phase 3 Render Pipeline
 * 
 * Orchestrates the AI rendering process:
 * 1. Locks job & Audits start
 * 2. Extracts Snapshot Context
 * 3. Iterates Scenes based on Strategy
 * 4. Saves result & Updates Project
 */
export async function processRenderJob(jobId: string, supabaseClient?: any) {
    console.log(`[Pipeline] >>> HEARTBEAT: Process started for Job: ${jobId}`);

    let supabase = supabaseClient;
    if (!supabase) {
        try {
            supabase = await createClient();
        } catch (err) {
            console.error('[Pipeline] FATAL: Could not initialize Supabase client for background task.', err);
            return;
        }
    }

    // 1. Fetch Job
    const { data: job, error: jobError } = await supabase
        .from('render_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

    if (jobError || !job) {
        console.error('[Pipeline] ERROR: Job not found', jobId);
        return;
    }

    // 2. Lock Job (Idempotency)
    if (job.status !== 'queued' && job.status !== 'processing') {
        console.warn('[Pipeline] WARNING: Job already processed or terminal', jobId);
        return;
    }

    // 2. Lock Job (Indempotency check)
    const workerId = Math.random().toString(36).substring(7);
    console.log(`[Pipeline] Locking job for processing (Worker: ${workerId})...`);
    await supabase
        .from('render_jobs')
        .update({
            status: 'processing',
            started_at: new Date().toISOString(),
            error_message: 'INITIALIZING_ENGINE',
            input_params: { ...job.input_params, active_worker: workerId }
        })
        .eq('id', jobId);

    const aiModelsUsed: Record<string, string> = {};
    const segments: { scene_id: string; url: string }[] = [];

    try {
        // --- STEP: PREPARE ASSETS ---
        await supabase.from('render_jobs').update({ error_message: 'PREPARING_ASSETS' }).eq('id', jobId);

        // Fetch all studio assets upfront for reference and validation
        const { data: projData } = await supabase.from('projects').select('studio_id').eq('id', job.project_id).single();
        const studioId = projData?.studio_id;
        const { data: allAssets } = await supabase.from('studio_assets').select('*').eq('studio_id', studioId);
        const assetsSnapshot: any[] = allAssets || [];

        // 3. Extract Context from Snapshot
        const { blueprint_snapshot, render_strategy: fallbackStrategy } = job.input_params;
        const scenes = blueprint_snapshot as Scene[];
        const jobStrategy = job.render_strategy || fallbackStrategy || 'TEXT_TO_VIDEO';

        if (!scenes || scenes.length === 0) {
            throw new Error('Missing blueprint snapshot in render job');
        }

        // Robust Project Fetch with Retry
        let project: FullProject | null = null;
        let attempt = 0;
        const maxRetries = 5;

        while (attempt < maxRetries) {
            const { data, error } = await supabase
                .from('projects')
                .select('*')
                .eq('id', job.project_id)
                .single();

            if (!error && data) {
                project = data;
                break;
            }
            console.warn(`[Pipeline] Project fetch attempt ${attempt + 1} failed: ${error?.message}`);
            attempt++;
            if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
        }

        if (!project) throw new Error('Project not found after retries');

        // --- STEP: VALIDATE SIGNALS ---
        await supabase.from('render_jobs').update({ error_message: 'VALIDATING_SIGNALS' }).eq('id', jobId);

        // --- SIGNAL VALIDATION GATE (MANDATORY) ---
        // Reference: Implementation Task — Feature: Signal Validation Gate
        const { validateProjectSignals } = await import('@/lib/project/signal-validator');
        const validation = await validateProjectSignals(job.project_id, supabase);
        if (!validation.success) {
            throw new Error(`RENDER ABORTED: Signal Validation Gate failed. ${validation.error}`);
        }
        console.log(`[Pipeline] Signal Validation Gate Passed for project ${job.project_id}`);

        // Phase 7.2: Derive ExecutionProfile from project context
        // Reference: MASTER_PRD.md § Model Selection & Execution Profiles
        await supabase.from('render_jobs').update({ error_message: 'CALIBRATING_ENGINES' }).eq('id', jobId);

        function deriveExecutionProfile(proj: any): ExecutionProfile {
            const type = proj.content_type;
            const quality = proj.quality_tier || 'standard';
            const platform = proj.platform;
            const context = proj.context;

            // 1. Premium / High-End
            if (quality === 'premium' || quality === 'cinematic') {
                return 'PREMIUM';
            }

            // 2. Cinematic
            if (type === 'commercial' && quality === 'standard') {
                return 'CINEMATIC';
            }

            // 3. Fast Social
            if (platform === 'tiktok' || platform === 'reels' || platform === 'x' || type === 'ugc') {
                return 'FAST_SOCIAL';
            }

            // 4. Default Commercial
            return 'COMMERCIAL';
        }

        const executionProfile = deriveExecutionProfile(project);
        console.log(`[Pipeline] Derived ExecutionProfile: ${executionProfile}`);

        const segments: Array<{ scene_id: string; url: string }> = [];

        // Phase 6.5: Loop through scenes to apply granular Camera/Motion control
        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];

            // --- WORKER HANDSHAKE CHECK ---
            const { data: verifyJob } = await supabase.from('render_jobs').select('input_params').eq('id', jobId).single();
            if (verifyJob?.input_params?.active_worker !== workerId) {
                console.warn(`[Pipeline] Worker ${workerId} PRE-EMPTED by ${verifyJob?.input_params?.active_worker}. Self-terminating.`);
                return;
            }

            const currentStatus = `SYNTHESIZING SCENE ${i + 1} OF ${scenes.length}`;
            console.log(`[Pipeline] >>> ${currentStatus}`);

            // --- RESUME LOGIC: SKIP IF ALREADY GENERATED ---
            const existingSegment = (job.output_result as any)?.segments?.find((s: any) => s.scene_id === scene.id);
            if (existingSegment && existingSegment.url) {
                console.log(`[Pipeline] RESUMING: Skipping Scene ${i + 1} (Found existing URL: ${existingSegment.url}).`);
                segments.push(existingSegment);

                // Still update status so UI progresses
                await supabase.from('render_jobs').update({ error_message: `SKIPPING_${currentStatus}_(RESUMED)` }).eq('id', jobId);
                continue;
            }

            await supabase.from('render_jobs').update({ error_message: currentStatus }).eq('id', jobId);

            let currentStrategy: any = jobStrategy;
            let initImageUrl: string | undefined;
            let initVideoUrl: string | undefined;

            // --- ROLE AWARE ENFORCEMENT (MASTER_PRD § 5.II) ---
            const backgroundAssetBinding = scene.scene_assets?.find(a => a.role === 'background');
            const videoSourceAssetBinding = scene.scene_assets?.find(a => a.role === 'video_source');

            // 1. If a background asset exists: Use Image -> Video
            if (backgroundAssetBinding) {
                const asset = assetsSnapshot.find(a => a.id === backgroundAssetBinding.asset_id);
                if (!asset || asset.type !== 'image') {
                    throw new Error(`VIOLATION: Scene ${scene.id} has background binding but asset is missing or not an image. (HARD FAILURE)`);
                }
                currentStrategy = 'IMAGE_TO_VIDEO';
                initImageUrl = asset.url;
                console.log(`[Pipeline] DETERMINISTIC: Using background asset for Scene ${scene.id} -> Strategy: IMAGE_TO_VIDEO`);
            }

            // 2. If a video_source asset exists: Use Video -> Video (Overrides background if both exist)
            if (videoSourceAssetBinding) {
                const asset = assetsSnapshot.find(a => a.id === videoSourceAssetBinding.asset_id);
                if (!asset || asset.type !== 'video') {
                    throw new Error(`VIOLATION: Scene ${scene.id} has video_source binding but asset is missing or not a video. (HARD FAILURE)`);
                }
                currentStrategy = 'VIDEO_TO_VIDEO';
                initVideoUrl = asset.url;
                console.log(`[Pipeline] DETERMINISTIC: Using video_source asset for Scene ${scene.id} -> Strategy: VIDEO_TO_VIDEO`);
            }

            // 3. Generative Background Placeholder logic
            // If NO background/video source and strategy is IMAGE_TO_VIDEO, generate a background
            if (!initImageUrl && !initVideoUrl && currentStrategy === 'IMAGE_TO_VIDEO') {
                const imagePrompt = `SCENE: ${scene.scene_title || 'Untitled'}. 
                VISUALS: ${scene.visual_description || scene.scene_text}. 
                STYLE: ${project.creative_dna_snapshot?.visual_style || 'Cinematic'}. 
                (Photorealistic, high-detail, 16:9 aspect ratio)`;

                const imageResult = await executeAITask('IMAGE_ENGINE', [
                    { role: 'system', content: 'Generate a photorealistic 16:9 image.' },
                    { role: 'user', content: imagePrompt }
                ]);

                if (!imageResult.content) throw new Error(`Image generation returned no media for scene ${scene.id}`);
                initImageUrl = imageResult.content;
                aiModelsUsed[`image_gen_${scene.id}`] = imageResult.modelUsed || imageResult.model || 'openrouter';
            }

            // Step B: Video Synthesis via Runway with ExecutionProfile
            const renderPrompt = `${scene.visual_description || scene.scene_text}. ACTION: ${scene.action_sequence || 'Subtle cinematic movement'}. EMOTION: ${scene.emotional_beat || 'Neutral'}`;

            const { executeVideoGeneration } = await import('@/lib/ai/engine');

            const runwayResult = await executeVideoGeneration(
                currentStrategy,
                renderPrompt,
                executionProfile,
                {
                    initImageUrl,
                    initVideoUrl,
                    cameraConfig: scene.camera_config,
                    motionConfig: scene.motion_config,
                    duration: 6,
                    sceneAssets: scene.scene_assets,
                    studioAssets: assetsSnapshot
                }
            );

            // Track model used (profile name only - model ID is internal to adapter)
            aiModelsUsed[`video_${scene.id}`] = `profile:${executionProfile}`;

            if (runwayResult.status === 'FAILED') {
                throw new Error(`Runway failed for scene ${scene.id}: ${runwayResult.error}`);
            }

            if (!runwayResult.videoUrl) throw new Error(`Video generation returned no media for scene ${scene.id}`);
            const videoUrl = runwayResult.videoUrl;
            segments.push({ scene_id: scene.id, url: videoUrl });

            // --- INCREMENTAL SAVE ---
            await supabase
                .from('render_jobs')
                .update({
                    output_result: {
                        video_url: segments[0].url,
                        segments: segments,
                        strategy_used: jobStrategy,
                        partial: i < scenes.length - 1
                    }
                })
                .eq('id', jobId);
        }

        // 6. Handle Success
        // For Phase 3, we just take the first segment as the "preview" or stitch them
        // We'll output the list of segments for the UI to handle (Phase 4 Editor supports layers)

        await supabase
            .from('render_jobs')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                output_result: {
                    video_url: segments[0].url, // Review visual
                    segments: segments,         // Full data
                    strategy_used: jobStrategy
                },
                ai_models_used: aiModelsUsed,
                cost_credits: segments.length * 20, // 20 credits per scene
            })
            .eq('id', jobId);

        // Update Project State
        await supabase
            .from('projects')
            .update({
                state: 'rendered',
                execution_locked: false
            })
            .eq('id', job.project_id);

    } catch (error) {
        console.error('Pipeline Error:', error);

        await supabase
            .from('render_jobs')
            .update({
                status: 'failed',
                error_message: error instanceof Error ? error.message : 'Unknown pipeline error',
                completed_at: new Date().toISOString(),
                ai_models_used: aiModelsUsed
            })
            .eq('id', jobId);

        await supabase
            .from('projects')
            .update({
                state: 'approved',
                execution_locked: false
            })
            .eq('id', job.project_id);
    }
}

/**
 * Constructs prompt for the Planning Model
 */
function constructExecutionPlanPrompt(project: FullProject, scenes: Scene[]): string {
    const branding = project.branding || { logo_url: 'Default', brand_colors: [] };
    const dna = project.creative_dna_snapshot;

    return `
PROJECT: ${project.name}
VISUAL_STYLE: ${dna?.visual_style || 'Standard'}
BRANDING_ASSETS: ${JSON.stringify(branding)}

SCENES_DATA:
${JSON.stringify(scenes, null, 2)}

TASK:
Create a frame-by-frame execution plan for a 15-second video.
Define timing, transitions, and asset placement.
Output strictly in JSON format.
`;
}
