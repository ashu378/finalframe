import { internalAction, internalMutation, internalQuery } from './_generated/server';
import type { QueryCtx, MutationCtx, ActionCtx } from './_generated/server';
import type { Id, Doc } from './_generated/dataModel';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import { resolveStoryRepair, ACTION_MOTION_REPAIR_VERSION } from './storyActionRepairs';
import { requireProjectRole, resolveProjectAccessForActor } from './authorization';
import { requireApprovedResource, ensureResourceState } from './resourceStates';
import { resolveVideoEditSourceCertificate } from './videoRouting';
import {
  assertFrameToRegion,
  assertFrameToRegionProof,
} from '../renderer/src/media/frame-to-region-contract';
import { sha256Equal } from '../renderer/src/media/sha256';
import { ACTION_WINDOW_MAX_BYTES } from '../renderer/src/media/action-window-contract';
const object = (v: unknown): Record<string, any> =>
  v && typeof v === 'object' ? (v as Record<string, any>) : {};
const denied = (value: unknown) => {
  const r = object(value);
  return (
    r.approved === false ||
    r.consent === false ||
    ['DENIED', 'REJECTED', 'REVOKED', 'EXPIRED', 'BLOCKED', 'RESTRICTED', 'QUARANTINED'].includes(
      String(typeof value === 'string' ? value : (r.status ?? r.state ?? '')).toUpperCase(),
    )
  );
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const refs = (internal as any).frameRegionRepairs;
type Ctx = QueryCtx | MutationCtx;
type Lease = { jobId: Id<'generationJobs'>; leaseId: string };
const leaseArgs = { jobId: v.id('generationJobs'), leaseId: v.string() };

async function sourceContext(ctx: Ctx, takeId: Id<'shotVersions'>, actorId?: Id<'users'>) {
  const take = await ctx.db.get(takeId);
  if (!take?.projectId) throw new Error('REPAIR_SOURCE_UNAVAILABLE');
  const access = actorId
    ? await resolveProjectAccessForActor(ctx, take.projectId, actorId, ['OWNER', 'EDITOR'])
    : await requireProjectRole(ctx, take.projectId, ['OWNER', 'EDITOR']);
  const production = await ctx.db.get(take.productionId!);
  const version = take.productionVersionId ? await ctx.db.get(take.productionVersionId) : null;
  if (
    access.project.archivedAt ||
    version?.status !== 'APPROVED' ||
    production?.currentVersionId !== take.productionVersionId
  )
    throw new Error('REPAIR_SOURCE_UNAVAILABLE');
  const repair = await resolveStoryRepair(ctx, takeId, take.shotId, false, true);
  await requireApprovedResource(ctx, take.projectId, 'asset', repair.assetId, undefined, actorId);
  if ([repair.data.asset.rights, repair.data.asset.provenance, repair.data.asset.moderation].some(denied))
    throw new Error('REPAIR_SOURCE_UNAVAILABLE');
  const source = await resolveVideoEditSourceCertificate(ctx, {
    projectId: take.projectId,
    referenceAssetIds: [repair.assetId],
  });
  const contract = assertFrameToRegion(repair.proof.frameToRegion);
  const review = await ctx.db.get(repair.proof.regionReviewId!);
  if (
    !review ||
    review.takeId !== takeId ||
    review.requirementKey !== repair.proof.requirementKey ||
    !sha256Equal(review.repairRegion?.sourceChecksum, source.checksum)
  )
    throw new Error('FRAME_TO_REGION_BINDING_CHANGED');
  return { take, access, repair, source, contract, review };
}
/** Exact deterministic derivatives of an explicitly approved source region.
 * This approval permits reference use only; generated takes remain unapproved. */
export async function resolveFrameRegionAnchors(ctx: Ctx, takeId: Id<'shotVersions'>, actorId?: Id<'users'>) {
  const data = await sourceContext(ctx, takeId, actorId),
    receipt = data.review.repairFrames;
  if (
    !receipt ||
    receipt.sourceKind !== 'CREATOR_CONFIRMED_ORIGINAL_CARTOON' ||
    !sha256Equal(receipt.sourceChecksum, data.source.checksum) ||
    !same(assertFrameToRegion(receipt.contract), data.contract)
  )
    throw new Error('FRAME_TO_REGION_PREPARATION_REQUIRED');
  assertFrameToRegionProof(data.contract, receipt.proof, 'PREPARED');
  const assets = [];
  for (const [index, id] of [receipt.firstAssetId, receipt.lastAssetId].entries()) {
    const asset = await ctx.db.get(id),
      stored = asset?.storageId ? await ctx.db.system.get('_storage', asset.storageId) : null;
    const expected = object(receipt.proof)[index ? 'lastAnchor' : 'firstAnchor'];
    if (
      !asset ||
      asset.projectId !== data.take.projectId ||
      asset.scope !== 'PROJECT' ||
      asset.deletedAt ||
      asset.originAssetId !== data.source.assetId ||
      !stored ||
      asset.mimeType !== 'image/png' ||
      stored.contentType !== 'image/png' ||
      !expected ||
      !sha256Equal(expected.checksum, stored.sha256) ||
      expected.byteSize !== stored.size ||
      !sha256Equal(asset.checksum, stored.sha256) ||
      asset.width !== 640 ||
      asset.height !== 640
    )
      throw new Error('FRAME_TO_REGION_BINDING_CHANGED');
    await requireApprovedResource(ctx, data.take.projectId!, 'asset', id, undefined, actorId);
    assets.push(asset);
  }
  return {
    source: data.source,
    contract: data.contract,
    reviewId: data.review._id,
    firstAssetId: assets[0]._id,
    lastAssetId: assets[1]._id,
    anchorProof: receipt.proof,
  };
}
export const preparationContext = internalQuery({
  args: { takeId: v.id('shotVersions') },
  returns: v.any(),
  handler: async (ctx, args) => {
    const data = await sourceContext(ctx, args.takeId);
    if (data.review.repairFrames) {
      await resolveFrameRegionAnchors(ctx, args.takeId);
      return { ready: true };
    }
    return {
      ready: false,
      reviewId: data.review._id,
      frameToRegion: data.contract,
      source: { ...data.source, url: await ctx.storage.getUrl(data.source.storageId as Id<'_storage'>) },
    };
  },
});
export const recordAnchors = internalMutation({
  args: {
    takeId: v.id('shotVersions'),
    cartoonSourceConfirmed: v.literal(true),
    reviewId: v.id('storyActionReviews'),
    firstStorageId: v.id('_storage'),
    lastStorageId: v.id('_storage'),
    proof: v.any(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const data = await sourceContext(ctx, args.takeId);
    if (args.cartoonSourceConfirmed !== true) throw new Error('FRAME_TO_REGION_CARTOON_SOURCE_REQUIRED');
    if (data.review._id !== args.reviewId) throw new Error('FRAME_TO_REGION_BINDING_CHANGED');
    if (data.review.repairFrames) {
      await resolveFrameRegionAnchors(ctx, args.takeId);
      return false;
    }
    const proof = assertFrameToRegionProof(data.contract, args.proof, 'PREPARED');
    const ids: Id<'assets'>[] = [];
    for (const [index, storageId] of [args.firstStorageId, args.lastStorageId].entries()) {
      const stored = await ctx.db.system.get('_storage', storageId),
        anchor = object(proof[index ? 'lastAnchor' : 'firstAnchor']);
      if (
        !stored ||
        stored.contentType !== 'image/png' ||
        stored.size < 1 ||
        stored.size > 5_000_000 ||
        stored.size !== anchor.byteSize ||
        !sha256Equal(stored.sha256, anchor.checksum) ||
        anchor.width !== 640 ||
        anchor.height !== 640 ||
        anchor.sourceFrame !==
          (index ? data.contract.region.window.endFrame - 1 : data.contract.region.window.startFrame)
      )
        throw new Error('FRAME_TO_REGION_BINDING_CHANGED');
      const assetId = await ctx.db.insert('assets', {
        studioExternalId: data.access.project.studioExternalId,
        studioId: data.access.project.studioId,
        projectId: data.take.projectId,
        productionId: data.take.productionId,
        scope: 'PROJECT',
        source: 'DERIVED_REFERENCE',
        ...(data.repair.data.asset.rights ? { rights: data.repair.data.asset.rights } : {}),
        originAssetId: data.source.assetId as Id<'assets'>,
        roles: ['REPAIR_FRAME'],
        name: index ? 'Repair last source frame' : 'Repair first source frame',
        storageId,
        mimeType: 'image/png',
        byteSize: stored.size,
        checksum: stored.sha256,
        width: anchor.width,
        height: anchor.height,
        metadata: { kind: 'IMAGE', repairReviewId: data.review._id, sourceFrame: anchor.sourceFrame },
        provenance: {
          kind: 'SOURCE_FRAME_CROP',
          sourceAssetId: data.source.assetId,
          sourceChecksum: data.source.checksum,
          reviewId: data.review._id,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ensureResourceState(ctx, {
        projectId: data.take.projectId!,
        productionId: data.take.productionId,
        resourceType: 'asset',
        resourceId: assetId,
        initialState: 'LOCKED',
      });
      await ctx.db.insert('approvals', {
        studioExternalId: data.access.project.studioExternalId,
        studioId: data.access.project.studioId,
        projectId: data.take.projectId,
        productionId: data.take.productionId,
        resourceType: 'asset',
        resourceId: assetId,
        decision: 'APPROVED_SOURCE_DERIVATIVE',
        actorUserId: data.access.user._id,
        note: 'Creator requested exact first/last frames from the approved repair region. Reference use only; no generated result approved.',
        createdAt: Date.now(),
      });
      ids.push(assetId);
    }
    await ctx.db.patch(data.review._id, {
      repairFrames: {
        version: 'FRAME_TO_REGION_V1',
        sourceKind: 'CREATOR_CONFIRMED_ORIGINAL_CARTOON',
        sourceChecksum: data.source.checksum,
        contract: data.contract,
        proof,
        firstAssetId: ids[0],
        lastAssetId: ids[1],
        createdByUserId: data.access.user._id,
        createdAt: Date.now(),
      },
    });
    return true;
  },
});
/** Reconcile a failed preparation acknowledgement before removing temporary
 * uploads. An adopted anchor or any asset-backed object is always retained. */
export const discardUnadoptedAnchors = internalMutation({
  args: { reviewId: v.id('storyActionReviews'), storageIds: v.array(v.id('_storage')) },
  returns: v.number(),
  handler: async (ctx, args) => {
    if (args.storageIds.length !== 2) throw new Error('FRAME_TO_REGION_BINDING_CHANGED');
    const review = await ctx.db.get(args.reviewId);
    if (!review) return 0;
    const receipt = object(review.repairFrames),
      protectedIds = new Set<string>();
    for (const assetId of [receipt.firstAssetId, receipt.lastAssetId]) {
      if (typeof assetId !== 'string') continue;
      const id = ctx.db.normalizeId('assets', assetId),
        asset = id ? await ctx.db.get(id) : null;
      if (asset?.storageId) protectedIds.add(asset.storageId);
    }
    let deleted = 0;
    for (const storageId of new Set(args.storageIds)) {
      if (
        protectedIds.has(storageId) ||
        (await ctx.db
          .query('assets')
          .withIndex('by_storage', (q) => q.eq('storageId', storageId))
          .first())
      )
        continue;
      await ctx.storage.delete(storageId);
      deleted++;
    }
    return deleted;
  },
});
async function workerFetch(body: unknown) {
  const base = process.env.RENDER_WORKER_URL?.trim(),
    secret = process.env.RENDER_WORKER_SHARED_SECRET?.trim();
  if (!base || !secret) throw new Error('FRAME_TO_REGION_WORKER_UNAVAILABLE');
  try {
    return await fetch(base.replace(/\/$/, '') + '/media/frame-to-region', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-finalframe-worker-secret': secret },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(185000),
    });
  } catch {
    throw Object.assign(new Error('The motion processor is unavailable; saved media can resume.'), {
      code: 'FRAME_TO_REGION_WORKER_UNAVAILABLE',
    });
  }
}
export const prepare = internalAction({
  args: { takeId: v.id('shotVersions'), cartoonSourceConfirmed: v.literal(true) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(refs.preparationContext, { takeId: args.takeId });
    if (data.ready) return null;
    const response = await workerFetch({
      operation: 'PREPARE',
      source: data.source,
      frameToRegion: data.frameToRegion,
    });
    if (!response.ok) throw new Error('FRAME_TO_REGION_WORKER_UNAVAILABLE');
    const text = await response.text();
    if (text.length > 14_000_000) throw new Error('FRAME_TO_REGION_BINDING_CHANGED');
    const result = JSON.parse(text);
    const proof = assertFrameToRegionProof(data.frameToRegion, result.proof, 'PREPARED');
    const storageIds: Id<'_storage'>[] = [];
    let commitAttempted = false;
    try {
      for (const anchor of [result.firstFrame, result.lastFrame]) {
        if (typeof anchor?.base64 !== 'string' || anchor.base64.length > 7_000_000)
          throw new Error('FRAME_TO_REGION_BINDING_CHANGED');
        const bytes = Uint8Array.from(atob(anchor.base64), (c) => c.charCodeAt(0));
        if (bytes.length !== anchor.byteSize) throw new Error('FRAME_TO_REGION_BINDING_CHANGED');
        storageIds.push(await ctx.storage.store(new Blob([bytes], { type: 'image/png' })));
      }
      const { base64: _first, ...firstAnchor } = result.firstFrame,
        { base64: _last, ...lastAnchor } = result.lastFrame;
      commitAttempted = true;
      const adopted = await ctx.runMutation(refs.recordAnchors, {
        ...args,
        reviewId: data.reviewId,
        firstStorageId: storageIds[0],
        lastStorageId: storageIds[1],
        proof: { ...proof, firstAnchor, lastAnchor },
      });
      if (!adopted) for (const id of storageIds) await ctx.storage.delete(id);
    } catch (error) {
      if (!commitAttempted) for (const id of storageIds) await ctx.storage.delete(id);
      else
        await ctx
          .runMutation(refs.discardUnadoptedAnchors, { reviewId: data.reviewId, storageIds })
          .catch(() => undefined);
      throw error;
    }
    return null;
  },
});
async function jobContext(ctx: Ctx, args: Lease) {
  const job = await ctx.db.get(args.jobId),
    request = object(job?.request),
    repair = object(request.storyRepair);
  if (
    !job ||
    job.leaseId !== args.leaseId ||
    !job.leaseExpiresAt ||
    job.leaseExpiresAt <= Date.now() ||
    repair.approachVersion !== ACTION_MOTION_REPAIR_VERSION ||
    request.operation !== 'FRAME_TO_VIDEO'
  )
    throw new Error('FRAME_TO_REGION_BINDING_CHANGED');
  const contract = assertFrameToRegion(repair.frameToRegion),
    source = object(repair.source),
    asset = await ctx.db.get(source.assetId as Id<'assets'>),
    stored = asset?.storageId ? await ctx.db.system.get('_storage', asset.storageId) : null;
  if (
    !stored ||
    !asset ||
    asset.deletedAt ||
    [asset.rights, asset.provenance, asset.moderation].some(denied) ||
    asset.projectId !== job.projectId ||
    asset.scope !== 'PROJECT' ||
    asset.storageId !== source.storageId ||
    !sha256Equal(stored.sha256, source.checksum) ||
    stored.size !== source.byteSize ||
    contract.region.window.width !== source.width ||
    contract.region.window.height !== source.height
  )
    throw new Error('FRAME_TO_REGION_BINDING_CHANGED');
  await requireApprovedResource(ctx, job.projectId!, 'asset', asset._id, undefined, job.createdByUserId);
  return {
    job,
    contract,
    source: {
      ...source,
      hasAudio: source.hasAudio === true,
      url: await ctx.storage.getUrl(asset.storageId!),
    },
  };
}
export const context = internalQuery({
  args: leaseArgs,
  returns: v.any(),
  handler: async (ctx, args) => {
    const data = await jobContext(ctx, args),
      response = object(data.job.response),
      receipts: Record<string, unknown> = {};
    for (const key of ['actionWindowRaw', 'actionWindowComposed']) {
      const row = object(response[key]);
      if (!row.storageId) continue;
      const stored = await ctx.db.system.get('_storage', row.storageId);
      if (!stored || !sha256Equal(stored.sha256, row.checksum) || stored.size !== row.byteSize)
        throw new Error('FRAME_TO_REGION_BINDING_CHANGED');
      receipts[key] = { ...row, url: await ctx.storage.getUrl(row.storageId) };
    }
    return { frameToRegion: data.contract, source: data.source, ...receipts };
  },
});
export const record = internalMutation({
  args: {
    ...leaseArgs,
    phase: v.union(v.literal('RAW'), v.literal('COMPOSED')),
    storageId: v.id('_storage'),
    proof: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { job, contract, source } = await jobContext(ctx, args),
      response = object(job.response),
      key = args.phase === 'RAW' ? 'actionWindowRaw' : 'actionWindowComposed',
      old = object(response[key]);
    if (old.storageId) {
      if (old.storageId !== args.storageId) throw new Error('FRAME_TO_REGION_OUTPUT_CONFLICT');
      return null;
    }
    if (!job.providerJobId || (args.phase === 'COMPOSED' && !response.actionWindowRaw))
      throw new Error('FRAME_TO_REGION_BINDING_CHANGED');
    const stored = await ctx.db.system.get('_storage', args.storageId);
    if (
      !stored ||
      stored.contentType !== 'video/mp4' ||
      stored.size < 1 ||
      stored.size > ACTION_WINDOW_MAX_BYTES
    )
      throw new Error('FRAME_TO_REGION_BINDING_CHANGED');
    if (args.phase === 'COMPOSED') {
      const proof = assertFrameToRegionProof(contract, args.proof, 'COMPOSED');
      if (
        !sha256Equal(stored.sha256, proof.checksum) ||
        stored.size !== proof.byteSize ||
        (source.hasAudio === true && proof.originalAudioCopied !== true)
      )
        throw new Error('FRAME_TO_REGION_BINDING_CHANGED');
    }
    await ctx.db.patch(job._id, {
      response: {
        ...response,
        [key]: {
          storageId: args.storageId,
          checksum: stored.sha256,
          byteSize: stored.size,
          ...(args.proof ? { proof: args.proof } : {}),
          recordedAt: Date.now(),
        },
      },
      updatedAt: Date.now(),
    });
    return null;
  },
});
/** Deletes only this action's newly uploaded, unadopted object. Read-after-error
 * distinguishes a lost acknowledgement from a rejected record transaction. */
export const discardUnadopted = internalMutation({
  args: { jobId: v.id('generationJobs'), storageId: v.id('_storage') },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || object(object(job.request).storyRepair).approachVersion !== ACTION_MOTION_REPAIR_VERSION)
      return false;
    const response = object(job.response);
    if (
      ['actionWindowRaw', 'actionWindowComposed'].some(
        (k) => object(response[k]).storageId === args.storageId,
      )
    )
      return false;
    if (
      await ctx.db
        .query('assets')
        .withIndex('by_storage', (q) => q.eq('storageId', args.storageId))
        .first()
    )
      return false;
    await ctx.storage.delete(args.storageId);
    return true;
  },
});
export async function frameRegionProcessing<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if ((error as { code?: string }).code) throw error;
    const invalid =
      error instanceof Error &&
      /FRAME_TO_REGION_(BINDING_CHANGED|CONTRACT_INVALID|OUTPUT_CONFLICT|COMPOSITION_REQUIRED)/.test(
        error.message,
      );
    throw Object.assign(
      new Error(
        invalid
          ? 'The saved motion did not match its approved repair contract. Review the retained result.'
          : 'Motion processing was interrupted; saved stages can resume.',
      ),
      { code: invalid ? 'FRAME_TO_REGION_MEDIA_INVALID' : 'FRAME_TO_REGION_WORKER_UNAVAILABLE' },
    );
  }
}
async function adopt(
  ctx: ActionCtx,
  args: Lease,
  phase: 'RAW' | 'COMPOSED',
  storageId: Id<'_storage'>,
  proof?: unknown,
) {
  try {
    await ctx.runMutation(refs.record, { ...args, phase, storageId, ...(proof ? { proof } : {}) });
  } catch (error) {
    await ctx.runMutation(refs.discardUnadopted, { jobId: args.jobId, storageId }).catch(() => undefined);
    throw error;
  }
}
export async function getFrameRegionState(ctx: ActionCtx, args: Lease) {
  return ctx.runQuery(refs.context, args);
}
export async function retainFrameRegionRaw(ctx: ActionCtx, args: Lease, body: ArrayBuffer) {
  return frameRegionProcessing(async () => {
    if (body.byteLength < 1 || body.byteLength > ACTION_WINDOW_MAX_BYTES)
      throw new Error('FRAME_TO_REGION_BINDING_CHANGED');
    const storageId = await ctx.storage.store(new Blob([body], { type: 'video/mp4' }));
    await adopt(ctx, args, 'RAW', storageId);
  });
}
export async function composeFrameRegionOutput(ctx: ActionCtx, args: Lease) {
  return frameRegionProcessing(async () => {
    const data = await getFrameRegionState(ctx, args);
    if (data.actionWindowComposed) return data.actionWindowComposed;
    if (!data.actionWindowRaw) throw new Error('FRAME_TO_REGION_BINDING_CHANGED');
    const response = await workerFetch({
      operation: 'COMPOSE',
      source: data.source,
      repair: data.actionWindowRaw,
      frameToRegion: data.frameToRegion,
    });
    if (!response.ok)
      throw Object.assign(
        new Error('Animated region processing was interrupted; the accepted clip remains saved.'),
        {
          code:
            response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status)
              ? 'FRAME_TO_REGION_MEDIA_INVALID'
              : 'FRAME_TO_REGION_WORKER_UNAVAILABLE',
        },
      );
    const raw = response.headers.get('x-finalframe-frame-to-region');
    if (!raw || raw.length > 10000 || response.headers.get('content-type') !== 'video/mp4' || !response.body)
      throw new Error('FRAME_TO_REGION_BINDING_CHANGED');
    const proof = assertFrameToRegionProof(data.frameToRegion, JSON.parse(raw), 'COMPOSED');
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.length;
        if (bytes > ACTION_WINDOW_MAX_BYTES) throw new Error('FRAME_TO_REGION_BINDING_CHANGED');
        chunks.push(next.value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    if (bytes !== proof.byteSize) throw new Error('FRAME_TO_REGION_BINDING_CHANGED');
    const storageId = await ctx.storage.store(new Blob(chunks as BlobPart[], { type: 'video/mp4' }));
    await adopt(ctx, args, 'COMPOSED', storageId, proof);
    return { storageId, byteSize: proof.byteSize, url: await ctx.storage.getUrl(storageId) };
  });
}
export async function requireFrameRegionComposition(
  ctx: Ctx,
  job: Doc<'generationJobs'>,
  storageId: Id<'_storage'>,
) {
  const receipt = object(object(job.response).actionWindowComposed);
  if (receipt.storageId !== storageId) throw new Error('FRAME_TO_REGION_COMPOSITION_REQUIRED');
  assertFrameToRegionProof(
    assertFrameToRegion(object(object(job.request).storyRepair).frameToRegion),
    receipt.proof,
    'COMPOSED',
  );
}
