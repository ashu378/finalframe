import { internalAction, internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import type { FunctionReference } from 'convex/server';
import { v } from 'convex/values';
import { requireProjectAccess, requireProjectRole, resolveProjectAccessForActor } from './authorization';
import { assertBeatAnalysisResult, BEAT_ANALYSIS_LIMITS, BEAT_ANALYSIS_VERSION } from '../renderer/src/media/beat-detector';
import { normalizeSha256, sha256Equal } from '../renderer/src/media/sha256';

type ReadCtx = MutationCtx | QueryCtx;
type Job = Doc<'beatAnalysisJobs'>;
const LEASE_MS = 180_000;
const MAX_QUEUE_MS = 2 * 60 * 60 * 1000;
const refs = (internal as unknown as { beatAnalysis: Record<string, FunctionReference<any, 'internal', any, any>> }).beatAnalysis;
const enabled = () => process.env.FINALFRAME_BEAT_ANALYSIS_ENABLED === 'true';
const workerEnabled = () => process.env.FINALFRAME_BEAT_WORKER_ENABLED === 'true';
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

function key(value: string) { const result = value.trim(); if (result.length < 8 || result.length > 200) throw new Error('Use a bounded beat-analysis request key.'); return result; }
async function hash(value: unknown) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))).map(byte => byte.toString(16).padStart(2, '0')).join(''); }
function deniedRights(value: unknown) { const rights = object(value); return rights.approved === false || rights.consent === false || ['DENIED', 'REJECTED', 'REVOKED', 'EXPIRED'].includes(String(rights.status ?? rights.state ?? '').toUpperCase()); }
function inactive(value: unknown) { return ['DISABLED', 'SUSPENDED', 'REMOVED', 'ARCHIVED', 'DELETED'].includes(String(value).toUpperCase()); }

/** Scheduler execution rechecks the saved actor rather than assuming the
 * browser session or its project/studio membership remains authorized. */
export async function activeActor(ctx: ReadCtx, projectId: Id<'projects'>, userId: Id<'users'>) {
  const {project}=await resolveProjectAccessForActor(ctx,projectId,userId,['OWNER','EDITOR']);
  if(project.deletedAt||project.archivedAt||inactive(project.status)||project.moderationStatus==='RESTRICTED')throw new Error('Beat-analysis project access changed.');
  return project;
}

export async function approvedBeatSource(ctx: ReadCtx, projectId: Id<'projects'>, assetId: Id<'assets'>) {
  const project = await ctx.db.get(projectId); const asset = await ctx.db.get(assetId);
  if (!project || project.deletedAt || project.archivedAt || inactive(project.status) || project.moderationStatus === 'RESTRICTED' || !asset || asset.projectId !== projectId || asset.studioExternalId !== project.studioExternalId || asset.scope !== 'PROJECT' || asset.deletedAt || !asset.mimeType?.startsWith('audio/') || !asset.storageId || !asset.checksum || deniedRights(asset.rights) || deniedRights(asset.provenance) || deniedRights(asset.moderation)) throw new Error('Choose active, approved audio from this project.');
  const approval = await ctx.db.query('resourceStates').withIndex('by_project_resource', q => q.eq('projectId', projectId).eq('resourceType', 'asset').eq('resourceId', assetId)).unique();
  if (!approval || !['APPROVED', 'LOCKED'].includes(approval.state)) throw new Error('Approve this project audio before beat analysis.');
  const storage = await ctx.db.system.get('_storage', asset.storageId);
  const sourceChecksum = normalizeSha256(storage?.sha256);
  if (!storage || !storage.contentType?.startsWith('audio/') || storage.size <= 0 || storage.size > BEAT_ANALYSIS_LIMITS.maxSourceBytes || !sourceChecksum || !sha256Equal(asset.checksum, storage.sha256)) throw new Error('Choose canonical audio of at most 64 MiB.');
  return { project, asset, storage, projectId, assetId, storageId: asset.storageId, sourceChecksum, assetChecksum: asset.checksum, byteSize: storage.size };
}

