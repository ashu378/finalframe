import type { QueryCtx, MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireApprovedResource } from './resourceStates';
import { sha256Equal } from '../renderer/src/media/sha256';

export const deniedRepairMedia = (value: unknown) => {
  const r = value && typeof value === 'object' ? (value as Record<string,unknown>) : {};
  return (
    r.approved === false ||
    r.consent === false ||
    ['DENIED', 'REJECTED', 'REVOKED', 'EXPIRED', 'BLOCKED', 'RESTRICTED', 'QUARANTINED'].includes(
      String(typeof value === 'string' ? value : (r.status ?? r.state ?? '')).toUpperCase(),
    )
  );
};

export async function performanceAnchor(ctx: QueryCtx | MutationCtx, projectId: Id<'projects'>, imageId: Id<'assets'>, actorId?: Id<'users'>) {
  await requireApprovedResource(ctx, projectId, 'asset', imageId, undefined, actorId);
  const asset = await ctx.db.get(imageId);
  const stored = asset?.storageId ? await ctx.db.system.get('_storage', asset.storageId) : null;
  if (!asset || asset.projectId !== projectId || asset.scope !== 'PROJECT' || asset.deletedAt ||
      !stored || stored.size < 1 || stored.size > 16_000_000 || !sha256Equal(asset.checksum, stored.sha256) ||
      !['image/png','image/jpeg'].includes(asset.mimeType ?? '') || asset.mimeType !== stored.contentType ||
      [asset.rights, asset.provenance, asset.moderation].some(deniedRepairMedia))
    throw new Error('Choose an approved PNG or JPEG opening image from this project.');
  return { assetId: asset._id, storageId: asset.storageId!, checksum: stored.sha256, byteSize: stored.size };
}
