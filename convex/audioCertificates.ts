import { action, internalAction, internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import type { QueryCtx, MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import type { FunctionReference } from 'convex/server';
import { v } from 'convex/values';
import { requireProjectRole } from './authorization';
import { resolveGenerationContinuity } from './generationContinuity';
import { object } from './generationWorkerContracts';
import { resolveVoiceSynthesisInput } from './voices';
import { REVIEWED_OPERATION_CONTRACTS } from '../src/lib/ai/model-registry';
import { normalizeSha256 } from '../renderer/src/media/sha256';

type ReadCtx = QueryCtx | MutationCtx;
const shotArgs = { productionId: v.id('productions'), shotId: v.id('shots') };
/** Measurements only. No provider duration/billing guarantee is inferred. */
export interface AudioSourceCertificate {
  assetId: string; storageId: string; checksum: string; byteSize: number;
  durationSeconds: number; audioCodec: string; audioFormat?: string; durationMeasurement?: 'DECODED_PCM_SAMPLES_V1'; sampleRate: number; channels: number; hasVideo: boolean;
}
function valid(source: AudioSourceCertificate) {
  return Boolean(source.assetId && source.storageId && normalizeSha256(source.checksum) && Number.isSafeInteger(source.byteSize) && source.byteSize > 0 && source.byteSize <= 64 * 1024 * 1024 && Number.isFinite(source.durationSeconds) && source.durationSeconds > 0 && source.audioCodec && Number.isInteger(source.sampleRate) && source.sampleRate > 0 && Number.isInteger(source.channels) && source.channels > 0 && source.hasVideo === false);
}
export function validReferenceVoiceSource(source: AudioSourceCertificate) {
  const contract = REVIEWED_OPERATION_CONTRACTS.referenceVoice;
  return valid(source) && source.durationMeasurement === 'DECODED_PCM_SAMPLES_V1' && source.durationSeconds <= contract.maxReferenceSeconds && source.byteSize <= contract.maxReferenceBytes && (contract.referenceCodecs as readonly string[]).includes(source.audioCodec) && (source.audioFormat === 'wav' && source.audioCodec.startsWith('pcm_') || source.audioFormat === 'mp3' && source.audioCodec === 'mp3' || source.audioFormat === 'ogg' && source.audioCodec === 'opus');
}
function verifiedDuration(probe: Record<string, unknown>) {
  return probe.durationMeasurement === 'DECODED_PCM_SAMPLES_V1' && probe.decodedSampleRate === 16000 && Number.isSafeInteger(probe.decodedSampleCount) && Number(probe.decodedSampleCount) > 0 && Number(probe.decodedSampleCount) <= 600 * 16000 && probe.durationSeconds === Number(probe.decodedSampleCount) / 16000;
}
export function transcriptFormat(source: AudioSourceCertificate): string | undefined {
  return ({wav:'wav',mp3:'mp3',flac:'flac',ogg:'ogg','matroska,webm':'webm','mov,mp4,m4a,3gp,3g2,mj2':'m4a'} as Record<string,string>)[source.audioFormat ?? ''];
}
export function validTranscriptSource(source: AudioSourceCertificate) {
  return valid(source) && source.durationMeasurement === 'DECODED_PCM_SAMPLES_V1' && source.durationSeconds <= 60 && source.byteSize <= 15*1024*1024 && Boolean(transcriptFormat(source));
}
export async function resolveTranscriptSourceCertificate(ctx: ReadCtx,args:{projectId:Id<'projects'>;assetId:Id<'assets'>}) {
  const source=await resolveAudioSourceCertificate(ctx,args);const asset=await ctx.db.get(args.assetId);
  if(!validTranscriptSource(source)||!asset||[asset.rights,asset.provenance,asset.moderation].some(value=>{const r=object(value);return r.approved===false||r.consent===false||['DENIED','REJECTED','REVOKED','EXPIRED'].includes(String(r.status??r.state??'').toUpperCase());}))throw new Error('Use current verified transcription audio of at most60 seconds.');
  return source;
}
export async function resolveAudioSourceCertificate(ctx: ReadCtx, args: { projectId: Id<'projects'>; assetId: Id<'assets'> }): Promise<AudioSourceCertificate> {
  const asset = await ctx.db.get(args.assetId);
  if (!asset || asset.projectId !== args.projectId || asset.scope !== 'PROJECT' || asset.deletedAt || !asset.storageId || !asset.mimeType?.startsWith('audio/')) throw new Error('Choose an audio recording stored in this project.');
  const storage = await ctx.db.system.get('_storage', asset.storageId);
  const probe = await ctx.db.query('verifiedAudioProbes').withIndex('by_asset', q => q.eq('assetId', asset._id)).unique();
  if (!storage || !probe || probe.projectId !== args.projectId || probe.storageId !== asset.storageId || probe.checksum !== storage.sha256 || probe.byteSize !== storage.size || !storage.contentType?.startsWith('audio/')) throw new Error('Measure the current stored recording before using its duration.');
  const source = { assetId: asset._id, storageId: asset.storageId, checksum: storage.sha256, byteSize: storage.size, durationSeconds: probe.durationSeconds, audioCodec: probe.audioCodec, ...(probe.audioFormat ? { audioFormat: probe.audioFormat } : {}), ...(probe.durationMeasurement ? { durationMeasurement: probe.durationMeasurement } : {}), sampleRate: probe.sampleRate, channels: probe.channels, hasVideo: probe.hasVideo };
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
  const cached = value.cached && typeof value.cached.audioFormat === 'string' && value.cached.durationMeasurement === 'DECODED_PCM_SAMPLES_V1' && value.cached.storageId === value.asset.storageId && value.cached.checksum === value.storage.sha256 && value.cached.byteSize === value.storage.size;
  return { assetId: value.asset._id, storageId: value.asset.storageId, checksum: value.storage.sha256, byteSize: value.storage.size, url, ...(cached ? { source: await resolveAudioSourceCertificate(ctx, { projectId: value.projectId, assetId: value.asset._id }) } : {}) };
} });
export const recordProbe = internalMutation({
  args: { ...shotArgs, assetId: v.id('assets'), storageId: v.id('_storage'), checksum: v.string(), byteSize: v.number(), probe: v.any() }, returns: v.any(),
  handler: async (ctx, args) => {
    const value = await context(ctx, args);
    if (value.asset._id !== args.assetId || value.asset.storageId !== args.storageId || value.storage.sha256 !== args.checksum || value.storage.size !== args.byteSize) throw new Error('Recording storage changed while it was measured.');
    const probe = object(args.probe);
    const source = { assetId: args.assetId, storageId: args.storageId, checksum: args.checksum, byteSize: args.byteSize, durationSeconds: Number(probe.durationSeconds), audioCodec: typeof probe.audioCodec === 'string' ? probe.audioCodec : '', ...(typeof probe.audioFormat === 'string' ? { audioFormat: probe.audioFormat } : {}), ...(probe.durationMeasurement === 'DECODED_PCM_SAMPLES_V1' ? { durationMeasurement: 'DECODED_PCM_SAMPLES_V1' as const } : {}), sampleRate: Number(probe.sampleRate), channels: Number(probe.channels), hasVideo: probe.hasVideo === true };
    if (!valid(source) || !verifiedDuration(probe) || probe.hasAudio !== true || probe.hasVideo !== false || probe.byteSize !== args.byteSize || probe.checksum !== args.checksum) throw new Error('Audio measurement is invalid.');
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
  const response = await fetch(base.replace(/\/$/, '') + '/media/probe', { method: 'POST', headers: { 'content-type': 'application/json', 'x-finalframe-worker-secret': secret }, body: JSON.stringify({ url: value.url, kind: 'audio', verifyAudioDuration: true, checksum: value.checksum, byteSize: value.byteSize }), redirect: 'error', signal: AbortSignal.timeout(70_000) });
  if (!response.ok) throw new Error('The recording could not be measured.');
  return ctx.runMutation(refs.recordProbe, { ...args, assetId: value.assetId, storageId: value.storageId, checksum: value.checksum, byteSize: value.byteSize, probe: await response.json() });
} });