function sameSource(source: Awaited<ReturnType<typeof approvedBeatSource>>, row: Pick<Job, 'projectId' | 'assetId' | 'storageId' | 'sourceChecksum' | 'assetChecksum'>) { return source.projectId === row.projectId && source.assetId === row.assetId && source.storageId === row.storageId && source.sourceChecksum === row.sourceChecksum && source.assetChecksum === row.assetChecksum; }
function sourceFields(source: Awaited<ReturnType<typeof approvedBeatSource>>) { return { projectId: source.projectId, assetId: source.assetId, storageId: source.storageId, sourceChecksum: source.sourceChecksum, assetChecksum: source.assetChecksum, algorithmVersion: BEAT_ANALYSIS_VERSION }; }
async function currentAuto(ctx: ReadCtx, source: Awaited<ReturnType<typeof approvedBeatSource>>) {
  return (await ctx.db.query('beatAnalysisVersions').withIndex('by_source', q => q.eq('projectId', source.projectId).eq('assetId', source.assetId).eq('sourceChecksum', source.sourceChecksum).eq('algorithmVersion', BEAT_ANALYSIS_VERSION)).order('desc').take(100)).find(row => row.origin === 'AUTO' && row.storageId === source.storageId && row.assetChecksum === source.assetChecksum) ?? null;
}
async function schedule(ctx: MutationCtx, jobId: Id<'beatAnalysisJobs'>, delay = 0) { if (workerEnabled()) await ctx.scheduler.runAfter(delay, refs.run, { jobId }); }

const beatRequestArgs={ projectId: v.id('projects'), assetId: v.id('assets'), idempotencyKey: v.string() };
export const request=mutation({args:beatRequestArgs,returns:v.object({jobId:v.id('beatAnalysisJobs'),analysisVersionId:v.optional(v.id('beatAnalysisVersions')),replayed:v.boolean()}),handler:(ctx,args)=>requestCanonicalBeatAnalysis(ctx,args)});
export async function requestCanonicalBeatAnalysis(ctx:MutationCtx,args:{projectId:Id<'projects'>;assetId:Id<'assets'>;idempotencyKey:string},actorId?:Id<'users'>) {
    if (!enabled()) throw new Error('Automatic beat analysis is not enabled yet.');
    const access = actorId ? await resolveProjectAccessForActor(ctx,args.projectId,actorId,['OWNER','EDITOR']) : await requireProjectRole(ctx, args.projectId, ['OWNER', 'EDITOR']);
    const source = await approvedBeatSource(ctx, args.projectId, args.assetId); const idempotencyKey = key(args.idempotencyKey);
    const requestHash = await hash(sourceFields(source));
    const existing = await ctx.db.query('beatAnalysisJobs').withIndex('by_idempotency', q => q.eq('idempotencyKey', idempotencyKey)).unique();
    if (existing) {
      if (existing.projectId !== args.projectId || existing.createdByUserId !== access.user._id || existing.requestHash !== requestHash || !sameSource(source, existing)) throw new Error('This beat request key belongs to another source or user.');
      return { jobId: existing._id, ...(existing.analysisVersionId ? { analysisVersionId: existing.analysisVersionId } : {}), replayed: true };
    }
    const cached = await currentAuto(ctx, source); const timestamp = Date.now();
    const jobId = await ctx.db.insert('beatAnalysisJobs', { ...sourceFields(source), requestHash, idempotencyKey, createdByUserId: access.user._id, status: cached ? 'COMPLETED' : 'QUEUED', attemptCount: 0, createdAt: timestamp, updatedAt: timestamp, ...(cached ? { analysisVersionId: cached._id, completedAt: timestamp } : {}) });
    if (!cached) await schedule(ctx, jobId);
    return { jobId, ...(cached ? { analysisVersionId: cached._id } : {}), replayed: false };
}

