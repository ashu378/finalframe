'use server';

import { createClient } from '@/lib/supabase/server';
import { type Template } from '@/lib/types/database';
import { revalidatePath } from 'next/cache';

export async function getTemplates(studioId: string): Promise<Template[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('templates')
        .select('*')
        .or(`is_public.eq.true,studio_id.eq.${studioId}`)
        .order('is_public', { ascending: false }) // System templates first
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching templates:', error);
        return [];
    }

    return data as Template[];
}

export async function createProjectFromTemplate(
    studioId: string,
    templateId: string,
    projectName: string
): Promise<{ success: boolean; projectId?: string; error?: string }> {
    const supabase = await createClient();

    // 1. Fetch Template
    const { data: template, error: templateError } = await supabase
        .from('templates')
        .select('*')
        .eq('id', templateId)
        .single();

    if (templateError || !template) {
        return { success: false, error: 'Template not found' };
    }

    const { scenes, projectSettings, creativeDna, project_description } = template.blueprint_data;

    // 2. Create Project
    const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({
            studio_id: studioId,
            name: projectName,
            state: 'blueprint_ready',
            content_type: projectSettings?.content_type || template.category === 'social_ad' ? 'commercial' : template.category === 'explainer' ? 'explainer' : 'commercial',
            outcome_goal: projectSettings?.outcome_goal || null,
            platform: projectSettings?.platform || null,
            project_description: project_description || template.description || '',
            context: projectSettings?.context || 'product_launch',
            identity_presence: projectSettings?.identity_presence || 'no_people',
            creative_dna_snapshot: creativeDna || null,
        })
        .select()
        .single();

    if (projectError) {
        return { success: false, error: projectError.message };
    }

    // 3. Insert Scenes
    if (scenes && Array.isArray(scenes)) {
        const scenesToInsert = scenes.map((s: any, i: number) => ({
            project_id: project.id,
            order_index: i,
            scene_goal: s.scene_goal || 'Template Scene',
            scene_text: s.scene_text || '',
            scene_title: s.scene_title || s.scene_goal || `Scene ${i + 1}`,
            visual_description: s.visual_description || '',
            action_sequence: s.action_sequence || '',
            emotional_beat: s.emotional_beat || '',
            camera_config: s.camera_config || { angle: 'eye_level', movement: 'static', lens: 'standard' },
            motion_config: s.motion_config || { speed: 'normal', stability: 0.8 },
        }));

        const { error: sceneError } = await supabase.from('scenes').insert(scenesToInsert);
        if (sceneError) {
            console.error('Error inserting template scenes:', sceneError);
        }
    }

    revalidatePath('/dashboard/projects');
    return { success: true, projectId: project.id };
}
