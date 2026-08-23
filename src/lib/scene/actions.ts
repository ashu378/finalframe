'use server';

import { revalidatePath } from 'next/cache';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { api } from '../../../convex/_generated/api';
import type { Scene, CameraConfig, MotionConfig, SceneAsset } from '@/lib/types/database';

type WorkspaceScene = { _id: string; title: string; purpose: string; visualDirection: string; orderIndex: number; metadata?: Record<string, any> };

function mapScene(scene: WorkspaceScene, projectId: string): Scene {
    const metadata = scene.metadata || {};
    return {
        id: scene._id,
        project_id: projectId,
        order_index: scene.orderIndex,
        scene_goal: scene.purpose,
        scene_text: metadata.sceneText || scene.visualDirection,
        scene_title: scene.title,
        visual_description: scene.visualDirection,
        action_sequence: metadata.actionSequence || '',
        emotional_beat: metadata.emotionalBeat || '',
        differentiation_note: metadata.differentiationNote || '',
        camera_config: (metadata.cameraConfig || {}) as CameraConfig,
        motion_config: (metadata.motionConfig || {}) as MotionConfig,
        scene_assets: (metadata.sceneAssets || []) as SceneAsset[],
        asset_binding_id: metadata.assetBindingId || null,
        why_this_scene_exists: metadata.whyThisSceneExists || null,
        created_at: new Date(metadata.createdAt || Date.now()).toISOString(),
        updated_at: new Date(metadata.updatedAt || Date.now()).toISOString(),
    };
}
async function workspace(projectId: string) {
    const convex = await getAuthenticatedConvexClient();
    const projects = await convex.query(api.projects.list, { studioExternalId: (await convex.query(api.account.current, {})).studio?.externalId || '' });
    if (!projects.some((project) => project.externalId === projectId || project._id === projectId)) return { convex, data: null };
    return { convex, data: await convex.query(api.productions.getWorkspaceByProject, { projectExternalId: projectId }) };
}

function unavailable(operation: string) { return { success: false as const, error: `${operation} is not available in the current Convex production contract.` }; }

export async function getScenesForProject(projectId: string): Promise<{ success: boolean; scenes?: Scene[]; error?: string }> {
    try {
        const result = await workspace(projectId);
        if (!result.data) return { success: false, error: 'Project not found' };
        const scenes = result.data.sequences.flatMap((sequence) => sequence.scenes.map((scene) => mapScene(scene, projectId)));
        return { success: true, scenes };
    } catch (error) {
        console.error('Convex getScenesForProject failed:', error);
        return { success: false, error: 'Failed to fetch scenes' };
    }
}

export async function createScene(projectId: string, sceneGoal: string, sceneText: string): Promise<{ success: boolean; scene?: Scene; error?: string }> {
    if (!sceneGoal.trim()) return { success: false, error: 'Scene goal is required' };
    if (!sceneText.trim()) return { success: false, error: 'Scene text is required' };
    const result = await workspace(projectId);
    if (!result.data) return { success: false, error: 'Project not found' };
    return unavailable('Creating an individual scene');
}

export async function updateScene(sceneId: string, data: { scene_goal?: string; scene_text?: string; scene_title?: string; visual_description?: string; action_sequence?: string; emotional_beat?: string; differentiation_note?: string; camera_config?: CameraConfig; motion_config?: MotionConfig; scene_assets?: SceneAsset[]; asset_binding_id?: string | null; why_this_scene_exists?: string | null }): Promise<{ success: boolean; error?: string }> {
    void data;
    void sceneId;
    return unavailable('Updating an individual scene');
}

export async function reorderScenes(projectId: string, orderedSceneIds: string[]): Promise<{ success: boolean; error?: string }> {
    const result = await workspace(projectId);
    if (!result.data) return { success: false, error: 'Project not found' };
    void orderedSceneIds;
    return unavailable('Reordering scenes');
}

export async function deleteScene(sceneId: string): Promise<{ success: boolean; error?: string }> {
    void sceneId;
    return unavailable('Deleting an individual scene');
}

export async function createScenesFromBlueprint(projectId: string, scenes: Array<{ scene_goal: string; scene_text: string; scene_title?: string; visual_description?: string; action_sequence?: string; emotional_beat?: string; differentiation_note?: string; why_this_scene_exists?: string; camera_config: CameraConfig; motion_config: MotionConfig }>): Promise<{ success: boolean; error?: string }> {
    if (!scenes.length) return { success: false, error: 'No scenes provided' };
    try {
        const convex = await getAuthenticatedConvexClient();
        const current = await convex.query(api.account.current, {});
        if (!current.studio) return { success: false, error: 'Studio setup is required' };
        const projects = await convex.query(api.projects.list, { studioExternalId: current.studio.externalId });
        if (!projects.some((project) => project.externalId === projectId || project._id === projectId)) return { success: false, error: 'Project not found' };
        const plan = {
            summary: 'AI Director blueprint', assumptions: [], questions: [], workflow: 'SOCIAL',
            bible: { projectContext: {}, characters: [], locations: [], products: [], style: {}, story: {} },
            sequences: [{ title: 'Main Story', description: 'Blueprint scenes', orderIndex: 0, scenes: scenes.map((scene, index) => ({ title: scene.scene_title || `Scene ${index + 1}`, purpose: scene.scene_goal.trim(), visualDirection: scene.visual_description?.trim() || scene.scene_text.trim(), orderIndex: index, shots: [{ title: `Take ${index + 1}`, prompt: `${scene.scene_text.trim()} ${scene.action_sequence?.trim() || ''}`.trim(), durationSeconds: 5, orderIndex: 0, requiredAssetIds: [], camera: scene.camera_config }] })) }],
            operations: [],
        };
        const created = await convex.mutation(api.productions.createPlan, { studioExternalId: current.studio.externalId, projectExternalId: projectId, workflow: 'SOCIAL', inputMode: 'BLUEPRINT', durationSeconds: Math.max(15, scenes.length * 5), language: 'en', outputPreset: 'SOCIAL_VERTICAL', input: { projectId }, plan, estimate: { credits: 0, source: 'blueprint' } });
        await convex.mutation(api.productions.approvePlan, { planId: created.planId });
        revalidatePath(`/dashboard/projects/${projectId}/blueprint`);
        return { success: true };
    } catch (error) {
        console.error('Convex createScenesFromBlueprint failed:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to create scenes' };
    }
}
