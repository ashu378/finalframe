'use server';

/**
 * FinalFrame — Scene Server Actions
 * Reference: MASTER_PRD.md § 5.II — AI Director Blueprint
 * Reference: BUILD_PHASES.md — Phase 2 Scene Editor
 * 
 * Server actions for scene CRUD operations.
 * Scenes belong to projects and can be reordered.
 */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { Scene, CameraConfig, MotionConfig, SceneAsset } from '@/lib/types/database';

/**
 * Get all scenes for a project, ordered by order_index
 */
export async function getScenesForProject(projectId: string): Promise<{
    success: boolean;
    scenes?: Scene[];
    error?: string;
}> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, error: 'Unauthorized' };
    }

    // Verify project access via RLS will handle this, but let's be explicit
    let attempts = 0;
    const maxAttempts = 5;
    let lastError = null;

    while (attempts < maxAttempts) {
        try {
            const { data: scenes, error } = await supabase
                .from('scenes')
                .select('*')
                .eq('project_id', projectId)
                .order('order_index', { ascending: true });

            if (!error) {
                return { success: true, scenes: (scenes || []) as Scene[] };
            }

            lastError = error;
            // distinct handling for socket errors vs logic errors could go here
            console.warn(`Attempt ${attempts + 1} failed:`, error.message);
        } catch (err: any) {
            lastError = err;
            console.warn(`Attempt ${attempts + 1} exception:`, err);
        }
        attempts++;
        if (attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempts))); // exponential backoff
        }
    }

    if (lastError) {
        console.error('Error fetching scenes after retries:', JSON.stringify(lastError, null, 2));
        console.error('Context:', { projectId, userId: user.id });
        return { success: false, error: `Failed to fetch scenes: ${lastError.message || 'Unknown error'}` };
    }

    return { success: false, error: 'Failed to fetch scenes (unknown)' };
}

/**
 * Create a new scene in a project
 * Reference: BUILD_PHASES.md Phase 2 — Scene editor allows adding scenes
 */
export async function createScene(
    projectId: string,
    sceneGoal: string,
    sceneText: string
): Promise<{ success: boolean; scene?: Scene; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, error: 'Unauthorized' };
    }

    // Validate inputs
    if (!sceneGoal || sceneGoal.trim().length === 0) {
        return { success: false, error: 'Scene goal is required' };
    }
    if (!sceneText || sceneText.trim().length === 0) {
        return { success: false, error: 'Scene text is required' };
    }

    // Verify project exists and get current state
    const { data: project } = await supabase
        .from('projects')
        .select('state, studio_id')
        .eq('id', projectId)
        .single();

    if (!project) {
        return { success: false, error: 'Project not found' };
    }

    // Only allow scene creation in draft or blueprint_ready state
    if (project.state !== 'draft' && project.state !== 'blueprint_ready') {
        return { success: false, error: 'Cannot modify scenes after blueprint is approved' };
    }

    // Get max order_index for this project
    const { data: lastScene } = await supabase
        .from('scenes')
        .select('order_index')
        .eq('project_id', projectId)
        .order('order_index', { ascending: false })
        .limit(1)
        .single();

    const newOrderIndex = (lastScene?.order_index ?? -1) + 1;

    const { data: scene, error } = await supabase
        .from('scenes')
        .insert({
            project_id: projectId,
            scene_goal: sceneGoal.trim(),
            scene_text: sceneText.trim(),
            order_index: newOrderIndex,
        })
        .select()
        .single();

    if (error || !scene) {
        console.error('Error creating scene:', error);
        return { success: false, error: 'Failed to create scene' };
    }

    revalidatePath(`/dashboard/projects/${projectId}/blueprint`);
    return { success: true, scene: scene as Scene };
}

/**
 * Update scene text and/or goal
 * Reference: BUILD_PHASES.md Phase 2 — Allow users to edit scene text and goals
 */
