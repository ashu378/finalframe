import { mutation } from './_generated/server';
import { v } from 'convex/values';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { requireProjectRole, resolveProjectAccessForActor } from './authorization';
import { normalizeSha256, sha256Equal } from '../renderer/src/media/sha256';
import { parseStoryboardBinding, stableStoryboardValue, storyboardObject as object } from '../src/lib/production/storyboard-contract';

type ReadCtx = QueryCtx | MutationCtx;
type Endpoint = { type: 'asset' | 'storyboardFrame' | 'shot' | 'shotVersion' | 'timelineClip' | 'timeline'; id: string };
type Kind = 'references' | 'derivedFrom' | 'feeds' | 'placedOn';
const DRAFT_REBIND_REASON='A newer explicit draft binding exists; retained approved artifacts are unchanged.';
async function hash(value: unknown) {
  const bytes = new TextEncoder().encode(stableStoryboardValue(value));
  if (bytes.length > 128 * 1024) throw new Error('DEPENDENCY_CONTENT_LIMIT');
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(v => v.toString(16).padStart(2, '0')).join('');
}
async function scope(ctx: ReadCtx, productionId: Id<'productions'>, versionId: Id<'productionVersions'>, actorId?:Id<'users'>) {
  const production = await ctx.db.get(productionId), version = await ctx.db.get(versionId);
  if (!production?.projectId || !version || version.productionId !== production._id) throw new Error('DEPENDENCY_VERSION_UNAVAILABLE');
  if(actorId)await resolveProjectAccessForActor(ctx,production.projectId,actorId,['OWNER','EDITOR']);else await requireProjectRole(ctx, production.projectId, ['OWNER', 'EDITOR']);
  return { production, version, projectId: production.projectId };
}
function timelineVersion(row: Doc<'timelines'>) {
  const tracks = object(row.tracks), metadata = object(tracks.metadata);
  const ids = [tracks.productionVersionId, metadata.productionVersionId].filter(v => typeof v === 'string');
  if (!ids.length || new Set(ids).size !== 1) throw new Error('DEPENDENCY_VERSION_UNAVAILABLE');
  return ids[0];
}
async function endpoint(ctx: ReadCtx, owner: Awaited<ReturnType<typeof scope>>, ref: Endpoint) {
  const table = ({ asset: 'assets', storyboardFrame: 'storyboardFrames', shot: 'shots', shotVersion: 'shotVersions', timelineClip: 'timelineClips', timeline: 'timelines' } as const)[ref.type];
  const id = ctx.db.normalizeId(table, ref.id); const row = id ? await ctx.db.get(id) : null;
  if (!row) throw new Error('DEPENDENCY_RESOURCE_UNAVAILABLE');
  const data = row as unknown as Record<string, unknown>;
  let content: unknown;
  if (ref.type === 'asset') {
    const asset = row as Doc<'assets'>, stored = asset.storageId ? await ctx.db.system.get('_storage', asset.storageId) : null;
    if (asset.projectId !== owner.projectId || asset.scope !== 'PROJECT' || asset.deletedAt || !stored || !normalizeSha256(stored.sha256) || !sha256Equal(asset.checksum, stored.sha256)) throw new Error('DEPENDENCY_RESOURCE_UNAVAILABLE');
    content = { storageId: asset.storageId, checksum: normalizeSha256(stored.sha256), mimeType: asset.mimeType, byteSize: stored.size };
  } else if (ref.type === 'timelineClip') {
    const clip = row as Doc<'timelineClips'>, timeline = await ctx.db.get(clip.timelineId);
    if (!timeline || timeline.productionId !== owner.production._id || timeline.projectId !== owner.projectId || timelineVersion(timeline) !== owner.version._id || clip.studioExternalId !== owner.production.studioExternalId) throw new Error('DEPENDENCY_RESOURCE_UNAVAILABLE');
    content = { timelineId: clip.timelineId, trackId: clip.trackId, assetId: clip.assetId, shotVersionId: clip.shotVersionId, startSeconds: clip.startSeconds, durationSeconds: clip.durationSeconds, trimStartSeconds: clip.trimStartSeconds, trimEndSeconds: clip.trimEndSeconds, volume: clip.volume, transition: clip.transition, metadata: clip.metadata };
  } else {
    if (data.projectId !== owner.projectId || data.productionId !== owner.production._id) throw new Error('DEPENDENCY_RESOURCE_UNAVAILABLE');
    if (ref.type === 'timeline') {
      if (timelineVersion(row as Doc<'timelines'>) !== owner.version._id) throw new Error('DEPENDENCY_VERSION_UNAVAILABLE');
      content = { versionNumber: data.versionNumber, tracks: data.tracks, durationSeconds: data.durationSeconds, outputPreset: data.outputPreset };
    } else {
      if (data.productionVersionId !== owner.version._id) throw new Error('DEPENDENCY_VERSION_UNAVAILABLE');
      if (ref.type === 'storyboardFrame') {
        const assetId=ctx.db.normalizeId('assets',String(data.assetId));const asset=assetId?await ctx.db.get(assetId):null;const stored=asset?.storageId?await ctx.db.system.get('_storage',asset.storageId):null;const proof=object(object(data.direction).mediaProof);
        if(!asset||asset.projectId!==owner.projectId||asset.scope!=='PROJECT'||asset.deletedAt||!stored||asset.storageId!==proof.storageId||proof.assetId!==asset._id||proof.byteSize!==stored.size||proof.mimeType!==asset.mimeType||!sha256Equal(proof.checksum,stored.sha256)||!sha256Equal(asset.checksum,stored.sha256))throw new Error('DEPENDENCY_FRAME_CHANGED');
      }
      if (ref.type === 'shot' && ['ARCHIVED','DELETED'].includes(String(data.status))) throw new Error('DEPENDENCY_RESOURCE_UNAVAILABLE');
      if (ref.type === 'storyboardFrame') content = { shotId: data.shotId, assetId: data.assetId, sourceFrameId: data.sourceFrameId, generationJobId: data.generationJobId, direction: data.direction, prompt: data.prompt };
      else if (ref.type === 'shot') content = { sceneId: data.sceneId, prompt: data.prompt, camera: data.camera, durationSeconds: data.durationSeconds, orderIndex: data.orderIndex, requiredAssetIds: data.requiredAssetIds, metadata: data.metadata };
      else content = { shotId: data.shotId, versionNumber: data.versionNumber, assetId: data.assetId, promptSnapshot: data.promptSnapshot, contextSnapshot: data.contextSnapshot };
    }
  }
  return { row: data, hash: await hash(content) };
}
/** Frozen before submitting a new take. This proof belongs to the authored
 * shot input, not to whichever directing settings happen to be current later. */
