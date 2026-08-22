'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { CREATIVE_DNA_OPTIONS } from './types';

export async function createStudio(formData: FormData) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) throw new Error('Unauthorized');

    const name = formData.get('name') as string;
    const role = formData.get('role') as string;

    if (!name || name.length < 2) {
        return { error: 'Studio name is required (min 2 characters)' };
    }
    if (!role) {
        return { error: 'Role is required' };
    }

    // Insert Studio
    const { error } = await supabase
        .from('studios')
        .insert({
            user_id: user.id,
            name,
            role,
        });

    if (error) {
        // Handle uniqueness violation (user already has studio?)
        if (error.code === '23505') {
            // Just update it if it exists? Or error?
            // Let's allow update for "idempotency" if they went back?
            // But table has unique constraint on user_id.
            // If they are on this step, they shouldn't have one, or they are editing?
            // If editing, we should Update.
            // Let's try update first or upsert.
            // Upsert requires ON CONFLICT.
            const { error: upsertError } = await supabase
                .from('studios')
                .upsert({ user_id: user.id, name, role }, { onConflict: 'user_id' });

            if (upsertError) return { error: upsertError.message };
        } else {
            return { error: error.message };
        }
    }

    // Also update profile with studio name/role for convenience (denormalization per database.ts)
    await supabase
        .from('profiles')
        .update({ studio_name: name, role })
        .eq('id', user.id);

    // ... inside createStudio function ...
    // ... existing code ...
    redirect('/onboarding/goal');
}

export async function saveGoal(formData: FormData) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) throw new Error('Unauthorized');

    const goal = formData.get('goal') as string;

    if (!goal) {
        return { error: 'Please select a goal' };
    }

    // Get Studio ID
    const { data: studio } = await supabase
        .from('studios')
        .select('id')
        .eq('user_id', user.id)
        .single();

    if (!studio) {
        return { error: 'Studio not found' };
    }

    // Update or insert Studio Defaults
    const { error } = await supabase
        .from('studio_defaults')
        .upsert({
            studio_id: studio.id,
            outcome_goal: goal,
            // Platform/Context/Identity might be null if new
        }, { onConflict: 'studio_id' });

    if (error) return { error: error.message };

    redirect('/onboarding/platform');
}

export async function savePlatform(formData: FormData) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) throw new Error('Unauthorized');

    const platform = formData.get('platform') as string;
    const context = formData.get('context') as string;

    if (!platform || !context) {
        return { error: 'Please select both a platform and context' };
    }

    // Get Studio ID
    const { data: studio } = await supabase
        .from('studios')
        .select('id')
        .eq('user_id', user.id)
        .single();

    if (!studio) {
        return { error: 'Studio not found' };
    }

    const { error } = await supabase
        .from('studio_defaults')
        .update({
            platform,
            context
        })
        .eq('studio_id', studio.id);

    if (error) return { error: error.message };

    redirect('/onboarding/creative-dna');
}

export async function saveCreativeDNA(formData: FormData) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) throw new Error('Unauthorized');

    const brand_energy = formData.get('brand_energy') as string;
    const editing_pace = formData.get('editing_pace') as string;
    const visual_style = formData.get('visual_style') as string;
    const text_personality = formData.get('text_personality') as string;
    const music_energy = formData.get('music_energy') as string;

    // Validate presence and value against options
    if (!brand_energy || !CREATIVE_DNA_OPTIONS.brand_energy.includes(brand_energy as any)) {
        return { error: 'Invalid Brand Energy selection' };
    }
    if (!editing_pace || !CREATIVE_DNA_OPTIONS.editing_pace.includes(editing_pace as any)) {
        return { error: 'Invalid Editing Pace selection' };
    }
    if (!visual_style || !CREATIVE_DNA_OPTIONS.visual_style.includes(visual_style as any)) {
        return { error: 'Invalid Visual Style selection' };
    }
    if (!text_personality || !CREATIVE_DNA_OPTIONS.text_personality.includes(text_personality as any)) {
        return { error: 'Invalid Text Personality selection' };
    }
    if (!music_energy || !CREATIVE_DNA_OPTIONS.music_energy.includes(music_energy as any)) {
        return { error: 'Invalid Music Energy selection' };
    }

    const { data: studio } = await supabase
        .from('studios')
        .select('id')
        .eq('user_id', user.id)
        .single();

    if (!studio) {
        return { error: 'Studio not found' };
    }

    // Upsert Creative DNA
    const { error } = await supabase
        .from('creative_dna')
        .upsert({
            studio_id: studio.id,
            brand_energy,
            editing_pace,
            visual_style,
            text_personality,
            music_energy,
        }, { onConflict: 'studio_id' });

    if (error) return { error: error.message };

    redirect('/onboarding/identity');
}

