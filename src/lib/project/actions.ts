'use server';

/**
 * FinalFrame — Project Server Actions
 * Reference: MASTER_PRD.md § 4 — Required user information
 * Reference: BUILD_PHASES.md — Phase 2 Project Creation
 * 
 * Server actions for project CRUD operations.
 * Projects inherit studio defaults and enforce actor locking.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
    isValidTransition,
    validateTransition,
    InvalidStateTransitionError
} from '@/lib/project/state-machine';
import type {
    ProjectState,
    FullProject,
    CreativeDNASnapshot,
    MessageBlocksSnapshot,
    ProjectContentType
} from '@/lib/types/database';

/**
 * Reference: BUILD_PHASES.md Phase 2 — Inherit from studio
 * ATOMIC CREATION: All fields passed in a single call at wizard completion.
 */
export async function createProject(
    options: {
        name: string;
        contentType: ProjectContentType;
        description: string;
        outcomeGoal?: string;
        platform?: string;
        context?: string;
        dnaOverride?: Partial<CreativeDNASnapshot>;
        blocksOverride?: Partial<MessageBlocksSnapshot>;
        identityPresence?: string;
    }
): Promise<{
    success: boolean;
    projectId?: string;
    error?: string
}> {
    const {
        name,
        contentType,
        description,
        outcomeGoal,
        platform,
        context,
        dnaOverride,
        blocksOverride,
        identityPresence
    } = options;
    console.log('--- [SERVER] createProject: Atomic Start ---', { name, contentType });

    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            console.error('[SERVER] createProject: Unauthorized');
            return { success: false, error: 'Unauthorized' };
        }

        // 1. Get user's studio and profile
        const [{ data: profile }, { data: studio }] = await Promise.all([
            supabase.from('profiles').select('onboarding_completed').eq('id', user.id).single(),
            supabase.from('studios').select('id').eq('user_id', user.id).single()
        ]);

        if (!profile?.onboarding_completed) {
            console.error('[SERVER] createProject: Onboarding incomplete');
            return { success: false, error: 'Onboarding must be completed first' };
        }

        if (!studio) {
            console.error('[SERVER] createProject: Studio not found');
            return { success: false, error: 'Studio not found' };
        }

        // 2. Fetch all studio context for inheritance
        console.log('[SERVER] createProject: Fetching studio context...');
        const [defaultsRes, creativeDnaRes, messageBlocksRes, logoRes] = await Promise.all([
            supabase.from('studio_defaults').select('*').eq('studio_id', studio.id).single(),
            supabase.from('creative_dna').select('*').eq('studio_id', studio.id).single(),
            supabase.from('message_blocks').select('*').eq('studio_id', studio.id).single(),
            supabase.from('studio_assets').select('file_path').eq('studio_id', studio.id).eq('asset_type', 'logo').order('created_at', { ascending: false }).limit(1).single()
        ]);

        const defaults = defaultsRes.data;
        const creativeDna = creativeDnaRes.data;
        const messageBlocks = messageBlocksRes.data;
        const logoAsset = logoRes.data;

        // 3. Prepare snapshots with overrides
        const creativeDnaSnapshot = creativeDna ? {
            brand_energy: dnaOverride?.brand_energy || creativeDna.brand_energy,
            editing_pace: dnaOverride?.editing_pace || creativeDna.editing_pace,
            visual_style: dnaOverride?.visual_style || creativeDna.visual_style,
            text_personality: dnaOverride?.text_personality || creativeDna.text_personality,
            music_energy: dnaOverride?.music_energy || creativeDna.music_energy,
        } : null;

        const messageBlocksSnapshot = messageBlocks ? {
            value_proposition: blocksOverride?.value_proposition || messageBlocks.value_proposition,
            emotional_promise: blocksOverride?.emotional_promise || messageBlocks.emotional_promise,
            proof_point: blocksOverride?.proof_point || messageBlocks.proof_point,
        } : null;

        const brandingSnapshot = {
            logo_url: logoAsset?.file_path || null,
            brand_colors: null
        };

        // 4. ATOMIC INSERT
        console.log('[SERVER] createProject: Executing insert...');
        const { data: project, error: insertError } = await supabase
            .from('projects')
            .insert({
                studio_id: studio.id,
                name: name.trim(),
                content_type: contentType,
                project_description: description.trim(),
                state: 'draft',
                outcome_goal: (outcomeGoal as any) || defaults?.outcome_goal || null,
                platform: platform || defaults?.platform || null,
                context: context || defaults?.context || null,
                identity_presence: identityPresence || defaults?.identity_presence || null,
                actor_id: defaults?.actor_id || null,
                actor_locked: (identityPresence || defaults?.identity_presence) === 'ai_actor',
                creative_dna_snapshot: creativeDnaSnapshot,
                message_blocks_snapshot: messageBlocksSnapshot,
                branding: brandingSnapshot,
            })
            .select('id')
            .single();

        if (insertError || !project) {
            console.error('[SERVER] createProject: Insert failed', insertError);
            return { success: false, error: insertError?.message || 'Failed to create project record' };
        }

        console.log('[SERVER] createProject: Success!', project.id);

        // 5. Revalidate and Return
        try {
            revalidatePath('/dashboard');
            revalidatePath('/dashboard/projects');
        } catch (e) {
            console.warn('[SERVER] createProject: Revalidation error (non-critical)', e);
        }

        return { success: true, projectId: project.id };

    } catch (e: any) {
        console.error('[SERVER] createProject: Unhandled error', e);
        return { success: false, error: e.message || 'An unexpected error occurred' };
    }
}