export async function resolveShotDependencyProof(ctx: ReadCtx,args:{shotId:Id<'shots'>;expectedVersionId:Id<'productionVersions'>},actorId?:Id<'users'>){
  const shot=await ctx.db.get(args.shotId);
  if(!shot?.productionId||shot.productionVersionId!==args.expectedVersionId)throw new Error('DEPENDENCY_VERSION_UNAVAILABLE');
  const owner=await scope(ctx,shot.productionId,args.expectedVersionId,actorId),source=await endpoint(ctx,owner,{type:'shot',id:shot._id});
  return {version:1 as const,shotId:shot._id,productionVersionId:owner.version._id,sourceHash:source.hash};
}
function takeMatchesShot(shot: Record<string, unknown>, take: Record<string, unknown>,sourceHash:string) {
  const context=object(take.contextSnapshot),proof=object(context.sourceShotDependency);
  const selected=parseStoryboardBinding(object(shot.metadata).storyboard),consumed=object(context.storyboardSelection).frameId;
  return proof.version===1&&proof.shotId===shot._id&&proof.productionVersionId===shot.productionVersionId&&proof.sourceHash===sourceHash&&take.promptSnapshot===shot.prompt && (selected ? consumed===selected.frameId : consumed===undefined);
}
function actualRelation(source: Endpoint, s: Record<string, unknown>, target: Endpoint, t: Record<string, unknown>,sourceHash:string) {
  if (source.type === 'asset' && ['storyboardFrame', 'shotVersion', 'timelineClip'].includes(target.type)) return t.assetId === source.id;
  if (source.type === 'storyboardFrame' && target.type === 'shot') return s.shotId === target.id && parseStoryboardBinding(object(t.metadata).storyboard)?.frameId === source.id;
  if (source.type === 'storyboardFrame' && target.type === 'shotVersion') return object(object(t.contextSnapshot).storyboardSelection).frameId === source.id && s.shotId === t.shotId;
  if (source.type === 'shot' && target.type === 'shotVersion') return t.shotId === source.id && takeMatchesShot(s,t,sourceHash);
  if (source.type === 'shotVersion' && target.type === 'timelineClip') return t.shotVersionId === source.id && s.assetId === t.assetId;
  if (source.type === 'timelineClip' && target.type === 'timeline') return s.timelineId === target.id;
  return false;
}
/** Server-only lineage writer. Both endpoints and their exact current content
 * are resolved here; callers cannot submit foreign IDs, hashes or state claims. */
