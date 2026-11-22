import { action, query, internalQuery, internalMutation } from './_generated/server';
import type { QueryCtx, MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import { requireProjectRole } from './authorization';
import { reviewContext } from './storyActionReviews';
import { ensureResourceState, requireEditable } from './resourceStates';
import {
  savedFrameRegionSource,
  storeFrameRegionComposition,
  deniedRepairMedia,
} from './frameRegionRepairs';
import {
  assertFrameToRegionProof,
  timedFrameSelection,
  actionTimingBounds,
} from '../renderer/src/media/frame-to-region-contract';
import { sha256Equal } from '../renderer/src/media/sha256';

const refs = (internal as any).repairTiming;
const args = {
  takeId: v.id('shotVersions'),
  reviewId: v.id('storyActionReviews'),
  actionId: v.string(),
  providerFrame: v.number(),
};
type Input = {
  takeId: Id<'shotVersions'>;
  reviewId: Id<'storyActionReviews'>;
  actionId: string;
  providerFrame: number;
};
type Ctx = QueryCtx | MutationCtx;
async function context(ctx: Ctx, takeId: Id<'shotVersions'>) {
  const take = await ctx.db.get(takeId);
  if (!take?.projectId) throw new Error('Take unavailable.');
  const access = await requireProjectRole(ctx, take.projectId, ['OWNER', 'EDITOR']);
  if (
    process.env.FINALFRAME_FRAME_TO_REGION_REPAIR_ENABLED !== 'true' ||
    access.project.archivedAt ||
    take.status !== 'COMPLETED'
  )
    return null;
  const { latest, actions, requirementKey, asset, shot } = await reviewContext(ctx, takeId);
  if (
    !latest ||
    latest.requirementKey !== requirementKey ||
    latest.passed ||
    !asset.storageId ||
    asset.scope !== 'PROJECT' ||
    [asset.rights, asset.provenance, asset.moderation].some(deniedRepairMedia)
  )
    return null;
  const jobId = ctx.db.normalizeId('generationJobs', String(asset.metadata?.generationJobId ?? ''));
  const job = jobId ? await ctx.db.get(jobId) : null;
  if (
    !job ||
    job.status !== 'COMPLETED' ||
    job.projectId !== take.projectId ||
    job.productionId !== take.productionId ||
    job.productionVersionId !== take.productionVersionId ||
    job.shotId !== take.shotId ||
    job.shotVersionId !== takeId ||
    job.response?.assetId !== asset._id ||
    job.request?.storyRepairMode !== 'ANIMATE_MOTION'
  )
    return null;
  const version = await ctx.db.get(job.productionVersionId!),
    production = await ctx.db.get(job.productionId!),
    scene = await ctx.db.get(shot.sceneId);
  if (
    !production ||
    production.currentVersionId !== job.productionVersionId ||
    version?.status !== 'APPROVED' ||
    !scene ||
    [scene.status, shot.status].some((s) => s === 'ARCHIVED' || s === 'DELETED')
  )
    return null;
  const { contract, source } = await savedFrameRegionSource(ctx, job);
  const raw = job.response.actionWindowRaw,
    composed = job.response.actionWindowComposed;
  if (
    !raw?.storageId ||
    !composed ||
    composed.storageId !== asset.storageId ||
    !sha256Equal(composed.checksum, asset.checksum)
  )
    return null;
  const baseProof = assertFrameToRegionProof(contract, composed.proof, 'COMPOSED');
  const base = await ctx.db.system.get('_storage', asset.storageId);
  if (
    !base ||
    base.contentType !== 'video/mp4' ||
    !sha256Equal(base.sha256, baseProof.checksum) ||
    !sha256Equal(base.sha256, asset.checksum) ||
    base.size !== baseProof.byteSize
  )
    return null;
  const stored = await ctx.db.system.get('_storage', raw.storageId);
  if (
    !stored ||
    stored.contentType !== 'video/mp4' ||
    stored.size !== raw.byteSize ||
    !sha256Equal(stored.sha256, raw.checksum)
  )
    return null;
  const choices = actions.flatMap((a) => {
    if (
      a.beforeSeconds === null ||
      !latest.observations.some((o) => o.actionId === a.id && o.result === 'FAIL')
    )
      return [];
    const targetFrame = Math.floor(a.beforeSeconds * 24 + 1e-7) - contract.region.window.startFrame - 1;
    const supported = actionTimingBounds(contract, targetFrame);
    if (!supported) return [];
    return [
      {
        actionId: a.id,
        label: a.action,
        deadline: a.beforeSeconds,
        targetFrame,
        ...supported,
      },
    ];
  });
  if (!choices.length) return null;
  return {
    take,
    shot,
    projectId: take.projectId,
    productionId: production._id,
    productionVersionId: version._id,
    asset,
    source,
    reviewId: latest._id,
    jobId: job._id,
    frameToRegion: contract,
    actionWindowRaw: { ...raw, url: await ctx.storage.getUrl(raw.storageId) },
    choices,
  };
}
export const option = query({
  args: { takeId: v.id('shotVersions') },
  returns: v.any(),
  handler: async (ctx, { takeId }) => {
    const c = await context(ctx, takeId);
    return c
      ? {
          choices: c.choices.map(({ targetFrame: _t, ...item }) => item),
          clipUrl: c.actionWindowRaw.url,
          reviewId: c.reviewId,
        }
      : null;
  },
});
async function selected(ctx: Ctx, input: Input) {
  const c = await context(ctx, input.takeId);
  const action = c?.choices.find((a) => a.actionId === input.actionId);
  if (!c || c.reviewId !== input.reviewId || !action)
    throw new Error('Review this exact take and mark the late action first.');
  const timing = { providerFrame: input.providerFrame, targetFrame: action.targetFrame };
  timedFrameSelection(c.frameToRegion, timing);
  const key = JSON.stringify([
    c.jobId,
    c.reviewId,
    action.actionId,
    timing.providerFrame,
    timing.targetFrame,
  ]);
  const takes = await ctx.db
    .query('shotVersions')
    .withIndex('by_shot', (q) => q.eq('shotId', c.shot._id))
    .take(201);
  const prior = takes.find((t) => t.contextSnapshot?.actionTimingKey === key);
  if (!prior && takes.length >= 200) throw new Error('This shot has reached its take limit.');
  return { c, timing, key, prior, nextNumber: Math.max(0, ...takes.map((t) => t.versionNumber)) + 1 };
}
export const prepare = internalQuery({
  args,
  returns: v.any(),
  handler: async (ctx, input) => {
    const { c, timing, prior } = await selected(ctx, input);
    if (prior) return { takeId: prior._id };
    return {
      source: c.source,
      actionWindowRaw: c.actionWindowRaw,
      frameToRegion: c.frameToRegion,
      timing,
    };
  },
});
export const adopt = internalMutation({
  args: { ...args, storageId: v.id('_storage'), proof: v.any() },
  returns: v.id('shotVersions'),
  handler: async (ctx, input) => {
    const { c, timing, key, prior, nextNumber } = await selected(ctx, input);
    if (prior) return prior._id;
    await requireEditable(ctx, c.projectId, 'shot', c.shot._id);
    await requireEditable(ctx, c.projectId, 'scene', c.shot.sceneId);
    const proof = assertFrameToRegionProof(c.frameToRegion, input.proof, 'COMPOSED', timing);
    const stored = await ctx.db.system.get('_storage', input.storageId);
    if (
      !stored ||
      stored.contentType !== 'video/mp4' ||
      stored.size !== proof.byteSize ||
      !sha256Equal(stored.sha256, proof.checksum) ||
      (c.source.hasAudio && !proof.originalAudioCopied)
    )
      throw new Error('The retimed output could not be verified.');
    const now = Date.now(),
      shared = {
        projectId: c.projectId,
        productionId: c.productionId,
        studioExternalId: c.asset.studioExternalId,
        studioId: c.asset.studioId,
      };
    const lineage = {
      sourceJobId: c.jobId,
      sourceTakeId: c.take._id,
      reviewId: c.reviewId,
      actionId: input.actionId,
      actionTiming: timing,
    };
    const assetId = await ctx.db.insert('assets', {
      ...shared,
      scope: 'PROJECT',
      source: 'EDITED',
      name: 'Retimed action',
      originAssetId: c.asset._id,
      roles: ['FOOTAGE'],
      mimeType: 'video/mp4',
      storageId: input.storageId,
      checksum: stored.sha256,
      byteSize: stored.size,
      width: proof.width,
      height: proof.height,
      durationSeconds: proof.outputFrames / 24,
      frameRate: 24,
      rights: c.asset.rights,
      moderation: c.asset.moderation,
      provenance: { kind: 'LOCAL_TIMING_EDIT', ...lineage },
      metadata: { ...lineage, proof },
      createdAt: now,
    });
    const takeId = await ctx.db.insert('shotVersions', {
      ...shared,
      productionVersionId: c.productionVersionId,
      shotId: c.shot._id,
      versionNumber: nextNumber,
      status: 'COMPLETED',
      assetId,
      actualCost: 0,
      promptSnapshot: c.take.promptSnapshot,
      contextSnapshot: { ...lineage, actionTimingKey: key, source: 'LOCAL_TIMING_EDIT' },
      createdAt: now,
    });
    for (const [resourceType, id] of [
      ['asset', assetId],
      ['shotVersion', takeId],
    ] as const)
      await ensureResourceState(ctx, {
        projectId: c.projectId,
        productionId: c.productionId,
        resourceType,
        resourceId: id,
      });
    return takeId;
  },
});
/** Only called with the newly created output ID. Lost acknowledgements and
 * concurrent confirmations may point at an already adopted output. */
export const cleanup = internalMutation({
  args: { storageId: v.id('_storage') },
  returns: v.null(),
  handler: async (ctx, { storageId }) => {
    if (
      !(await ctx.db
        .query('assets')
        .withIndex('by_storage', (q) => q.eq('storageId', storageId))
        .first())
    )
      await ctx.storage.delete(storageId);
    return null;
  },
});
export const create = action({
  args,
  returns: v.id('shotVersions'),
  handler: async (ctx, input): Promise<Id<'shotVersions'>> => {
    const data = await ctx.runQuery(refs.prepare, input);
    if (data.takeId) return data.takeId;
    const { storageId, proof } = await storeFrameRegionComposition(ctx, data, data.timing);
    try {
      return await ctx.runMutation(refs.adopt, { ...input, storageId, proof });
    } finally {
      await ctx.runMutation(refs.cleanup, { storageId }).catch(() => undefined);
    }
  },
});