/**
 * Get all projects for the current user
 */
export async function getProjectsForUser(): Promise<{
    success: boolean;
    projects?: FullProject[];
    error?: string;
}> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, error: 'Unauthorized' };
    }

    // Get user's studio
    const { data: studio } = await supabase
        .from('studios')
        .select('id')
        .eq('user_id', user.id)
        .single();

    if (!studio) {
        return { success: true, projects: [] };
    }

    const { data: projects, error } = await supabase
        .from('projects')
        .select('*')
        .eq('studio_id', studio.id)
        .is('archived_at', null)
        .neq('state', 'archived')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching projects:', error);
        return { success: false, error: 'Failed to fetch projects' };
    }

    return {
        success: true,
        projects: (projects || []) as FullProject[]
    };
}

/**
 * Get a single project by ID
 */
export async function getProjectById(projectId: string): Promise<{
    success: boolean;
    project?: FullProject;
    error?: string;
}> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, error: 'Unauthorized' };
    }

    // Fetch with retry
    let attempts = 0;
    let project = null;
    let lastError = null;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
        try {
            const { data, error } = await supabase
                .from('projects')
                .select('*')
                .eq('id', projectId)
                .single();

            if (!error && data) {
                project = data;
                lastError = null;
                break;
            }
            if (error) lastError = error;
            console.warn(`getProjectById attempt ${attempts + 1} failed:`, error?.message);
        } catch (err: any) {
            lastError = err;
            console.warn(`getProjectById attempt ${attempts + 1} exception:`, err);
        }
        attempts++;
        if (attempts < maxAttempts) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempts)));
    }

    if (lastError || !project) {
        console.error('getProjectById failed after retries:', lastError?.message || lastError);
        return { success: false, error: 'Project not found' };
    }

    // Verify ownership via studio
    const { data: studio } = await supabase
        .from('studios')
        .select('id')
        .eq('id', project.studio_id)
        .eq('user_id', user.id)
        .single();

    if (!studio) {
        return { success: false, error: 'Access denied' };
    }

    return { success: true, project: project as FullProject };
}

/**
 * Update project details
 * Reference: MASTER_PRD.md § 4.4 — Actor identity cannot be changed per scene (locked)
 */
export async function updateProject(
    projectId: string,
    data: {
        name?: string;
        description?: string;
        content_type?: ProjectContentType;
        outcome_goal?: any;
    }
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, error: 'Unauthorized' };
    }

    // Verify ownership
    const { data: project } = await supabase
        .from('projects')
        .select('studio_id, state, actor_locked')
        .eq('id', projectId)
        .single();

    if (!project) {
        return { success: false, error: 'Project not found' };
    }

    const { data: studio } = await supabase
        .from('studios')
        .select('id')
        .eq('id', project.studio_id)
        .eq('user_id', user.id)
        .single();

    if (!studio) {
        return { success: false, error: 'Access denied' };
    }

    // Restriction: content_type and outcome_goal only in editable states
    if (data.content_type || data.outcome_goal) {
        if (project.state !== 'draft' && project.state !== 'blueprint_ready') {
            return { success: false, error: 'Core project strategy cannot be edited in current state' };
        }
    }

    const updateData: Record<string, unknown> = {};
    if (data.name) updateData.name = data.name.trim();
    if (data.description !== undefined) updateData.project_description = data.description?.trim() || null;
    if (data.content_type) updateData.content_type = data.content_type;
    if (data.outcome_goal) updateData.outcome_goal = data.outcome_goal;

    const { error } = await supabase
        .from('projects')
        .update(updateData)
        .eq('id', projectId);

    if (error) {
        return { success: false, error: 'Failed to update project' };
    }

    revalidatePath('/dashboard/dashboard');
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { success: true };
}

