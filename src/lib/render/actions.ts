'use server';

/**
 * FinalFrame — Render Pipeline Actions
 * Reference: MASTER_PRD.md § 7 — AI Processing Pipeline
 * Reference: BUILD_PHASES.md — Phase 3 Render Pipeline
 */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { AICapability } from '@/lib/ai/model-registry';
import type { RenderJob } from '@/lib/types/database';
import { processRenderJob } from './pipeline';

export async function submitRenderJob(
    projectId: string,
    sceneId?: string
): Promise<{ success: boolean; jobId?: string; error?: string }> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return { success: false, error: 'Unauthorized: User session not found' };
        }

        // Get project and verify ownership + logic state
        // Fetch Project with Retry
        let project = null;
        let pAttempts = 0;
        const maxPAttempts = 5;
        while (pAttempts < maxPAttempts) {
            const { data, error: pError } = await supabase.from('projects').select('*').eq('id', projectId).single();
            if (data && !pError) { project = data; break; }
            pAttempts++;
            if (pAttempts < maxPAttempts) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, pAttempts)));
        }
        if (!project) return { success: false, error: 'Project not found in database (after retries)' };

        // Verify studio ownership
        const { data: studio } = await supabase
            .from('studios')
            .select('id')
            .eq('id', project.studio_id)
            .eq('user_id', user.id)
            .single();

        if (!studio) return { success: false, error: 'Access denied: Studio ownership failed' };

        // --- SUBMISSION GUARD ---
        // 1. Check project state
        if (project.state === 'rendering') {
            return { success: false, error: 'ACTIVE_SESSION_EXISTS: This project is already being processed by the AI Engine.' };
        }

        // 2. Check for active jobs (queued or processing)
        const { data: activeJobs } = await supabase
            .from('render_jobs')
            .select('id, status')
            .eq('project_id', projectId)
            .in('status', ['queued', 'processing'])
            .limit(1);

        if (activeJobs && activeJobs.length > 0) {
            return { success: false, error: 'SIGNAL_ALREADY_QUEUED: A render job is already in the orchestration queue.' };
        }

        // Validations (Phase 2 Exit Rule)
        const { validateProjectSignals } = await import('@/lib/project/signal-validator');
        const validation = await validateProjectSignals(projectId);
        if (!validation.success) {
            return { success: false, error: `SIGNAL GATE REJECTION: ${validation.error}` };
        }

        // Fetch Scenes with Retry
        let scenes = null;
        let sAttempts = 0;
        const maxSAttempts = 5;
        while (sAttempts < maxSAttempts) {
            const { data, error: sError } = await supabase
                .from('scenes')
                .select('*')
                .eq('project_id', projectId)
                .order('order_index', { ascending: true });
            if (data && data.length > 0 && !sError) { scenes = data; break; }
            sAttempts++;
            if (sAttempts < maxSAttempts) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, sAttempts)));
        }
        if (!scenes || scenes.length === 0) {
            return { success: false, error: 'No scenes found to satisfy master output (after retries)' };
        }

        // Create Render Job
        const { data: job, error } = await supabase
            .from('render_jobs')
            .insert({
                project_id: projectId,
                scene_id: sceneId || null,
                status: 'queued',
                input_params: {
                    prompt_context: "Full project render",
                    blueprint_snapshot: scenes,
                    primary_capability: 'VIDEO_ENGINE' as AICapability,
                    render_strategy: 'TEXT_TO_VIDEO'
                },
                ai_models_used: {},
                ai_provider: 'runway',
                cost_credits: 0
            })
            .select('id')
            .single();

        if (error || !job) {
            console.error('[Render Action] Supabase Insert Error:', error);
            return { success: false, error: `DATABASE_FAILURE: ${error?.message || 'Insertion failed'}` };
        }

        // Transition Project State
        const { error: stateError } = await supabase
            .from('projects')
            .update({
                state: 'rendering',
                execution_locked: true
            })
            .eq('id', projectId);

        if (stateError) {
            console.error('[Render Action] State Update Error:', stateError);
        }

        // Lock Job status to processing immediately to avoid UI "stucking" in queued
        const { error: jobLockError } = await supabase
            .from('render_jobs')
            .update({
                status: 'processing',
                started_at: new Date().toISOString()
            })
            .eq('id', job.id);

        if (jobLockError) {
            console.error('[Render Action] Job Lock Error:', jobLockError);
        }

        console.log(`[Render Action] >>> EXECUTING PIPELINE HAND-OFF: Job ${job.id}`);

        // Fire background pipeline
        import('@/lib/render/pipeline').then(mod => {
            console.log('[Render Action] Pipeline module imported, calling processRenderJob...');
            (mod as any).processRenderJob(job.id, supabase).catch((err: any) => {
                console.error('[Render Action] Background pipeline error caught:', err);
            });
        }).catch(err => {
            console.error('[Render Action] Failed to import pipeline module:', err);
        });

        revalidatePath(`/dashboard/projects/${projectId}`);
        return { success: true, jobId: job.id };
    } catch (e: any) {
        console.error('[Render Action] Fatal Catch:', e);
        return { success: false, error: `FATAL_SERVER_ERROR: ${e.message || 'Unknown'}` };
    }
}

/**
 * Get render jobs for a project
 */
