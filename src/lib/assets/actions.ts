'use server';

import { createClient } from '@/lib/supabase/server';
import { type StudioAsset, type AssetType } from '@/lib/types/database';
import { revalidatePath } from 'next/cache';

const BUCKET_NAME = 'studio-assets';

export async function getAssets(studioId: string, folderPath: string = '/'): Promise<StudioAsset[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('studio_assets')
        .select('*')
        .eq('studio_id', studioId)
        .eq('folder_path', folderPath)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching assets:', JSON.stringify(error, null, 2));
        return [];
    }

    return data as StudioAsset[];
}

export async function uploadAsset(
    studioId: string,
    formData: FormData,
    folderPath: string = '/'
): Promise<{ success: boolean; error?: string; asset?: StudioAsset }> {
    const supabase = await createClient();
    const file = formData.get('file') as File;

    if (!file) {
        return { success: false, error: 'No file provided' };
    }

    // validate type
    const fileType = file.type.split('/')[0]; // 'image', 'video', 'audio'
    let assetType: AssetType = 'image';
    if (fileType === 'video') assetType = 'video';
    else if (fileType === 'audio') assetType = 'audio';
    else if (fileType === 'image') assetType = 'image';
    else {
        return { success: false, error: 'Unsupported file type. Only Image, Video, and Audio allowed.' };
    }

    // 1. Upload to Storage
    const fileName = `${studioId}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
    const { data: storageData, error: storageError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(fileName, file);

    if (storageError) {
        console.error('Storage Upload Error:', storageError);
        // If bucket not found, define a fallback or mock behaviour for this MVP phase if needed.
        // But we should assume bucket exists.
        return { success: false, error: storageError.message };
    }

    // 2. Get Public URL
    const { data: { publicUrl } } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);

    // 3. Insert into DB
    const { data: asset, error: dbError } = await supabase
        .from('studio_assets')
        .insert({
            studio_id: studioId,
            name: file.name,
            url: publicUrl,
            type: assetType,
            size: file.size,
            mime_type: file.type,
            folder_path: folderPath
        })
        .select()
        .single();

    if (dbError) {
        // Cleanup storage if DB fails
        await supabase.storage.from(BUCKET_NAME).remove([fileName]);
        return { success: false, error: dbError.message };
    }

    revalidatePath('/dashboard/assets');
    return { success: true, asset: asset as StudioAsset };
}

export async function deleteAsset(assetId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();

    // 1. Get asset to find path
    const { data: asset } = await supabase
        .from('studio_assets')
        .select('*')
        .eq('id', assetId)
        .single();

    if (!asset) return { success: false, error: 'Asset not found' };

    // 2. Delete from DB
    const { error: dbError } = await supabase
        .from('studio_assets')
        .delete()
        .eq('id', assetId);

    if (dbError) return { success: false, error: dbError.message };

    // 3. Delete from Storage (Best effort, parsing path from URL or storing path would be better)
    // For now, we unfortunately didn't store the exact storage path in the DB, only public URL.
    // We should parse it or assume standard structure.
    // Improvement: store `storage_path` in DB later. For now, rely on naming convention if needed, 
    // OR just leave the file (orphaned) which is acceptable for MVP.
    // Actually, let's try to parse it. 
    // Format: .../studio-assets/studioId/filename
    const pathParts = asset.url.split(`${BUCKET_NAME}/`);
    if (pathParts.length > 1) {
        const storagePath = pathParts[1];
        await supabase.storage.from(BUCKET_NAME).remove([storagePath]);
    }

    return { success: true };
}

export async function deleteAssets(assetIds: string[]): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();

    // 1. Get assets to find paths
    const { data: assets } = await supabase
        .from('studio_assets')
        .select('*')
        .in('id', assetIds);

    if (!assets || assets.length === 0) return { success: false, error: 'Assets not found' };

    // 2. Delete from DB
    const { error: dbError } = await supabase
        .from('studio_assets')
        .delete()
        .in('id', assetIds);

    if (dbError) return { success: false, error: dbError.message };

    // 3. Delete from Storage
    const storagePaths = assets.map(asset => {
        const pathParts = asset.url.split(`${BUCKET_NAME}/`);
        return pathParts.length > 1 ? pathParts[1] : null;
    }).filter(Boolean) as string[];

    if (storagePaths.length > 0) {
        await supabase.storage.from(BUCKET_NAME).remove(storagePaths);
    }

    revalidatePath('/dashboard/assets');
    return { success: true };
}

export async function updateAssetTags(assetId: string, tags: string[]): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();

    const { error } = await supabase
        .from('studio_assets')
        .update({ tags })
        .eq('id', assetId);

    if (error) return { success: false, error: error.message };

    revalidatePath('/dashboard/assets');
    return { success: true };
}

/**
 * Fetch Studio Presets (Virtual assets from templates)
 */
export async function getStudioPresets(): Promise<StudioAsset[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('templates')
        .select('id, name, thumbnail_url, created_at')
        .eq('is_public', true);

    if (error) {
        console.error('Error fetching presets:', error);
        return [];
    }

    // Map templates to virtual StudioAsset objects
    return data.map(t => ({
        id: `preset_${t.id}`,
        studio_id: 'system',
        name: t.name,
        url: t.thumbnail_url || '',
        type: 'image',
        size: 0,
        mime_type: 'image/webp',
        tags: ['preset'],
        folder_path: '/presets',
        created_at: t.created_at
    })) as StudioAsset[];
}

/**
 * "Stow" a preset into the user's private studio library
 */
export async function stowPreset(studioId: string, presetId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();

    // 1. Get template
    const templateId = presetId.replace('preset_', '');
    const { data: template } = await supabase
        .from('templates')
        .select('*')
        .eq('id', templateId)
        .single();

    if (!template || !template.thumbnail_url) {
        return { success: false, error: 'Preset source not found' };
    }

    // 2. Insert into studio_assets
    const { error } = await supabase
        .from('studio_assets')
        .insert({
            studio_id: studioId,
            name: `${template.name}_PRESET`,
            url: template.thumbnail_url,
            type: 'image',
            size: 0,
            mime_type: 'image/webp',
            folder_path: '/',
            tags: ['stowed_preset']
        });

    if (error) return { success: false, error: error.message };

    revalidatePath('/dashboard/assets');
    return { success: true };
}