/**
 * Archive a project (Safe Delete)
 * Reference: SYSTEM TASK — Feature: Project Archiving
 */
export async function archiveProject(projectId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, error: 'Unauthorized' };
    }

    // Verify ownership via studio
    const { data: project } = await supabase
        .from('projects')
        .select('studio_id')
        .eq('id', projectId)
        .single();

    if (!project) {
        return { success: false, error: 'Project not found' };
    }

    const { data: studio } = await supabase
        .from('studios')
        .select('id')
        .eq('id', project.studio_id)
        .eq('user_id', user.id)
        .single();

    if (!studio) {
        return { success: false, error: 'Access denied' };
    }

    // Update project state to archived and set archived_at
    // No data is lost, purely a visibility filter
    const { error } = await supabase
        .from('projects')
        .update({
            state: 'archived',
            archived_at: new Date().toISOString()
        })
        .eq('id', projectId);

    if (error) {
        console.error('Failed to archive project:', error);
        return { success: false, error: 'Failed to archive project' };
    }

    revalidatePath('/dashboard');
    revalidatePath('/dashboard');
    return { success: true };
}

/**
 * Hard delete - FORBIDDEN for standard users (PRD requirement)
 * This action is NOT exposed in standard user workflows.
 */
export async function deleteProject(projectId: string): Promise<{ success: boolean; error?: string }> {
    // Redirect to archive instead to enforce safety
    return archiveProject(projectId);
}

/**
 * Transition project state
 * Reference: MASTER_PRD.md § 8 — Strict state machine transitions
 */
export async function transitionProjectState(
    projectId: string,
    newState: ProjectState
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, error: 'Unauthorized' };
    }

    // Get current project state
    const { data: project } = await supabase
        .from('projects')
        .select('studio_id, state')
        .eq('id', projectId)
        .single();

    if (!project) {
        return { success: false, error: 'Project not found' };
    }

    // Verify ownership
    const { data: studio } = await supabase
        .from('studios')
        .select('id')
        .eq('id', project.studio_id)
        .eq('user_id', user.id)
        .single();

    if (!studio) {
        return { success: false, error: 'Access denied' };
    }

    // Validate state transition
    // Reference: MASTER_PRD.md § 8 — Transitions outside this order are forbidden
    try {
        validateTransition(project.state as ProjectState, newState);
    } catch (e) {
        if (e instanceof InvalidStateTransitionError) {
            return { success: false, error: e.message };
        }
        throw e;
    }

    // --- SIGNAL VALIDATION GATE (MANDATORY) ---
    if (newState === 'approved') {
        const { validateProjectSignals } = await import('@/lib/project/signal-validator');
        const validation = await validateProjectSignals(projectId);
        if (!validation.success) {
            console.error(`[Signal Gate] Validation failed for project ${projectId}:`, validation.error);
            return { success: false, error: validation.error };
        }
        console.log(`[Signal Gate] Validation passed for project ${projectId}`);
    }

    const { error } = await supabase
        .from('projects')
        .update({ state: newState })
        .eq('id', projectId);

    if (error) {
        return { success: false, error: 'Failed to update project state' };
    }

    revalidatePath(`/dashboard/projects/${projectId}`);
    revalidatePath(`/dashboard/projects/${projectId}/blueprint`);
    return { success: true };
}

/**
 * Approve blueprint - transitions through required states
 * Reference: BUILD_PHASES.md Phase 2 — User must explicitly approve the blueprint
 * Transitions: draft → blueprint_ready → approved
 */