export async function recordProductionDependency(ctx: MutationCtx, args: { productionId: Id<'productions'>; productionVersionId: Id<'productionVersions'>; source: Endpoint; target: Endpoint; kind: Kind }, actorId?:Id<'users'>) {
  const owner = await scope(ctx, args.productionId, args.productionVersionId,actorId);
  const source = await endpoint(ctx, owner, args.source), target = await endpoint(ctx, owner, args.target);
  if (!actualRelation(args.source, source.row, args.target, target.row,source.hash)) throw new Error('DEPENDENCY_RELATION_INVALID');
  const prior = await ctx.db.query('productionDependencies').withIndex('by_source', q => q.eq('sourceType', args.source.type).eq('sourceId', args.source.id)).take(201);
  if (prior.length > 200) throw new Error('DEPENDENCY_HISTORY_LIMIT');
  const same = prior.filter(row => row.productionId === owner.production._id && row.productionVersionId === owner.version._id && row.targetType === args.target.type && row.targetId === args.target.id && row.kind === args.kind);
  const exact = same.find(row => row.state === 'ACTIVE' && row.projectId === owner.projectId && row.sourceHash === source.hash && row.targetHash === target.hash);
  if (exact) return exact._id;
  const now = Date.now();
  for (const row of same) if (row.state === 'ACTIVE') await ctx.db.patch(row._id, { state: 'OUTDATED', reason: DRAFT_REBIND_REASON, updatedAt: now });
  return ctx.db.insert('productionDependencies', { projectId: owner.projectId, studioExternalId: owner.production.studioExternalId, studioId: owner.production.studioId, productionId: owner.production._id, productionVersionId: owner.version._id, sourceType: args.source.type, sourceId: args.source.id, sourceVersionId: args.source.id, sourceHash: source.hash, targetType: args.target.type, targetId: args.target.id, targetVersionId: args.target.id, targetHash: target.hash, kind: args.kind, state: 'ACTIVE', createdAt: now, updatedAt: now });
}
export async function synchronizeShotDependencies(ctx: MutationCtx, args: { shotId: Id<'shots'>; expectedVersionId: Id<'productionVersions'> }, actorId?:Id<'users'>) {
    const shot = await ctx.db.get(args.shotId);
    if (!shot?.productionId || shot.productionVersionId !== args.expectedVersionId) throw new Error('DEPENDENCY_VERSION_UNAVAILABLE');
    const owner = await scope(ctx, shot.productionId, args.expectedVersionId,actorId); const write = (source: Endpoint, target: Endpoint, kind: Kind) => recordProductionDependency(ctx, { productionId: owner.production._id, productionVersionId: owner.version._id, source, target, kind },actorId); let edges = 0;
    const previous = await ctx.db.query('productionDependencies').withIndex('by_target',q=>q.eq('targetType','shot').eq('targetId',shot._id)).take(201);
    if(previous.length>200)throw new Error('DEPENDENCY_HISTORY_LIMIT');
    const selectedBinding=parseStoryboardBinding(object(shot.metadata).storyboard);
    const archived=['ARCHIVED','DELETED'].includes(shot.status);
    for(const prior of previous)if(prior.productionId===owner.production._id&&prior.productionVersionId===owner.version._id&&prior.projectId===owner.projectId&&prior.state==='ACTIVE'&&prior.sourceType==='storyboardFrame'&&(archived||prior.sourceId!==selectedBinding?.frameId))await ctx.db.patch(prior._id,{state:'OUTDATED',reason:archived?'DRAFT_SHOT_ARCHIVED':'STORYBOARD_SELECTION_REPLACED',updatedAt:Date.now()});
    const outgoing=await ctx.db.query('productionDependencies').withIndex('by_source',q=>q.eq('sourceType','shot').eq('sourceId',shot._id)).take(201);
    if(outgoing.length>200)throw new Error('DEPENDENCY_HISTORY_LIMIT');
    for(const prior of outgoing)if(archived&&prior.productionId===owner.production._id&&prior.productionVersionId===owner.version._id&&prior.projectId===owner.projectId&&prior.state==='ACTIVE')await ctx.db.patch(prior._id,{state:'OUTDATED',reason:'DRAFT_SHOT_ARCHIVED',updatedAt:Date.now()});
    if(archived)return {edges:0};
    const currentShotHash=(await endpoint(ctx,owner,{type:'shot',id:shot._id})).hash;
    const frames = await ctx.db.query('storyboardFrames').withIndex('by_shot', q => q.eq('shotId', shot._id)).take(25);
    if (frames.length > 24) throw new Error('DEPENDENCY_GRAPH_LIMIT');
    const takes = await ctx.db.query('shotVersions').withIndex('by_shot_version', q => q.eq('shotId', shot._id)).order('desc').take(25);
    const requiredFrames=new Set<string>(selectedBinding?[selectedBinding.frameId]:[]);
    for(const take of takes.slice(0,24)){const consumed=object(object(take.contextSnapshot).storyboardSelection).frameId;if(typeof consumed==='string')requiredFrames.add(consumed);}
    for (const frame of frames) {
      try{await write({ type: 'asset', id: frame.assetId }, { type: 'storyboardFrame', id: frame._id }, 'derivedFrom');edges++;}
      catch(error){
        const unavailable=error instanceof Error&&['DEPENDENCY_RESOURCE_UNAVAILABLE','DEPENDENCY_FRAME_CHANGED','DEPENDENCY_VERSION_UNAVAILABLE'].includes(error.message);
        if(requiredFrames.has(frame._id)||!unavailable)throw error;
        // A retained, unused alternative is not a new production input. Keep
        // its history visible as stale without blocking another draft edit.
        const previous=await ctx.db.query('productionDependencies').withIndex('by_target',q=>q.eq('targetType','storyboardFrame').eq('targetId',frame._id)).take(201);
        if(previous.length>200)throw new Error('DEPENDENCY_HISTORY_LIMIT');
        for(const receipt of previous)if(receipt.projectId===owner.projectId&&receipt.productionId===owner.production._id&&receipt.productionVersionId===owner.version._id&&receipt.state==='ACTIVE')await ctx.db.patch(receipt._id,{state:'OUTDATED',reason:'UNUSED_STORYBOARD_SOURCE_UNAVAILABLE',updatedAt:Date.now()});
      }
    }
    const selected = parseStoryboardBinding(object(shot.metadata).storyboard);
    if (selected) { await write({ type: 'storyboardFrame', id: selected.frameId }, { type: 'shot', id: shot._id }, 'references'); edges++; }
    for (const take of takes.slice(0, 24)) {
      const consumed = object(object(take.contextSnapshot).storyboardSelection).frameId;
      if (typeof consumed === 'string') { await write({ type: 'storyboardFrame', id: consumed }, { type: 'shotVersion', id: take._id }, 'references'); edges++; }
      if(takeMatchesShot(shot as unknown as Record<string,unknown>,take as unknown as Record<string,unknown>,currentShotHash)){await write({ type: 'shot', id: shot._id }, { type: 'shotVersion', id: take._id }, 'feeds'); edges++;}else{for(const prior of outgoing)if(prior.productionId===owner.production._id&&prior.productionVersionId===owner.version._id&&prior.projectId===owner.projectId&&prior.targetType==='shotVersion'&&prior.targetId===take._id&&prior.state==='ACTIVE')await ctx.db.patch(prior._id,{state:'OUTDATED',reason:object(object(take.contextSnapshot).sourceShotDependency).sourceHash?'SHOT_INPUTS_REVISED':'TAKE_SOURCE_CONTEXT_UNVERIFIED',updatedAt:Date.now()});}
      if (take.assetId) { await write({ type: 'asset', id: take.assetId }, { type: 'shotVersion', id: take._id }, 'derivedFrom'); edges++; }
    }
    return { edges };
}
export const syncShot = mutation({args: { shotId: v.id('shots'), expectedVersionId: v.id('productionVersions') }, returns: v.object({ edges: v.number() }),handler:synchronizeShotDependencies});
export async function synchronizeTimelineDependencies(ctx: MutationCtx, args: { timelineId: Id<'timelines'>; expectedVersionId: Id<'productionVersions'> }, actorId?:Id<'users'>) {
    const timeline = await ctx.db.get(args.timelineId);
    if (!timeline || timelineVersion(timeline) !== args.expectedVersionId) throw new Error('DEPENDENCY_VERSION_UNAVAILABLE');
    const owner = await scope(ctx, timeline.productionId, args.expectedVersionId,actorId);
    const clips = await ctx.db.query('timelineClips').withIndex('by_timeline', q => q.eq('timelineId', timeline._id)).take(201);
    if (clips.length > 200) throw new Error('DEPENDENCY_GRAPH_LIMIT'); let edges = 0;
    for (const clip of clips) {
      const prior=await ctx.db.query('productionDependencies').withIndex('by_target',q=>q.eq('targetType','timelineClip').eq('targetId',clip._id)).take(25);
      if(prior.length>24)throw new Error('DEPENDENCY_HISTORY_LIMIT');
      for(const edge of prior)if(edge.projectId===owner.projectId&&edge.productionId===owner.production._id&&edge.productionVersionId===owner.version._id&&edge.state==='ACTIVE'&&((edge.sourceType==='asset'&&edge.sourceId!==clip.assetId)||(edge.sourceType==='shotVersion'&&edge.sourceId!==clip.shotVersionId)))await ctx.db.patch(edge._id,{state:'OUTDATED',reason:'TIMELINE_SOURCE_REPLACED_CREATE_NEW_EDIT',updatedAt:Date.now()});
      if (clip.assetId) { await recordProductionDependency(ctx, { productionId: owner.production._id, productionVersionId: owner.version._id, source: { type: 'asset', id: clip.assetId }, target: { type: 'timelineClip', id: clip._id }, kind: 'references' },actorId); edges++; }
      if (clip.shotVersionId) { await recordProductionDependency(ctx, { productionId: owner.production._id, productionVersionId: owner.version._id, source: { type: 'shotVersion', id: clip.shotVersionId }, target: { type: 'timelineClip', id: clip._id }, kind: 'placedOn' },actorId); edges++; }
      await recordProductionDependency(ctx, { productionId: owner.production._id, productionVersionId: owner.version._id, source: { type: 'timelineClip', id: clip._id }, target: { type: 'timeline', id: timeline._id }, kind: 'placedOn' },actorId); edges++;
    }
    return { edges };
}
export const syncTimeline = mutation({args:{timelineId:v.id('timelines'),expectedVersionId:v.id('productionVersions')},returns:v.object({edges:v.number()}),handler:synchronizeTimelineDependencies});