export const list = query({
  args: { projectId: v.id('projects'), assetId: v.id('assets') }, returns: v.any(),
  handler: async (ctx, args) => {
    const access = await requireProjectAccess(ctx, args.projectId); const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.projectId !== args.projectId) throw new Error('Audio is not in this project.');
    const [jobs, versions] = await Promise.all([
      ctx.db.query('beatAnalysisJobs').withIndex('by_asset', q => q.eq('assetId', args.assetId)).order('desc').take(30),
      ctx.db.query('beatAnalysisVersions').withIndex('by_asset', q => q.eq('assetId', args.assetId)).order('desc').take(50),
    ]);
    return { enabled: enabled(), workerEnabled: workerEnabled(), canEdit: ['OWNER', 'EDITOR'].includes(access.projectRole), jobs: jobs.filter(job => job.projectId === args.projectId).map(job => ({ id: job._id, status: job.status, attemptCount: job.attemptCount, analysisVersionId: job.analysisVersionId ?? null, errorCode: job.errorCode ?? null, createdAt: job.createdAt })), versions: versions.filter(version => version.projectId === args.projectId) };
  },
});

export const manual = mutation({
  args: { parentVersionId: v.id('beatAnalysisVersions'), beatsSeconds: v.array(v.number()), correctionNote: v.string(), idempotencyKey: v.string() }, returns: v.object({ analysisVersionId: v.id('beatAnalysisVersions'), replayed: v.boolean() }),
  handler: async (ctx, args) => {
    if (!enabled()) throw new Error('Beat-map editing is not enabled yet.');
    const parent = await ctx.db.get(args.parentVersionId); if (!parent) throw new Error('Choose an existing analysis version.');
    const access = await requireProjectRole(ctx, parent.projectId, ['OWNER', 'EDITOR']); const source = await approvedBeatSource(ctx, parent.projectId, parent.assetId);
    if (!sameSource(source, parent) || parent.algorithmVersion !== BEAT_ANALYSIS_VERSION) throw new Error('This analysis refers to older audio bytes. Analyze the current source first.');
    if (args.beatsSeconds.length < 2 || args.beatsSeconds.length > BEAT_ANALYSIS_LIMITS.maxBeats || args.beatsSeconds.some((beat,index) => !Number.isFinite(beat) || beat < 0 || beat >= parent.durationSeconds || index > 0 && beat <= args.beatsSeconds[index - 1])) throw new Error('Manual beats must be strictly increasing inside the measured source.');
    const note = args.correctionNote.trim(); if (!note || note.length > 1000) throw new Error('Describe the reviewed beat-map correction in at most 1000 characters.');
    const creationKey = key(args.idempotencyKey); const requestHash = await hash({ parentVersionId: parent._id, beatsSeconds: args.beatsSeconds, correctionNote: note });
    const prior = await ctx.db.query('beatAnalysisVersions').withIndex('by_creation_key', q => q.eq('creationKey', creationKey)).unique();
    if (prior) { if (prior.projectId !== parent.projectId || prior.createdByUserId !== access.user._id || prior.parentVersionId !== parent._id || prior.requestHash !== requestHash || !sameSource(source, prior)) throw new Error('This manual correction key belongs to another version or user.'); return { analysisVersionId: prior._id, replayed: true }; }
    const analysisVersionId = await ctx.db.insert('beatAnalysisVersions', { ...sourceFields(source), ...(parent.sourceJobId ? { sourceJobId: parent.sourceJobId } : {}), parentVersionId: parent._id, origin: 'MANUAL', outcome: 'MANUAL', durationSeconds: parent.durationSeconds, sampleRate: parent.sampleRate, confidence: parent.confidence, beatsSeconds: args.beatsSeconds, ...(parent.tempoSegments ? { tempoSegments: parent.tempoSegments } : {}), reasonCode: 'MANUAL_REVIEW', correctionNote: note, creationKey, requestHash, createdByUserId: access.user._id, createdAt: Date.now() });
    return { analysisVersionId, replayed: false };
  },
});