const voiceArgs = { projectId: v.id('projects'), voiceId: v.id('voices'), primaryVoiceSampleAssetId: v.id('assets') };
async function voiceContext(ctx: ReadCtx, args: { projectId: Id<'projects'>; voiceId: Id<'voices'>; primaryVoiceSampleAssetId: Id<'assets'> }) {
  const access = await requireProjectRole(ctx, args.projectId, ['OWNER','EDITOR']);
  if (access.project.deletedAt || access.project.archivedAt || access.project.moderationStatus === 'RESTRICTED') throw new Error('This project cannot prepare voice recordings.');
  const voice = await resolveVoiceSynthesisInput(ctx, { ...args, use: 'SYNTHESIZE' });
  if (voice.mode !== 'REFERENCE_CLONE' || voice.references.length !== 1 || voice.references[0].assetId !== args.primaryVoiceSampleAssetId) throw new Error('Choose one approved primary recording from this cloned voice.');
  const asset = await ctx.db.get(args.primaryVoiceSampleAssetId); const storage = asset?.storageId ? await ctx.db.system.get('_storage', asset.storageId) : null;
  if (!asset?.storageId || !storage || !['audio/wav','audio/x-wav','audio/mpeg','audio/mp3','audio/pcm','audio/ogg','audio/opus'].includes(storage.contentType ?? '') || storage.size <= 0 || storage.size > REVIEWED_OPERATION_CONTRACTS.referenceVoice.maxReferenceBytes) throw new Error('Choose a supported recording of at most 10 MB.');
  return { asset, storage, url: voice.references[0].url };
}
export const voiceSampleContext = internalQuery({ args: voiceArgs, returns: v.any(), handler: async (ctx, args) => {
  const value = await voiceContext(ctx, args);
  return { assetId: value.asset._id, storageId: value.asset.storageId, checksum: value.storage.sha256, byteSize: value.storage.size, url: value.url };
} });
export const recordVoiceSampleProbe = internalMutation({ args: { ...voiceArgs, storageId: v.id('_storage'), checksum: v.string(), byteSize: v.number(), probe: v.any() }, returns: v.any(), handler: async (ctx, args) => {
  const value = await voiceContext(ctx, args);
  if (value.asset.storageId !== args.storageId || value.storage.sha256 !== args.checksum || value.storage.size !== args.byteSize) throw new Error('Primary recording changed while being measured.');
  const probe = object(args.probe);
  const source = { assetId: args.primaryVoiceSampleAssetId, storageId: args.storageId, checksum: args.checksum, byteSize: args.byteSize, durationSeconds: Number(probe.durationSeconds), audioCodec: String(probe.audioCodec ?? ''), audioFormat: String(probe.audioFormat ?? ''), ...(probe.durationMeasurement === 'DECODED_PCM_SAMPLES_V1' ? { durationMeasurement: 'DECODED_PCM_SAMPLES_V1' as const } : {}), sampleRate: Number(probe.sampleRate), channels: Number(probe.channels), hasVideo: probe.hasVideo === true };
  if (!validReferenceVoiceSource(source) || !verifiedDuration(probe) || probe.hasAudio !== true || probe.hasVideo !== false || probe.byteSize !== args.byteSize || probe.checksum !== args.checksum) throw new Error('Choose supported audio-only reference speech of at most 30 seconds.');
  const existing = await ctx.db.query('verifiedAudioProbes').withIndex('by_asset', q => q.eq('assetId', args.primaryVoiceSampleAssetId)).unique();
  const row = { projectId: args.projectId, ...source, probedAt: Date.now() };
  if (existing) await ctx.db.patch(existing._id, row); else await ctx.db.insert('verifiedAudioProbes', row);
  return source;
} });
export const prepareVoiceSample = internalAction({ args: voiceArgs, returns: v.any(), handler: async (ctx, args): Promise<AudioSourceCertificate> => {
  const refs = (internal as unknown as { audioCertificates: Record<string, FunctionReference<any, 'internal', any, any>> }).audioCertificates;
  const value = await ctx.runQuery(refs.voiceSampleContext, args);
  const base = process.env.RENDER_WORKER_URL?.trim(); const secret = process.env.RENDER_WORKER_SHARED_SECRET?.trim();
  if (!base || !secret) throw new Error('Voice recording measurement is not configured.');
  const response = await fetch(base.replace(/\/$/, '') + '/media/probe', { method: 'POST', headers: { 'content-type': 'application/json', 'x-finalframe-worker-secret': secret }, body: JSON.stringify({ url: value.url, kind: 'audio', verifyAudioDuration: true, checksum: value.checksum, byteSize: value.byteSize }), redirect: 'error', signal: AbortSignal.timeout(70_000) });
  if (!response.ok) throw new Error('The primary recording could not be measured.');
  return ctx.runMutation(refs.recordVoiceSampleProbe, { ...args, storageId: value.storageId, checksum: value.checksum, byteSize: value.byteSize, probe: await response.json() });
} });