export async function saveIdentity(formData: FormData) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) throw new Error('Unauthorized');

    const identity_presence = formData.get('identity_presence') as string;
    const actor_id = formData.get('actor_id') as string;
    const identity_asset_path = formData.get('identity_asset_path') as string;
    const identity_asset_name = formData.get('identity_asset_name') as string;

    if (!identity_presence) {
        return { error: 'Please select an identity presence option' };
    }

    const { data: studio } = await supabase
        .from('studios')
        .select('id')
        .eq('user_id', user.id)
        .single();

    if (!studio) {
        return { error: 'Studio not found' };
    }

    // Validation Logic
    if (identity_presence === 'ai_actor' && !actor_id) {
        return { error: 'Please select an AI actor' };
    }
    if (identity_presence === 'self' && !identity_asset_path) {
        return { error: 'Please upload your identity asset (video/photo)' };
    }

    // Update Studio Defaults
    const { error } = await supabase
        .from('studio_defaults')
        .update({
            identity_presence,
            actor_id: identity_presence === 'ai_actor' ? actor_id : null,
        })
        .eq('studio_id', studio.id);

    if (error) return { error: error.message };

    // If Self, save asset
    if (identity_presence === 'self') {
        const { error: assetError } = await supabase
            .from('studio_assets')
            .insert({
                studio_id: studio.id,
                asset_type: 'identity_avatar',
                file_path: identity_asset_path,
                file_name: identity_asset_name || 'identity_upload',
            });

        if (assetError) return { error: assetError.message };
    }

    redirect('/onboarding/assets');
}

export async function saveAssets(formData: FormData) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) throw new Error('Unauthorized');

    const logo_path = formData.get('logo_path') as string;
    const logo_name = formData.get('logo_name') as string;
    const visualsJson = formData.get('visuals') as string;

    let visuals: { path: string, name: string }[] = [];
    try {
        visuals = JSON.parse(visualsJson || '[]');
    } catch (e) {
        return { error: 'Invalid visuals data' };
    }

    const { data: studio } = await supabase
        .from('studios')
        .select('id')
        .eq('user_id', user.id)
        .single();

    if (!studio) {
        return { error: 'Studio not found' };
    }

    if (logo_path) {
        const { error: logoError } = await supabase.from('studio_assets').insert({
            studio_id: studio.id,
            asset_type: 'logo',
            file_path: logo_path,
            file_name: logo_name || 'logo',
        });
        if (logoError) return { error: logoError.message };
    }

    if (visuals.length > 0) {
        const visualsData = visuals.map(v => ({ studio_id: studio.id, asset_type: 'product_visual', file_path: v.path, file_name: v.name || 'visual' }));
        const { error: visualsError } = await supabase.from('studio_assets').insert(visualsData);
        if (visualsError) return { error: visualsError.message };
    }

    redirect('/onboarding/message');
}

export async function saveMessageBlocks(formData: FormData) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) throw new Error('Unauthorized');

    const value_proposition = formData.get('value_proposition') as string;
    const emotional_promise = formData.get('emotional_promise') as string;
    const proof_point = formData.get('proof_point') as string;

    if (!value_proposition || !emotional_promise) {
        return { error: 'Value Proposition and Emotional Promise are required' };
    }

    const { data: studio } = await supabase
        .from('studios')
        .select('id')
        .eq('user_id', user.id)
        .single();

    if (!studio) {
        return { error: 'Studio not found' };
    }

    const { error } = await supabase
        .from('message_blocks')
        .upsert({
            studio_id: studio.id,
            value_proposition,
            emotional_promise,
            proof_point,
        }, { onConflict: 'studio_id' });

    if (error) return { error: error.message };

    redirect('/onboarding/confirm');
}

export async function completeOnboarding() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) throw new Error('Unauthorized');

    // Verify everything is done?
    // We assume if they reached this step (via protection middleware/access), they are done.
    // But strictness says "Onboarding completion state... only set on final confirmation".

    // Use upsert to ensure profile exists even if trigger failed
    const { error } = await supabase
        .from('profiles')
        .upsert({
            id: user.id,
            email: user.email!, // key fix: provide email
            onboarding_completed: true,
            updated_at: new Date().toISOString(),
            // Preservation of other fields is handled by upsert merging if row exists?
            // tailored for "if missing, create with minimal data"
            // Postgres upsert (INSERT ... ON CONFLICT DO UPDATE) usually requires all non-nullable fields.
            // If profiles has required fields like email, we might need to fetch them from auth.
        }, { onConflict: 'id' })
        .select();


    if (error) return { error: error.message };

    redirect('/dashboard');
}