export async function updateScene(
    sceneId: string,
    data: {
        scene_goal?: string;
        scene_text?: string;
        scene_title?: string;
        visual_description?: string;
        action_sequence?: string;
        emotional_beat?: string;
        differentiation_note?: string;
        camera_config?: CameraConfig;
        motion_config?: MotionConfig;
        scene_assets?: SceneAsset[];
        asset_binding_id?: string | null;
        why_this_scene_exists?: string | null;
    }
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, error: 'Unauthorized' };
    }

    // Get scene with project info
    const { data: scene } = await supabase
        .from('scenes')
        .select('project_id')
        .eq('id', sceneId)
        .single();

    if (!scene) {
        return { success: false, error: 'Scene not found' };
    }

    // Verify project state allows editing
    const { data: project } = await supabase
        .from('projects')
        .select('state')
        .eq('id', scene.project_id)
        .single();

    if (!project) {
        return { success: false, error: 'Project not found' };
    }

    if (project.state !== 'draft' && project.state !== 'blueprint_ready') {
        return { success: false, error: 'Cannot modify scenes after blueprint is approved' };
    }

    // Build update object
    const updateData: Record<string, any> = {};
    if (data.scene_goal !== undefined) {
        if (data.scene_goal.trim().length === 0) {
            return { success: false, error: 'Scene goal cannot be empty' };
        }
        updateData.scene_goal = data.scene_goal.trim();
    }
    if (data.scene_text !== undefined) {
        if (data.scene_text.trim().length === 0) {
            return { success: false, error: 'Scene text cannot be empty' };
        }
        updateData.scene_text = data.scene_text.trim();
    }
    if (data.scene_title !== undefined) {
        updateData.scene_title = data.scene_title.trim();
    }
    if (data.visual_description !== undefined) {
        updateData.visual_description = data.visual_description.trim();
    }
    if (data.action_sequence !== undefined) {
        updateData.action_sequence = data.action_sequence.trim();
    }
    if (data.emotional_beat !== undefined) {
        updateData.emotional_beat = data.emotional_beat.trim();
    }
    if (data.differentiation_note !== undefined) {
        updateData.differentiation_note = data.differentiation_note.trim();
    }
    if (data.camera_config !== undefined) {
        updateData.camera_config = data.camera_config;
    }
    if (data.motion_config !== undefined) {
        updateData.motion_config = data.motion_config;
    }
    if (data.scene_assets !== undefined) {
        updateData.scene_assets = data.scene_assets;
    }
    if (data.asset_binding_id !== undefined) {
        updateData.asset_binding_id = data.asset_binding_id;
    }
    if (data.why_this_scene_exists !== undefined) {
        updateData.why_this_scene_exists = data.why_this_scene_exists?.trim() ?? null;
    }

    if (Object.keys(updateData).length === 0) {
        return { success: true }; // Nothing to update
    }

    const { error } = await supabase
        .from('scenes')
        .update(updateData)
        .eq('id', sceneId);

    if (error) {
        console.error('Error updating scene:', error);
        return { success: false, error: 'Failed to update scene' };
    }

    revalidatePath(`/dashboard/projects/${scene.project_id}/blueprint`);
    return { success: true };
}

/**
 * Reorder scenes by providing ordered list of scene IDs
 * Reference: BUILD_PHASES.md Phase 2 — Reorder scenes via drag-and-drop
 */
export async function reorderScenes(
    projectId: string,
    orderedSceneIds: string[]
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, error: 'Unauthorized' };
    }

    // Verify project state
    const { data: project } = await supabase
        .from('projects')
        .select('state')
        .eq('id', projectId)
        .single();

    if (!project) {
        return { success: false, error: 'Project not found' };
    }

    if (project.state !== 'draft' && project.state !== 'blueprint_ready') {
        return { success: false, error: 'Cannot reorder scenes after blueprint is approved' };
    }

    // Update each scene's order_index
    // Reference: Scene order must be persisted
    for (let i = 0; i < orderedSceneIds.length; i++) {
        const { error } = await supabase
            .from('scenes')
            .update({ order_index: i })
            .eq('id', orderedSceneIds[i])
            .eq('project_id', projectId); // Ensure scene belongs to this project

        if (error) {
            console.error('Error reordering scene:', error);
            return { success: false, error: 'Failed to reorder scenes' };
        }
    }

    revalidatePath(`/dashboard/projects/${projectId}/blueprint`);
    return { success: true };
}

/**
 * Delete a scene
 */
