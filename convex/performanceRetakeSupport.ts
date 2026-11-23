import type { QueryCtx, MutationCtx } from './_generated/server';
import type { Id, Doc } from './_generated/dataModel';
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

// A creator may deliberately replace the old picture of a source-video edit.
// A one-image route cannot carry a separate identity, object, mask or final frame.
export async function performanceRequirements(
  ctx: QueryCtx | MutationCtx, projectId: Id<'projects'>, shot: Doc<'shots'>,
) {
  const meta = shot.metadata ?? {};
  if (meta.requiresLastFrame || meta.lastFrameAssetId || meta.requiresMask ||
      ['EXTEND','UPSCALE','LIP_SYNC','PERFORMANCE_TRANSFER','MASKED_EDIT'].includes(meta.operation) ||
      (meta.referenceBindings?.length ?? 0) > 0)
    throw new Error('This shot requires controls that a single opening image cannot preserve.');
  const requiredImages = new Set<string>(meta.firstFrameAssetId ? [meta.firstFrameAssetId] : []);
  const videos = [];
  for (const id of new Set(shot.requiredAssetIds ?? [])) {
    const assetId = ctx.db.normalizeId('assets',id);
    const a = assetId ? await ctx.db.get(assetId) : null;
    if (!a || a.scope !== 'PROJECT' || a.deletedAt || a.projectId !== projectId ||
        [a.rights,a.moderation,a.provenance].some(deniedRepairMedia)) throw new Error('A required shot reference is unavailable.');
    if (a.mimeType?.startsWith('image/')) requiredImages.add(a._id);
    else if (a.mimeType?.startsWith('video/') && meta.audioPolicy === 'KEEP_SOURCE') videos.push(a);
    else throw new Error('This shot needs a reference that a single opening image cannot preserve.');
  }
  if (requiredImages.size > 1 || videos.length > 1) throw new Error('This shot needs more references than a one-image performance can preserve.');
  return { requiredImage: [...requiredImages][0] ?? null, source: videos[0] ?? null };
}
export async function performanceSubstitution(
  ctx: QueryCtx | MutationCtx, projectId: Id<'projects'>, shot: Doc<'shots'>,
  imageId: Id<'assets'>, confirmedVideoId: unknown, actorId?: Id<'users'>,
) {
  const { requiredImage, source } = await performanceRequirements(ctx, projectId, shot);
  if (requiredImage && requiredImage !== imageId) throw new Error('Use the shot’s required opening image.');
  if ((source?._id ?? null) !== (confirmedVideoId ?? null)) throw new Error('Review the original shot and confirm the video picture being replaced.');
  if (!source) return {};
  await requireApprovedResource(ctx, projectId, 'asset', source._id, undefined, actorId);
  const stored=source.storageId ? await ctx.db.system.get('_storage',source.storageId) : null;
  if (!stored || !stored.size || !sha256Equal(source.checksum,stored.sha256) || !stored.contentType?.startsWith('video/'))
    throw new Error('The required source video changed.');
  return { replacedVideo: {assetId:source._id,storageId:source.storageId!,checksum:stored.sha256,byteSize:stored.size} };
}

// Older repair receipts can point to the sound track of an earlier cartoon
// conversion. Follow only server-owned keep-source receipts back to the upload.
export async function originalPerformanceRecording(ctx: QueryCtx | MutationCtx, projectId: Id<'projects'>, start: Id<'assets'>, actorId?: Id<'users'>) {
  const seen = new Set<string>();
  let id = start;
  while (!seen.has(id) && seen.size < 12) {
    seen.add(id);
    const media = await ctx.db.get(id);
    if (!media || media.projectId!==projectId || media.scope!=='PROJECT' || media.deletedAt ||
        [media.rights,media.provenance,media.moderation].some(deniedRepairMedia))
      throw new Error('The original recording is unavailable.');
    const jobId=ctx.db.normalizeId('generationJobs',String(media.metadata?.generationJobId??''));
    const job=jobId?await ctx.db.get(jobId):null;
    const request=job?.request;
    if (!request || request.audioPolicy!=='KEEP_SOURCE' && !request.storyRepair?.audioSource) return id;
    await requireApprovedResource(ctx, projectId, 'asset', id, undefined, actorId);
    const take=job?.shotVersionId?await ctx.db.get(job.shotVersionId):null;
    const frozen=take?.contextSnapshot?.request;
    const certificate=request.storyRepair?.audioSource??request.editSource;
    const frozenCertificate=frozen?.storyRepair?.audioSource??frozen?.editSource;
    if (!take || !job || job.status!=='COMPLETED' || job.projectId!==projectId || job.response?.assetId!==id ||
        take.projectId!==projectId || take.assetId!==id || take.productionId!==job.productionId ||
        take.productionVersionId!==job.productionVersionId || take.shotId!==job.shotId || take.status!=='COMPLETED' ||
        !certificate?.hasAudio || JSON.stringify(certificate)!==JSON.stringify(frozenCertificate))
      throw new Error('The earlier edit cannot prove which recording it used.');
    const nextId=ctx.db.normalizeId('assets',String(certificate.assetId??''));
    const next=nextId?await ctx.db.get(nextId):null;
    const stored=next?.storageId?await ctx.db.system.get('_storage',next.storageId):null;
    if (!next || !stored || next.projectId!==projectId || next.storageId!==certificate.storageId ||
        stored.size!==certificate.byteSize || !sha256Equal(stored.sha256,certificate.checksum))
      throw new Error('The original recording changed.');
    id=next._id;
  }
  throw new Error('The original recording could not be resolved.');
}