export const claim = internalMutation({
  args: { jobId: v.id('beatAnalysisJobs') }, returns: v.any(),
  handler: async (ctx, args) => {
    if (!enabled() || !workerEnabled()) return null;
    const job = await ctx.db.get(args.jobId); const timestamp = Date.now();
    if (!job || !['QUEUED', 'RETRYING'].includes(job.status) || (job.nextAttemptAt ?? 0) > timestamp) return null;
    if (job.algorithmVersion !== BEAT_ANALYSIS_VERSION) { await ctx.db.patch(job._id,{status:'FAILED',errorCode:'BEAT_ALGORITHM_CHANGED',updatedAt:timestamp}); return null; }
    if (timestamp - job.createdAt > MAX_QUEUE_MS || job.attemptCount >= 3) { await ctx.db.patch(job._id, { status: 'FAILED', errorCode: 'BEAT_RETRY_EXHAUSTED', updatedAt: timestamp }); return null; }
    let source;
    try { await activeActor(ctx, job.projectId, job.createdByUserId); source = await approvedBeatSource(ctx, job.projectId, job.assetId); if (!sameSource(source, job)) throw new Error('Changed source'); }
    catch { await ctx.db.patch(job._id, { status: 'FAILED', errorCode: 'BEAT_SOURCE_UNAVAILABLE', updatedAt: timestamp }); return null; }
    const cached = await currentAuto(ctx, source);
    if (cached) { await ctx.db.patch(job._id, { status: 'COMPLETED', analysisVersionId: cached._id, completedAt: timestamp, updatedAt: timestamp }); return null; }
    const active = await ctx.db.query('beatAnalysisJobs').withIndex('by_status', q => q.eq('status','PROCESSING')).take(101);
    if (active.length > 100) throw new Error('Beat worker recovery needs an administrator check.');
    for (const other of active) {
      if ((other.leaseExpiresAt ?? 0) <= timestamp) { await ctx.scheduler.runAfter(0, refs.expire, { jobId: other._id, leaseId: other.leaseId ?? '' }); }
      else { await schedule(ctx, job._id, 30_000); return null; }
    }
    const url = await ctx.storage.getUrl(source.storageId); if (!url) { await ctx.db.patch(job._id,{status:'FAILED',errorCode:'BEAT_SOURCE_UNAVAILABLE',updatedAt:timestamp});return null; }
    const leaseId = `${job._id}:${timestamp}:${Math.random().toString(36).slice(2)}`;
    await ctx.db.patch(job._id,{status:'PROCESSING',leaseId,leaseExpiresAt:timestamp+LEASE_MS,attemptCount:job.attemptCount+1,nextAttemptAt:undefined,errorCode:undefined,updatedAt:timestamp});
    await ctx.scheduler.runAfter(LEASE_MS+1000,refs.expire,{jobId:job._id,leaseId});
    return {...sourceFields(source),jobId:job._id,leaseId,byteSize:source.byteSize,url};
  },
});

export const fail = internalMutation({
  args: { jobId:v.id('beatAnalysisJobs'),leaseId:v.string(),retryable:v.boolean(),busy:v.optional(v.boolean()),errorCode:v.string() }, returns:v.null(),
  handler:async(ctx,args)=>{
    const job=await ctx.db.get(args.jobId);if(!job||job.status!=='PROCESSING'||job.leaseId!==args.leaseId)return null;
    const retry=args.retryable&&Date.now()-job.createdAt<MAX_QUEUE_MS&&(args.busy||job.attemptCount<3);
    await ctx.db.patch(job._id,{status:retry?'RETRYING':'FAILED',leaseId:undefined,leaseExpiresAt:undefined,attemptCount:args.busy?Math.max(0,job.attemptCount-1):job.attemptCount,errorCode:args.errorCode,nextAttemptAt:retry?Date.now()+30_000:undefined,updatedAt:Date.now()});
    if(retry)await schedule(ctx,job._id,30_000);return null;
  },
});

export const expire=internalMutation({args:{jobId:v.id('beatAnalysisJobs'),leaseId:v.string()},returns:v.null(),handler:async(ctx,args)=>{
  const job=await ctx.db.get(args.jobId);if(!job||job.status!=='PROCESSING'||job.leaseId!==args.leaseId||(job.leaseExpiresAt??0)>Date.now())return null;
  const retry=job.attemptCount<3&&Date.now()-job.createdAt<MAX_QUEUE_MS;
  await ctx.db.patch(job._id,{status:retry?'RETRYING':'FAILED',leaseId:undefined,leaseExpiresAt:undefined,errorCode:'BEAT_LEASE_EXPIRED',nextAttemptAt:retry?Date.now()+30_000:undefined,updatedAt:Date.now()});if(retry)await schedule(ctx,job._id,30_000);return null;
}});