/** Revalidate a new hashed receipt at the point its target is consumed. Legacy
 * unhashed rows are handled by their existing assembly policy, never upgraded
 * into verified receipts merely because their state says ACTIVE. */
export async function dependencyIsCurrent(ctx: ReadCtx, production: Doc<'productions'>, receipt: Doc<'productionDependencies'>,actorId?:Id<'users'>): Promise<boolean> {
  if(receipt.state!=='ACTIVE'||!production.projectId||!production.currentVersionId||receipt.projectId!==production.projectId||receipt.productionVersionId!==production.currentVersionId||receipt.productionId!==production._id||!receipt.sourceHash||!receipt.targetHash)return false;
  const types=['asset','storyboardFrame','shot','shotVersion','timelineClip','timeline'];
  if(!types.includes(receipt.sourceType)||!types.includes(receipt.targetType)||receipt.sourceVersionId!==receipt.sourceId||receipt.targetVersionId!==receipt.targetId)return false;
  try{
    const owner=await scope(ctx,production._id,production.currentVersionId,actorId),sourceRef={type:receipt.sourceType,id:receipt.sourceId} as Endpoint,targetRef={type:receipt.targetType,id:receipt.targetId} as Endpoint;
    const source=await endpoint(ctx,owner,sourceRef),target=await endpoint(ctx,owner,targetRef);
    return actualRelation(sourceRef,source.row,targetRef,target.row,source.hash)&&source.hash===receipt.sourceHash&&target.hash===receipt.targetHash;
  }catch{return false;}
}

