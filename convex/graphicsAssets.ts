import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { sha256Equal } from '../renderer/src/media/sha256';
import { requireApprovedResource } from './resourceStates';
function denied(value: unknown) { const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; const state = String(typeof value === 'string' ? value : row.status ?? row.state ?? '').toUpperCase(); return row.approved === false || row.consent === false || ['DENIED', 'REJECTED', 'REVOKED', 'EXPIRED', 'BLOCKED', 'RESTRICTED', 'QUARANTINED'].includes(state); }
/** Private resolver; caller already owns the project operation. Reusing the
 * canonical approval resolver also authorizes every query or stored actor. */
export async function resolveGraphicImage(ctx: MutationCtx | QueryCtx, args: {
    assetId: string;
    projectId: Id<'projects'>;
    studioExternalId: string;
    actorId?: Id<'users'>;
}) {
    const id = ctx.db.normalizeId('assets', args.assetId);
    const image = id ? await ctx.db.get(id) : null;
    if (!id || !image || image.projectId !== args.projectId || image.studioExternalId !== args.studioExternalId || image.scope !== 'PROJECT' || image.deletedAt || !image.storageId || !image.checksum || !image.mimeType?.startsWith('image/') || denied(image.rights) || denied(image.provenance) || denied(image.moderation))
        throw new Error('Choose an active project image with current rights and approval.');
    const storage = await ctx.db.system.get('_storage', image.storageId);
    if (!storage || storage.size < 1 || storage.contentType !== image.mimeType || !sha256Equal(image.checksum, storage.sha256))
        throw new Error('The graphic image storage bytes or media type changed.');
    await requireApprovedResource(ctx, args.projectId, 'asset', id, undefined, args.actorId);
    return image;
}