export async function approveBlueprint(projectId: string): Promise<{
    success: boolean;
    error?: string
}> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, error: 'Unauthorized' };
    }

    // Get project
    const { data: project } = await supabase
        .from('projects')
        .select('studio_id, state')
        .eq('id', projectId)
        .single();

    if (!project) {
        return { success: false, error: 'Project not found' };
    }

    // Verify ownership
    const { data: studio } = await supabase
        .from('studios')
        .select('id')
        .eq('id', project.studio_id)
        .eq('user_id', user.id)
        .single();

    if (!studio) {
        return { success: false, error: 'Access denied' };
    }

    // Validate scenes exist
    // Reference: BUILD_PHASES.md Phase 2 — On approval: Validate scenes exist and are ordered
    const { data: scenes } = await supabase
        .from('scenes')
        .select('id')
        .eq('project_id', projectId);

    if (!scenes || scenes.length === 0) {
        return { success: false, error: 'Cannot approve blueprint without scenes. Generate a blueprint first.' };
    }

    // --- SIGNAL VALIDATION GATE (MANDATORY) ---
    const { validateProjectSignals } = await import('@/lib/project/signal-validator');
    const validation = await validateProjectSignals(projectId);
    if (!validation.success) {
        console.error(`[Signal Gate] Validation failed for project ${projectId}:`, validation.error);
        return { success: false, error: validation.error };
    }
    console.log(`[Signal Gate] Validation passed for project ${projectId}`);

    // Transition through states
    const currentState = project.state as ProjectState;

    if (currentState === 'draft') {
        // First transition to blueprint_ready
        if (!isValidTransition(currentState, 'blueprint_ready')) {
            return { success: false, error: 'Cannot transition from draft to blueprint_ready' };
        }

        const { error: error1 } = await supabase
            .from('projects')
            .update({ state: 'blueprint_ready' })
            .eq('id', projectId);

        if (error1) {
            return { success: false, error: 'Failed to transition to blueprint_ready' };
        }
    }

    // Then transition to approved (from blueprint_ready)
    if (!isValidTransition('blueprint_ready', 'approved')) {
        return { success: false, error: 'Cannot transition from blueprint_ready to approved' };
    }

    const { error: error2 } = await supabase
        .from('projects')
        .update({ state: 'approved' })
        .eq('id', projectId);

    if (error2) {
        console.error('Failed to approve blueprint:', error2);
        return { success: false, error: 'Failed to approve blueprint' };
    }

    console.log('Blueprint approved successfully for project:', projectId);
    revalidatePath(`/dashboard/projects/${projectId}`);
    revalidatePath(`/dashboard/projects/${projectId}/blueprint`);
    return { success: true };
}

/**
 * Get snapshots for a project
 */
export async function getSnapshotsForProject(projectId: string): Promise<any[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('render_snapshots')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching snapshots:', error);
        return [];
    }

    return data;
}

/**
 * Get studio context for current user
 */
export async function getStudioContext(): Promise<{
    success: boolean;
    studioId?: string;
    defaults?: any;
    dna?: any;
    blocks?: any;
    error?: string;
}> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };

    const { data: studio } = await supabase
        .from('studios')
        .select('id')
        .eq('user_id', user.id)
        .single();

    if (!studio) return { success: false, error: 'Studio not found' };

    const [defaultsRes, dnaRes, blocksRes] = await Promise.all([
        supabase.from('studio_defaults').select('*').eq('studio_id', studio.id).single(),
        supabase.from('creative_dna').select('*').eq('studio_id', studio.id).single(),
        supabase.from('message_blocks').select('*').eq('studio_id', studio.id).single()
    ]);

    return {
        success: true,
        studioId: studio.id,
        defaults: defaultsRes.data,
        dna: dnaRes.data,
        blocks: blocksRes.data
    };
}

/**
 * Unlock blueprint for editing - reverts state to blueprint_ready
 * Reference: BUILD_PHASES.md Phase 2 — Allow revisions after approval
 */
export async function unlockBlueprint(projectId: string): Promise<{
    success: boolean;
    error?: string
}> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, error: 'Unauthorized' };
    }

    // Get project
    const { data: project } = await supabase
        .from('projects')
        .select('studio_id, state')
        .eq('id', projectId)
        .single();

    if (!project) {
        return { success: false, error: 'Project not found' };
    }

    // Verify ownership
    const { data: studio } = await supabase
        .from('studios')
        .select('id')
        .eq('id', project.studio_id)
        .eq('user_id', user.id)
        .single();

    if (!studio) {
        return { success: false, error: 'Access denied' };
    }

    if (project.state !== 'approved') {
        return { success: false, error: 'Only approved blueprints can be unlocked' };
    }

    // Attempt to revert state
    let attempts = 0;
    const maxAttempts = 5;
    let lastError = null;

    while (attempts < maxAttempts) {
        try {
            const { error: updateError } = await supabase
                .from('projects')
                .update({ state: 'blueprint_ready' })
                .eq('id', projectId);

            if (!updateError) {
                lastError = null;
                break;
            }

            lastError = updateError;
            console.warn(`Unlock attempt ${attempts + 1} failed:`, updateError.message);
        } catch (err: any) {
            lastError = err;
            console.warn(`Unlock attempt ${attempts + 1} exception:`, err);
        }

        attempts++;
        if (attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, 500 * attempts));
        }
    }

    if (lastError) {
        console.error('Failed to unlock blueprint after retries:', lastError);
        return { success: false, error: 'Failed to unlock blueprint: ' + (lastError.message || 'Unknown error') };
    }

    revalidatePath(`/dashboard/projects/${projectId}`);
    revalidatePath(`/dashboard/projects/${projectId}/blueprint`);
    return { success: true };
}