/** A stale historical edge is superseded only by server-resolved exact current
 * content, never merely by another ACTIVE string in the graph. */
export async function dependencyIsSuperseded(ctx: ReadCtx, production: Doc<'productions'>, stale: Doc<'productionDependencies'>,actorId?:Id<'users'>): Promise<boolean> {
  if(!production.projectId||!production.currentVersionId||stale.projectId!==production.projectId||stale.productionVersionId!==production.currentVersionId||!stale.sourceHash||!stale.targetHash)return false;
  const types=['asset','storyboardFrame','shot','shotVersion','timelineClip','timeline'];
  if(!types.includes(stale.sourceType)||!types.includes(stale.targetType))return false;
  const owner=await scope(ctx,production._id,production.currentVersionId,actorId);
  let candidates=await ctx.db.query('productionDependencies').withIndex('by_source',q=>q.eq('sourceType',stale.sourceType).eq('sourceId',stale.sourceId)).take(201);
  if(candidates.length>200)throw new Error('DEPENDENCY_HISTORY_LIMIT');
  // Direction edits create several retained hashes for the same selected
  // frame. A later explicit selection replacement supersedes that whole
  // source-preserving chain, but only when its recorded replacement receipt
  // matches the exact original endpoints, project, version and source hash.
  const frameToShot=stale.sourceType==='storyboardFrame'&&stale.targetType==='shot';
  const retainedSelectionReplacement=frameToShot&&stale.state==='OUTDATED'&&stale.reason===DRAFT_REBIND_REASON&&Boolean(normalizeSha256(stale.sourceHash))&&Boolean(normalizeSha256(stale.targetHash))&&stale.sourceVersionId===stale.sourceId&&stale.targetVersionId===stale.targetId&&candidates.some(row=>
    row.state==='OUTDATED'&&row.reason==='STORYBOARD_SELECTION_REPLACED'&&row.projectId===owner.projectId&&row.productionId===production._id&&row.productionVersionId===owner.version._id&&
    row.sourceType===stale.sourceType&&row.sourceId===stale.sourceId&&row.sourceVersionId===stale.sourceVersionId&&row.sourceHash===stale.sourceHash&&
    row.targetType===stale.targetType&&row.targetId===stale.targetId&&row.targetVersionId===stale.targetVersionId&&row.kind===stale.kind&&Boolean(normalizeSha256(row.targetHash))&&row.createdAt>=stale.createdAt);
  if(frameToShot&&(stale.reason==='STORYBOARD_SELECTION_REPLACED'||retainedSelectionReplacement)){
    const shotId=ctx.db.normalizeId('shots',stale.targetId),shot=shotId?await ctx.db.get(shotId):null;const selected=shot?parseStoryboardBinding(object(shot.metadata).storyboard):null;
    if(!shot||shot.projectId!==owner.projectId||shot.productionId!==production._id||shot.productionVersionId!==owner.version._id||!selected||selected.frameId===stale.sourceId)return false;
    candidates=await ctx.db.query('productionDependencies').withIndex('by_target',q=>q.eq('targetType','shot').eq('targetId',shot._id)).take(201);
    if(candidates.length>200)throw new Error('DEPENDENCY_HISTORY_LIMIT');
    candidates=candidates.filter(row=>row.sourceType==='storyboardFrame'&&row.sourceId===selected.frameId);
  }else candidates=candidates.filter(row=>row.sourceType===stale.sourceType&&row.sourceId===stale.sourceId);
  for(const candidate of candidates){
    if(candidate.state!=='ACTIVE'||candidate.projectId!==owner.projectId||candidate.productionId!==production._id||candidate.productionVersionId!==owner.version._id||candidate.targetType!==stale.targetType||candidate.targetId!==stale.targetId||candidate.kind!==stale.kind||!candidate.sourceHash||!candidate.targetHash)continue;
    try{const sourceRef={type:candidate.sourceType,id:candidate.sourceId} as Endpoint,targetRef={type:candidate.targetType,id:candidate.targetId} as Endpoint;const source=await endpoint(ctx,owner,sourceRef),target=await endpoint(ctx,owner,targetRef);if(actualRelation(sourceRef,source.row,targetRef,target.row,source.hash)&&candidate.sourceHash===source.hash&&candidate.targetHash===target.hash)return true;}catch{}
  }
  return false;
}
