import { action, internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import type { QueryCtx, MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import type { FunctionReference } from 'convex/server';
import { v } from 'convex/values';
import { requireProjectRole } from './authorization';
import { resolveGenerationContinuity } from './generationContinuity';
import { object } from './generationWorkerContracts';

type ReadCtx = QueryCtx | MutationCtx;
const shotArgs = { productionId: v.id('productions'), shotId: v.id('shots') };
/** Measurements only. No provider duration/billing guarantee is inferred. */
export interface AudioSourceCertificate {
  assetId: string; storageId: string; checksum: string; byteSize: number;
  durationSeconds: number; audioCodec: string; sampleRate: number; channels: number; hasVideo: boolean;
}
function valid(source: AudioSourceCertificate) {
  return Boolean(source.assetId && source.storageId && source.checksum && Number.isSafeInteger(source.byteSize) && source.byteSize > 0 && source.byteSize <= 64 * 1024 * 1024 && Number.isFinite(source.durationSeconds) && source.durationSeconds > 0 && source.audioCodec && Number.isInteger(source.sampleRate) && source.sampleRate > 0 && Number.isInteger(source.channels) && source.channels > 0 && source.hasVideo === false);
}
export async function resolveAudioSourceCertificate(ctx: ReadCtx, args: { projectId: Id<'projects'>; assetId: Id<'assets'> }): Promise<AudioSourceCertificate> {
  const asset = await ctx.db.get(args.assetId);
  if (!asset || asset.projectId !== args.projectId || asset.scope !== 'PROJECT' || asset.deletedAt || !asset.storageId || !asset.mimeType?.startsWith('audio/')) throw new Error('Choose an audio recording stored in this project.');
  const storage = await ctx.db.system.get('_storage', asset.storageId);
  const probe = await ctx.db.query('verifiedAudioProbes').withIndex('by_asset', q => q.eq('assetId', asset._id)).unique();
  if (!storage || !probe || probe.projectId !== args.projectId || probe.storageId !== asset.storageId || probe.checksum !== storage.sha256 || probe.byteSize !== storage.size || !storage.contentType?.startsWith('audio/')) throw new Error('Measure the current stored recording before using its duration.');
  const source = { assetId: asset._id, storageId: asset.storageId, checksum: storage.sha256, byteSize: storage.size, durationSeconds: probe.durationSeconds, audioCodec: probe.audioCodec, sampleRate: probe.sampleRate, channels: probe.channels, hasVideo: probe.hasVideo };
  if (!valid(source)) throw new Error('Audio measurement is invalid or exceeds the local probe limit.');
  return source;
}
async function context(ctx: ReadCtx, args: { productionId: Id<'productions'>; shotId: Id<'shots'> }) {
  const production = await ctx.db.get(args.productionId); const shot = await ctx.db.get(args.shotId);
  if (!production?.projectId || !shot || shot.projectId !== production.projectId || shot.productionId !== production._id || shot.productionVersionId !== production.currentVersionId || object(shot.metadata).operation !== 'LIP_SYNC') throw new Error('Choose a lip-sync shot in the current project production.');
  const access = await requireProjectRole(ctx, production.projectId, ['OWNER', 'EDITOR']);
  if (access.project.archivedAt || access.project.deletedAt || access.project.moderationStatus === 'RESTRICTED') throw new Error('Restore access to the project before measuring its media.');
  const version = production.currentVersionId ? await ctx.db.get(production.currentVersionId) : null;
  if (!version || version.productionId !== production._id || version.status !== 'APPROVED') throw new Error('Approve the current production before measuring its recording.');
  const continuity = await resolveGenerationContinuity(ctx, { projectId: access.project._id, productionId: production._id, snapshot: version.planningContextSnapshot, explicitResourceVersionIds: object(shot.metadata).resourceVersionIds, referenceAssetIds: shot.requiredAssetIds || [] });
  const sources = [];
  for (const raw of continuity.referenceAssetIds) {
    const id = ctx.db.normalizeId('assets', raw); const asset = id ? await ctx.db.get(id) : null;
    if (!asset || asset.projectId !== access.project._id || asset.scope !== 'PROJECT' || asset.deletedAt || !asset.storageId) throw new Error('Import every reference into this project.');
    if (asset.mimeType?.startsWith('audio/')) sources.push(asset);
  }
  if (sources.length !== 1) throw new Error('Select exactly one project recording to measure.');
  const asset = sources[0]; const storage = await ctx.db.system.get('_storage', asset.storageId!);
  if (!storage || !storage.contentType?.startsWith('audio/') || storage.size <= 0 || storage.size > 64 * 1024 * 1024) throw new Error('Recording exceeds the local 64MiB probe limit.');
  const cached = await ctx.db.query('verifiedAudioProbes').withIndex('by_asset', q => q.eq('assetId', asset._id)).unique();
  return { asset, storage, projectId: access.project._id, cached };
}
export const sourceContext = internalQuery({ args: shotArgs, returns: v.any(), handler: async (ctx, args) => {
  const value = await context(ctx, args); const url = await ctx.storage.getUrl(value.asset.storageId!);
  if (!url) throw new Error('Recording is unavailable.');
  const cached = value.cached && value.cached.storageId === value.asset.storageId && value.cached.checksum === value.storage.sha256 && value.cached.byteSize === value.storage.size;
  return { assetId: value.asset._id, storageId: value.asset.storageId, checksum: value.storage.sha256, byteSize: value.storage.size, url, ...(cached ? { source: await resolveAudioSourceCertificate(ctx, { projectId: value.projectId, assetId: value.asset._id }) } : {}) };
} });
export const recordProbe = internalMutation({
  args: { ...shotArgs, assetId: v.id('assets'), storageId: v.id('_storage'), checksum: v.string(), byteSize: v.number(), probe: v.any() }, returns: v.any(),
  handler: async (ctx, args) => {
    const value = await context(ctx, args);
    if (value.asset._id !== args.assetId || value.asset.storageId !== args.storageId || value.storage.sha256 !== args.checksum || value.storage.size !== args.byteSize) throw new Error('Recording storage changed while it was measured.');
    const probe = object(args.probe);
    const source = { assetId: args.assetId, storageId: args.storageId, checksum: args.checksum, byteSize: args.byteSize, durationSeconds: Number(probe.durationSeconds), audioCodec: typeof probe.audioCodec === 'string' ? probe.audioCodec : '', sampleRate: Number(probe.sampleRate), channels: Number(probe.channels), hasVideo: probe.hasVideo === true };
    if (!valid(source) || probe.hasAudio !== true || probe.hasVideo !== false || probe.byteSize !== args.byteSize) throw new Error('Audio measurement is invalid.');
    const row = { projectId: value.projectId, ...source, probedAt: Date.now() };
    if (value.cached) await ctx.db.patch(value.cached._id, row); else await ctx.db.insert('verifiedAudioProbes', row);
    return source;
  },
});
export const prepareSource = action({ args: shotArgs, returns: v.any(), handler: async (ctx, args): Promise<AudioSourceCertificate> => {
  const refs = (internal as unknown as { audioCertificates: Record<string, FunctionReference<any, 'internal', any, any>> }).audioCertificates;
  const value = await ctx.runQuery(refs.sourceContext, args);
  if (value.source) return value.source;
  const base = process.env.RENDER_WORKER_URL?.trim(); const secret = process.env.RENDER_WORKER_SHARED_SECRET?.trim();
  if (!base || !secret) throw new Error('Audio measurement is not configured.');
  const response = await fetch(base.replace(/\/$/, '') + '/media/probe', { method: 'POST', headers: { 'content-type': 'application/json', 'x-finalframe-worker-secret': secret }, body: JSON.stringify({ url: value.url, kind: 'audio' }), redirect: 'error', signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error('The recording could not be measured.');
  return ctx.runMutation(refs.recordProbe, { ...args, assetId: value.assetId, storageId: value.storageId, checksum: value.checksum, byteSize: value.byteSize, probe: await response.json() });
} });