export async function getRenderJobs(projectId: string): Promise<{ success: boolean; jobs?: RenderJob[]; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { success: false, error: 'Unauthorized' };

    // Verify project access check (RLS handles this but good to be explicit if needed)
    // optimization: relies on RLS
    const { data: jobs, error } = await supabase
        .from('render_jobs')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

    if (error) {
        return { success: false, error: 'Failed to fetch jobs' };
    }

    return { success: true, jobs: jobs as RenderJob[] };
}

/**
 * Reset a project stuck in the rendering state
 */
export async function resetStuckRender(projectId: string): Promise<{ success: boolean; error?: string }> {
    console.log(`[Reset Action] >>> FORCE RESET: Project: ${projectId}`);
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            console.error('[Reset Action] FAILED: No authenticated user session.');
            return { success: false, error: 'Unauthorized: No active session' };
        }

        console.log(`[Reset Action] User: ${user.id}. Verified session.`);

        // -- STEP 1: Cancel the job --
        const { data: jobs, error: fetchError } = await supabase
            .from('render_jobs')
            .select('id, status')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false })
            .limit(1);

        if (fetchError) {
            console.error('[Reset Action] Job Fetch Error:', fetchError.message);
        }

        const latestJob = jobs?.[0];
        console.log(`[Reset Action] Job: ${latestJob?.id || 'NONE'} | Status: ${latestJob?.status || 'N/A'}`);

        if (latestJob && (latestJob.status === 'queued' || latestJob.status === 'processing')) {
            const { error: cancelError, count: cancelCount } = await supabase
                .from('render_jobs')
                .update({
                    status: 'cancelled',
                    error_message: 'USER_INTERVENTION: Manual reset.'
                })
                .eq('id', latestJob.id)
                .select();

            console.log(`[Reset Action] Job Cancel -> Affected: ${cancelCount}, Error: ${cancelError?.message || 'none'}`);
        }

        // -- STEP 2: Force Project State Reset --
        console.log(`[Reset Action] Forcing project ${projectId} to 'approved'...`);

        // First, verify we can READ the project
        const { data: projectBefore, error: readError } = await supabase
            .from('projects')
            .select('id, state, studio_id')
            .eq('id', projectId)
            .single();

        if (readError || !projectBefore) {
            console.error('[Reset Action] Project READ failed (RLS may be blocking):', readError?.message);
            return { success: false, error: `READ_DENIED: ${readError?.message || 'Project not visible'}` };
        }

        console.log(`[Reset Action] Project READ OK: state='${projectBefore.state}', studio_id='${projectBefore.studio_id}'`);

        // Now attempt the UPDATE
        const { data: updateResult, error: projectError } = await supabase
            .from('projects')
            .update({
                state: 'approved',
                execution_locked: false
            })
            .eq('id', projectId)
            .select();

        const rowsAffected = updateResult?.length || 0;
        console.log(`[Reset Action] Project UPDATE -> Affected: ${rowsAffected}, Error: ${projectError?.message || 'none'}`);

        if (projectError) {
            return { success: false, error: `UPDATE_ERROR: ${projectError.message}` };
        }

        if (rowsAffected === 0) {
            console.error('[Reset Action] ZERO ROWS AFFECTED. RLS IS BLOCKING THE UPDATE.');
            return { success: false, error: 'RLS_BLOCKED: Update returned 0 rows. Check studio ownership.' };
        }

        // -- STEP 3: Verify --
        const { data: projectAfter } = await supabase
            .from('projects')
            .select('state')
            .eq('id', projectId)
            .single();

        console.log(`[Reset Action] POST-UPDATE verification: state='${projectAfter?.state}'`);

        if (projectAfter?.state !== 'approved') {
            return { success: false, error: `VERIFY_FAILED: State is '${projectAfter?.state}' not 'approved'` };
        }

        revalidatePath(`/dashboard/projects/${projectId}`);
        return { success: true };
    } catch (e: any) {
        console.error('[Reset Action] FATAL:', e);
        return { success: false, error: `FATAL: ${e.message}` };
    }
}

/**
 * Attempt to jumpstart a stalled background process
 */
export async function resumeStuckJob(projectId: string): Promise<{ success: boolean; error?: string }> {
    console.log(`[Resume Action] Attempting to reboot signal for: ${projectId}`);
    try {
        const supabase = await createClient();

        // 1. Find the active job
        const { data: jobs } = await supabase
            .from('render_jobs')
            .select('id, status')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false })
            .limit(1);

        const latestJob = jobs?.[0];
        if (!latestJob) return { success: false, error: 'NO_ACTIVE_JOB: Signal never initialized.' };

        // 2. Set to queued to bypass pipeline idempotency
        console.log(`[Resume Action] Found Job: ${latestJob.id}. Resetting status to 'queued'...`);
        await supabase
            .from('render_jobs')
            .update({
                status: 'queued',
                error_message: 'MANUAL_OVERRIDE: Rebooting Engines...'
            })
            .eq('id', latestJob.id);

        // 3. Trigger foreground/background handover
        console.log('[Resume Action] Handing off to Pipeline worker...');

        // We call it but don't await completion (background task)
        processRenderJob(latestJob.id, supabase).catch((err: any) => {
            console.error('[Resume Action] FATAL Worker Crash:', err);
        });

        return { success: true };
    } catch (e: any) {
        console.error('[Resume Action] System Fault:', e);
        return { success: false, error: e.message };
    }
}