export async function deleteScene(sceneId: string): Promise<{
    success: boolean;
    error?: string;
}> {
    console.log('[deleteScene] Starting deletion for:', sceneId);
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, error: 'Unauthorized' };
    }

    // Get scene with project info
    const { data: scene } = await supabase
        .from('scenes')
        .select('project_id')
        .eq('id', sceneId)
        .single();

    if (!scene) {
        return { success: false, error: 'Scene not found' };
    }

    // Verify project state allows deletion
    const { data: project } = await supabase
        .from('projects')
        .select('state')
        .eq('id', scene.project_id)
        .single();

    if (!project) {
        return { success: false, error: 'Project not found' };
    }

    if (project.state !== 'draft' && project.state !== 'blueprint_ready') {
        return { success: false, error: 'Cannot delete scenes after blueprint is approved' };
    }

    // 1. Unlink any render jobs associated with this scene (set scene_id to null)
    // This prevents foreign key constraints from blocking deletion
    const { error: unlinkError } = await supabase
        .from('render_jobs')
        .update({ scene_id: null })
        .eq('scene_id', sceneId);

    if (unlinkError) {
        console.error('[deleteScene] Warning: Failed to unlink render jobs:', unlinkError);
        // Continue anyway, as it might not be a blocking issue depending on schema
    }

    // 2. Delete any review comments associated with this scene
    // This assumes cascade delete wasn't set up for comments
    const { error: commentsError } = await supabase
        .from('review_comments')
        .delete()
        .eq('scene_id', sceneId);

    if (commentsError) {
        console.error('[deleteScene] Warning: Failed to delete comments:', commentsError);
    }

    // 3. Delete the scene
    const { error } = await supabase
        .from('scenes')
        .delete()
        .eq('id', sceneId);

    if (error) {
        console.error('[deleteScene] CRITICAL: Error deleting scene:', error);
        return { success: false, error: `Database Error: ${error.message} (Code: ${error.code})` };
    }

    console.log('[deleteScene] Deletion successful. Revalidating path...');

    revalidatePath(`/dashboard/projects/${scene.project_id}/blueprint`);
    return { success: true };
}

/**
 * Bulk create scenes (used by AI Director Blueprint)
 */
export async function createScenesFromBlueprint(
    projectId: string,
    scenes: Array<{
        scene_goal: string;
        scene_text: string;
        scene_title?: string;
        visual_description?: string;
        action_sequence?: string;
        emotional_beat?: string;
        differentiation_note?: string;
        why_this_scene_exists?: string;
        camera_config: CameraConfig;
        motion_config: MotionConfig;
    }>
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, error: 'Unauthorized' };
    }

    if (!scenes || scenes.length === 0) {
        return { success: false, error: 'No scenes provided' };
    }

    // Verify project state
    const { data: project } = await supabase
        .from('projects')
        .select('state')
        .eq('id', projectId)
        .single();

    if (!project) {
        return { success: false, error: 'Project not found' };
    }

    if (project.state !== 'draft' && project.state !== 'blueprint_ready') {
        return { success: false, error: 'Cannot add scenes after blueprint is approved' };
    }

    // Delete existing scenes first (regenerating)
    const { error: deleteError } = await supabase
        .from('scenes')
        .delete()
        .eq('project_id', projectId);

    if (deleteError) {
        console.error('Error deleting existing scenes:', deleteError);
        // We continue anyway as it might be empty
    }

    // Insert new scenes with order_index
    const scenesToInsert = scenes.map((s, index) => ({
        project_id: projectId,
        scene_goal: s.scene_goal.trim(),
        scene_text: s.scene_text.trim(),
        scene_title: (s.scene_title || 'Scene ' + (index + 1)).trim(),
        visual_description: (s.visual_description || '').trim(),
        action_sequence: (s.action_sequence || '').trim(),
        emotional_beat: (s.emotional_beat || '').trim(),
        differentiation_note: (s.differentiation_note || '').trim(),
        camera_config: s.camera_config,
        motion_config: s.motion_config,
        scene_assets: [],
        why_this_scene_exists: (s.why_this_scene_exists || '').trim(),
        order_index: index,
    }));

    const { error, data } = await supabase
        .from('scenes')
        .insert(scenesToInsert)
        .select();

    if (error) {
        console.error('Error creating scenes from blueprint:', {
            error,
            message: error.message,
            details: error.details,
            hint: error.hint,
            projectId,
            sceneCount: scenesToInsert.length
        });
        return { success: false, error: `Failed to create scenes: ${error.message}` };
    }

    console.log(`Successfully created ${data?.length} scenes for project ${projectId}`);

    // Transition to blueprint_ready if in draft
    if (project.state === 'draft') {
        await supabase
            .from('projects')
            .update({ state: 'blueprint_ready' })
            .eq('id', projectId);
    }

    revalidatePath(`/dashboard/projects/${projectId}/blueprint`);
    return { success: true };
}
