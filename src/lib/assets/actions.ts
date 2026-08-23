'use server';

import { revalidatePath } from 'next/cache';
import { api } from '../../../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { type StudioAsset, type AssetType } from '@/lib/types/database';

const unsupported = (operation: string): never => {
    throw new Error(`UNSUPPORTED_CONVEX_OPERATION: ${operation} is not exposed by the current Convex API.`);
};

function toIsoDate(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return new Date(value).toISOString();
    return new Date(0).toISOString();
}

function toStudioAsset(asset: any): StudioAsset {
    const metadata = asset?.metadata && typeof asset.metadata === 'object' ? asset.metadata : {};
    const type = String(asset?.mimeType || '').startsWith('video/')
        ? 'video'
        : String(asset?.mimeType || '').startsWith('audio/')
            ? 'audio'
            : 'image';

    return {
        id: String(asset?._id ?? asset?.id ?? asset?.externalId ?? ''),
        studio_id: String(asset?.studioExternalId ?? asset?.studioId ?? ''),
        name: asset?.name || 'Untitled media',
        url: asset?.storageUrl || '',
        type: type as AssetType,
        size: Number(asset?.byteSize ?? metadata.sizeBytes ?? 0),
        mime_type: asset?.mimeType || 'application/octet-stream',
        tags: Array.isArray(metadata.tags) ? metadata.tags : (Array.isArray(asset?.roles) ? asset.roles : []),
        folder_path: typeof metadata.folderPath === 'string' ? metadata.folderPath : '/',
        created_at: toIsoDate(asset?.createdAt),
    };
}

export async function getAssets(studioId: string, folderPath: string = '/'): Promise<StudioAsset[]> {
    void studioId;
    try {
        const client = await getAuthenticatedConvexClient();
        const assets = await client.query(api.app.listAssets, {});
        return assets
            .map(toStudioAsset)
            .filter((asset) => asset.folder_path === folderPath)
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
    } catch (error) {
        console.error('Error fetching Convex media:', error);
        return [];
    }
}

export async function uploadAsset(
    studioId: string,
    formData: FormData,
    folderPath: string = '/'
): Promise<{ success: boolean; error?: string; asset?: StudioAsset }> {
    void studioId;
    void formData;
    void folderPath;
    return { success: false, error: 'UNSUPPORTED_CONVEX_OPERATION: Media upload is not exposed by the current Convex API.' };
}

export async function deleteAsset(assetId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const client = await getAuthenticatedConvexClient();
        await client.mutation(api.app.updateAsset, { assetId: assetId as any, deleted: true });
        revalidatePath('/dashboard/assets');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unable to delete media' };
    }
}

export async function deleteAssets(assetIds: string[]): Promise<{ success: boolean; error?: string }> {
    try {
        const client = await getAuthenticatedConvexClient();
        for (const assetId of assetIds) {
            await client.mutation(api.app.updateAsset, { assetId: assetId as any, deleted: true });
        }
        revalidatePath('/dashboard/assets');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unable to delete media' };
    }
}

export async function updateAssetTags(assetId: string, tags: string[]): Promise<{ success: boolean; error?: string }> {
    try {
        const client = await getAuthenticatedConvexClient();
        const assets = await client.query(api.app.listAssets, {});
        const asset = assets.find((candidate: any) => String(candidate._id) === assetId || candidate.externalId === assetId);
        if (!asset) return { success: false, error: 'Asset not found' };
        const metadata = asset.metadata && typeof asset.metadata === 'object' ? asset.metadata : {};
        await client.mutation(api.app.updateAsset, { assetId: asset._id, metadata: { ...metadata, tags } });
        revalidatePath('/dashboard/assets');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unable to update media tags' };
    }
}

export async function getStudioPresets(): Promise<StudioAsset[]> {
    return unsupported('Studio presets');
}

export async function stowPreset(studioId: string, presetId: string): Promise<{ success: boolean; error?: string }> {
    void studioId;
    void presetId;
    return { success: false, error: 'UNSUPPORTED_CONVEX_OPERATION: Preset templates are not exposed by the current Convex API.' };
}
