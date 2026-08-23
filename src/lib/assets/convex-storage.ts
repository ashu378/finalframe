import {
    assertAssetUploadRequest,
    type AssetIngestRequest,
    type AssetUploadRequest,
    type ConvexAssetTransport,
    type IngestedAsset,
} from './contracts';

export interface UploadableMedia {
    body: Blob;
    name?: string;
    mimeType?: string;
    sizeBytes?: number;
}

export interface ConvexUploadResponse {
    storageId?: string;
}

/**
 * Uploads bytes to a Convex-generated upload URL and then atomically records
 * the asset contract. The upload URL is never persisted as asset identity.
 */
export async function uploadAndIngestAsset(
    transport: ConvexAssetTransport,
    media: UploadableMedia,
    request: AssetUploadRequest,
    fetcher: typeof fetch = fetch,
): Promise<IngestedAsset> {
    assertAssetUploadRequest(request);
    if (!media.body) throw new Error('Media bytes are required');

    const uploadUrl = await transport.generateUploadUrl(request);
    const response = await fetcher(uploadUrl, {
        method: 'POST',
        headers: media.mimeType ? { 'Content-Type': media.mimeType } : undefined,
        body: media.body,
    });
    if (!response.ok) throw new Error(`Convex Storage upload failed (${response.status})`);

    const payload = (await response.json()) as ConvexUploadResponse;
    if (!payload.storageId) throw new Error('Convex Storage did not return a storageId');

    const ingestRequest: AssetIngestRequest = {
        ...request,
        storageId: payload.storageId,
        name: request.name || media.name,
        mimeType: request.mimeType || media.mimeType,
        sizeBytes: request.sizeBytes ?? media.sizeBytes,
    };
    return transport.ingestAsset(ingestRequest);
}

export function createConvexAssetTransport(functions: {
    generateUploadUrl: ConvexAssetTransport['generateUploadUrl'];
    ingestAsset: ConvexAssetTransport['ingestAsset'];
    resolveAuthorizedMedia: ConvexAssetTransport['resolveAuthorizedMedia'];
}): ConvexAssetTransport {
    return functions;
}
