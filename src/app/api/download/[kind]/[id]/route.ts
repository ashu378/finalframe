import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { serveAuthorizedDownload } from '@/lib/review/media-server';
import { api } from '../../../../../../convex/_generated/api';
import type { Id } from '../../../../../../convex/_generated/dataModel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
type Context = { params: Promise<{ kind: string; id: string }> };

async function download(request: Request, context: Context) {
    const { kind, id } = await context.params;
    const unavailable = () => new Response(null, { status: 404, headers: { 'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store' } });
    if (!['export', 'movie', 'asset'].includes(kind) || !/^[a-z0-9]{20,40}$/.test(id)) return unavailable();
    let media;
    let originalName: string | undefined;
    try {
        const client = await getAuthenticatedConvexClient();
        if (kind === 'asset') {
            const args = { assetId: id as Id<'assets'> };
            const [asset, location] = await Promise.all([
                client.query(api.assetStorage.getAssetContract, args),
                client.query(api.assetStorage.resolveAuthorizedMedia, args),
            ]);
            if (!asset?.storageId || asset.storageId !== location?.storageId) return unavailable();
            media = { url: location.url, size: asset.byteSize, contentType: asset.mimeType };
            originalName = asset.name;
        } else if (kind === 'movie') {
            const result = await client.query(api.movieExports.get, { movieExportId: id as Id<'movieExports'> });
            media = { url: result.downloadUrl, size: result.output.byteSize, contentType: 'video/mp4' };
        } else {
            const result = await client.query(api.reviewExport.getExport, { exportId: id as Id<'exports'> });
            media = { url: result.downloadUrl, size: result.downloadSize, contentType: result.mimeType };
        }
    } catch { return unavailable(); }
    return serveAuthorizedDownload(request, media, originalName);
}
export const GET = download;
export const HEAD = download;