export const complete=internalMutation({args:{jobId:v.id('beatAnalysisJobs'),leaseId:v.string(),result:v.any()},returns:v.null(),handler:async(ctx,args)=>{
  const job=await ctx.db.get(args.jobId);if(!job||job.status!=='PROCESSING'||job.leaseId!==args.leaseId||(job.leaseExpiresAt??0)<=Date.now())return null;
  let source;let result;
  try{await activeActor(ctx,job.projectId,job.createdByUserId);source=await approvedBeatSource(ctx,job.projectId,job.assetId);if(!sameSource(source,job))throw new Error('Changed source');result=assertBeatAnalysisResult(args.result);}
  catch{await ctx.db.patch(job._id,{status:'FAILED',leaseId:undefined,leaseExpiresAt:undefined,errorCode:'BEAT_SOURCE_OR_RESULT_CHANGED',updatedAt:Date.now()});return null;}
  const cached=await currentAuto(ctx,source);
  const analysisVersionId=cached?cached._id:await ctx.db.insert('beatAnalysisVersions',{...sourceFields(source),sourceJobId:job._id,origin:'AUTO',outcome:result.outcome,durationSeconds:result.durationSeconds,sampleRate:result.sampleRate,beatsSeconds:result.beatsSeconds,confidence:result.confidence,...(result.tempoBpm!==undefined?{tempoBpm:result.tempoBpm}:{}),...(result.tempoSegments?{tempoSegments:result.tempoSegments}:{}),reasonCode:result.reasonCode,createdByUserId:job.createdByUserId,createdAt:Date.now()});
  await ctx.db.patch(job._id,{status:'COMPLETED',analysisVersionId,leaseId:undefined,leaseExpiresAt:undefined,completedAt:Date.now(),updatedAt:Date.now()});return null;
}});

export const retry=mutation({args:{jobId:v.id('beatAnalysisJobs')},returns:v.null(),handler:async(ctx,args)=>{
  if(!enabled())throw new Error('Beat analysis is not enabled.');const job=await ctx.db.get(args.jobId);if(!job)throw new Error('Beat job unavailable.');const access=await requireProjectRole(ctx,job.projectId,['OWNER','EDITOR']);const source=await approvedBeatSource(ctx,job.projectId,job.assetId);
  if(!sameSource(source,job)||job.status!=='FAILED')throw new Error('Retry only failed analysis of the same current audio.');
  if(Date.now()-job.createdAt>=MAX_QUEUE_MS)throw new Error('Start a new analysis request after the bounded retry window. The earlier job is retained.');
  await ctx.db.patch(job._id,{status:'QUEUED',attemptCount:0,createdByUserId:access.user._id,nextAttemptAt:undefined,errorCode:undefined,updatedAt:Date.now()});await schedule(ctx,job._id);return null;
}});

export const cancel=mutation({args:{jobId:v.id('beatAnalysisJobs')},returns:v.null(),handler:async(ctx,args)=>{
  const job=await ctx.db.get(args.jobId);if(!job)throw new Error('Beat job unavailable.');await requireProjectRole(ctx,job.projectId,['OWNER','EDITOR']);
  if(['QUEUED','PROCESSING','RETRYING'].includes(job.status))await ctx.db.patch(job._id,{status:'CANCELED',leaseId:undefined,leaseExpiresAt:undefined,nextAttemptAt:undefined,updatedAt:Date.now()});return null;
}});

export const wakePending=internalMutation({args:{},returns:v.number(),handler:async(ctx)=>{
  if(!enabled()||!workerEnabled())return 0;let scheduled=0;
  for(const status of ['QUEUED','RETRYING'] as const){const jobs=await ctx.db.query('beatAnalysisJobs').withIndex('by_status',q=>q.eq('status',status)).take(25);for(const job of jobs){await schedule(ctx,job._id,Math.max(0,(job.nextAttemptAt??0)-Date.now()));scheduled++;}}
  return scheduled;
}});

