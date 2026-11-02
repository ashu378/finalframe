'use server';

import { revalidatePath } from 'next/cache';
import { api } from '../../../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { type StudioAsset, type AssetType } from '@/lib/types/database';

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
    try {
        const client = await getAuthenticatedConvexClient();
        const assets = await client.query(api.assetStorage.listGlobalAssets, {});
        return assets
            .map(toStudioAsset)
            .filter((asset) => asset.folder_path === folderPath)
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
    } catch (error) {
        console.error('Error fetching Convex media:', error);
        return [];
    }
}

export async function getProjectAssets(projectExternalId: string, folderPath: string = '/'): Promise<StudioAsset[]> {
    try {
        const client = await getAuthenticatedConvexClient();
        const project = await client.query(api.projects.getByExternalId, { externalId: projectExternalId });
        if (!project) return [];
        const assets = await client.query(api.assetStorage.listProjectAssets, { projectId: project._id });
        return assets
            .map(toStudioAsset)
            .filter((asset) => asset.folder_path === folderPath)
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
    } catch (error) {
        console.error('Error fetching project media:', error);
        return [];
    }
}

export async function uploadAsset(
    studioId: string,
    formData: FormData,
    folderPath: string = '/'
): Promise<{ success: boolean; error?: string; asset?: StudioAsset }> {
    try {
        const file = formData.get('file');
        if (!(file instanceof File)) return { success: false, error: 'Choose an image, video, or audio file first.' };
        if (file.size <= 0) return { success: false, error: 'The selected file is empty.' };
        if (file.size > 500 * 1024 * 1024) return { success: false, error: 'Files must be smaller than 500 MB.' };

        const client = await getAuthenticatedConvexClient();
        const current = await client.query(api.account.current, {});
        if (!current.studio || current.studio.externalId !== studioId) return { success: false, error: 'Your workspace could not be verified.' };

        const explicitProjectId = formData.get('projectId');
        const folderProjectId = folderPath.match(/^\/productions\/([^/]+)/)?.[1];
        const projectExternalId = typeof explicitProjectId === 'string' ? explicitProjectId : folderProjectId;
        const project = projectExternalId
            ? await client.query(api.projects.getByExternalId, { externalId: projectExternalId })
            : null;
        if (projectExternalId && !project) return { success: false, error: 'The target project could not be found.' };

        const uploadUrl = await client.mutation(api.assetStorage.generateUploadUrl, {
            studioExternalId: current.studio.externalId,
            projectId: project?._id,
        });
        const uploadResponse = await fetch(uploadUrl, {
            method: 'POST',
            headers: file.type ? { 'Content-Type': file.type } : undefined,
            body: await file.arrayBuffer(),
        });
        if (!uploadResponse.ok) return { success: false, error: `Storage upload failed (${uploadResponse.status}).` };
        const uploadPayload = await uploadResponse.json() as { storageId?: string };
        if (!uploadPayload.storageId) return { success: false, error: 'Storage did not return an asset ID.' };

        const family = file.type.toLowerCase().split('/')[0];
        const roles = family === 'video' ? ['SOURCE_VIDEO'] : family === 'audio' ? ['SOURCE_AUDIO'] : ['IMAGE_REFERENCE', 'SOURCE_IMAGE'];
        const timestamp = Date.now();
        const ingested = await client.mutation(api.assetStorage.ingestAsset, {
            studioExternalId: current.studio.externalId,
            scope: project ? 'PROJECT' : 'GLOBAL',
            projectId: project?._id,
            storageId: uploadPayload.storageId as never,
            source: 'USER_UPLOAD',
            roles,
            name: file.name,
            mimeType: file.type || undefined,
            metadata: {
                contractVersion: 'media-asset.v1',
                kind: family === 'video' || family === 'audio' || family === 'image' ? family : 'other',
                sizeBytes: file.size,
                folderPath,
            },
            provenance: { source: 'USER_UPLOAD', actorExternalId: current.user?.externalId, createdAt: timestamp },
            rights: { status: 'UNKNOWN' },
            consent: { status: 'NOT_REQUIRED' },
            lineage: { relation: 'SOURCE', parentAssetIds: [], createdAt: timestamp },
        });
        const contract = await client.query(api.assetStorage.getAssetContract, { assetId: ingested.assetId });
        const media = await client.query(api.assetStorage.resolveAuthorizedMedia, { assetId: ingested.assetId });
        revalidatePath('/dashboard/assets');
        return {
            success: true,
            asset: toStudioAsset({ ...contract, storageUrl: media?.url }),
        };
    } catch (error) {
        console.error('Convex uploadAsset failed:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unable to upload media' };
    }
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
        const asset = await client.query(api.assetStorage.getAssetContract, { assetId: assetId as any });
        if (!asset) return { success: false, error: 'Asset not found' };
        const metadata = asset.metadata && typeof asset.metadata === 'object' ? asset.metadata : {};
        await client.mutation(api.app.updateAsset, { assetId: asset.assetId, metadata: { ...metadata, tags } });
        revalidatePath('/dashboard/assets');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unable to update media tags' };
    }
}

export async function importAssetToProject(sourceAssetId: string, projectExternalId: string, duplicate = false): Promise<{ success: boolean; assetId?: string; error?: string }> {
    try {
        const client = await getAuthenticatedConvexClient();
        const project = await client.query(api.projects.getByExternalId, { externalId: projectExternalId });
        if (!project) return { success: false, error: 'Project not found' };
        const result = duplicate
            ? await client.mutation(api.assetStorage.duplicateAsset, { sourceAssetId: sourceAssetId as any, projectId: project._id })
            : await client.mutation(api.assetStorage.importAsset, { sourceAssetId: sourceAssetId as any, projectId: project._id });
        revalidatePath(`/dashboard/projects/${projectExternalId}`);
        return { success: true, assetId: result?._id ? String(result._id) : undefined };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unable to import asset' };
    }
}

export async function getStudioPresets(): Promise<StudioAsset[]> {
    // Preset templates are not yet a project asset type. Returning an empty
    // collection keeps the library honest while the tab remains available for
    // the later template phase.
    return [];
}

export async function stowPreset(studioId: string, presetId: string): Promise<{ success: boolean; error?: string }> {
    void studioId;
    void presetId;
    return { success: false, error: 'UNSUPPORTED_CONVEX_OPERATION: Preset templates are not exposed by the current Convex API.' };
}