/** Transcript preparation can precede plan approval; ownership, lifecycle and
 * explicit revoked rights still apply. Only actual decoded bytes set duration. */
export const recordTranscriptProbe = internalMutation({args:{productionId:v.id('productions'),sourceAssetId:v.id('assets'),storageId:v.id('_storage'),checksum:v.string(),byteSize:v.number(),probe:v.any()},returns:v.any(),handler:async(ctx,args)=>{
  const production=await ctx.db.get(args.productionId);if(!production?.projectId)throw new Error('Choose a project production.');
  const access=await requireProjectRole(ctx,production.projectId,['OWNER','EDITOR']);if(access.project.deletedAt||access.project.archivedAt||access.project.moderationStatus==='RESTRICTED')throw new Error('Project is unavailable.');
  const asset=await ctx.db.get(args.sourceAssetId);const stored=asset?.storageId?await ctx.db.system.get('_storage',asset.storageId):null;
  if(!asset||asset.projectId!==access.project._id||asset.scope!=='PROJECT'||asset.deletedAt||asset.storageId!==args.storageId||!stored||stored.sha256!==args.checksum||stored.size!==args.byteSize||!stored.contentType?.startsWith('audio/')||asset.mimeType!==stored.contentType)throw new Error('Transcript recording bytes changed.');
  if([asset.rights,asset.provenance,asset.moderation].some(value=>{const r=object(value);return r.approved===false||r.consent===false||['DENIED','REJECTED','REVOKED','EXPIRED'].includes(String(r.status??r.state??'').toUpperCase());}))throw new Error('Transcript recording rights changed.');
  const probe=object(args.probe);
  const source={assetId:asset._id,storageId:args.storageId,checksum:args.checksum,byteSize:args.byteSize,durationSeconds:Number(probe.durationSeconds),audioCodec:String(probe.audioCodec??''),audioFormat:String(probe.audioFormat??''),durationMeasurement:'DECODED_PCM_SAMPLES_V1' as const,sampleRate:Number(probe.sampleRate),channels:Number(probe.channels),hasVideo:probe.hasVideo===true};
  if(!verifiedDuration(probe)||!validTranscriptSource(source)||probe.hasAudio!==true||probe.hasVideo!==false||probe.checksum!==args.checksum||probe.byteSize!==args.byteSize)throw new Error('Choose verified audio of at most60 seconds in a supported transcription format.');
  const existing=await ctx.db.query('verifiedAudioProbes').withIndex('by_asset',q=>q.eq('assetId',asset._id)).unique();const row={projectId:access.project._id,...source,probedAt:Date.now()};if(existing)await ctx.db.patch(existing._id,row);else await ctx.db.insert('verifiedAudioProbes',row);return source;
}});