async function boundedJson(response:Response){
  const reader=response.body?.getReader();if(!reader)throw new Error('Missing beat receipt');const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>256*1024)throw new Error('Beat receipt too large');chunks.push(next.value);}}finally{await reader.cancel().catch(()=>undefined);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));
}

export const run=internalAction({args:{jobId:v.id('beatAnalysisJobs')},returns:v.null(),handler:async(ctx,args)=>{
  if(!enabled()||!workerEnabled())return null;const prepared=await ctx.runMutation(refs.claim,args);if(!prepared)return null;
  const base=process.env.RENDER_WORKER_URL?.trim();const secret=process.env.RENDER_WORKER_SHARED_SECRET?.trim();const lease={jobId:args.jobId,leaseId:prepared.leaseId};
  if(!base||!secret){await ctx.runMutation(refs.fail,{...lease,retryable:false,errorCode:'BEAT_CONFIGURATION_REQUIRED'});return null;}
  try{
    const response=await fetch(base.replace(/\/$/,'')+'/media/analyze-beats',{method:'POST',headers:{'content-type':'application/json','x-finalframe-worker-secret':secret},body:JSON.stringify(prepared),redirect:'error',signal:AbortSignal.timeout(130_000)});
    if(!response.ok){await response.body?.cancel();await ctx.runMutation(refs.fail,{...lease,retryable:[408,429,500,502,503,504].includes(response.status),busy:[429,503].includes(response.status),errorCode:response.status===429?'BEAT_WAITING_FOR_MEDIA':'BEAT_WORKER_UNAVAILABLE'});return null;}
    const receipt=object(await boundedJson(response));
    for(const field of ['jobId','leaseId','projectId','assetId','storageId','sourceChecksum','assetChecksum','algorithmVersion','byteSize'])if(receipt[field]!==prepared[field])throw new Error('Beat receipt scope mismatch');
    await ctx.runMutation(refs.complete,{...lease,result:assertBeatAnalysisResult(receipt.result)});
  }catch{await ctx.runMutation(refs.fail,{...lease,retryable:true,errorCode:'BEAT_TRANSFER_UNCERTAIN'});}
  return null;
}});

/** Canonical approval validates the exact observed/corrected grid and current
 * source. A recipe never substitutes a node-local approval boolean. */
export async function validateBeatVersionForApproval(ctx:ReadCtx,projectId:Id<'projects'>,id:Id<'beatAnalysisVersions'>){
 const row=await ctx.db.get(id);if(!row||row.projectId!==projectId)throw new Error('Beat map belongs to another project.');
 const source=await approvedBeatSource(ctx,projectId,row.assetId);if(!sameSource(source,row)||row.algorithmVersion!==BEAT_ANALYSIS_VERSION||!Number.isFinite(row.durationSeconds)||row.durationSeconds<=0||row.durationSeconds>BEAT_ANALYSIS_LIMITS.maxDurationSeconds||row.sampleRate!==BEAT_ANALYSIS_LIMITS.sampleRate||!Number.isFinite(row.confidence)||row.confidence<0||row.confidence>1||row.beatsSeconds.length>BEAT_ANALYSIS_LIMITS.maxBeats||!row.beatsSeconds.length)throw new Error('Beat map has no current bounded source/grid.');
 let previous=-1;for(const beat of row.beatsSeconds){if(!Number.isFinite(beat)||beat<0||beat<=previous||beat>row.durationSeconds)throw new Error('Beat map is not a bounded monotonic grid.');previous=beat;}
 if(row.origin==='AUTO'){assertBeatAnalysisResult(row);if(row.outcome!=='RELIABLE')throw new Error('Review a manual correction before approving an ambiguous beat map.');}else if(row.outcome!=='MANUAL'||!row.parentVersionId||!row.correctionNote?.trim())throw new Error('Manual beat map needs its exact reviewed parent and note.');
 return row;
}
