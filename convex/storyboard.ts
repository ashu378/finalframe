import { mutation, query } from './_generated/server';
import { api } from './_generated/api';
import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { requireProjectAccess, requireProjectRole } from './authorization';
import { getEffectiveResourceState, requireApprovedResource, requireEditable } from './resourceStates';
import { synchronizeShotDependencies } from './productionDependencies';
import { normalizeSha256, sha256Equal } from '../renderer/src/media/sha256';
import { normalizeShotDirecting, resolveShotDirection, SHOT_DIRECTION_FIELDS, parseStoryboardBinding, selectedFrameAssetIds, stableStoryboardValue, storyboardObject as object, type StoryboardMediaProof, type StoryboardView } from '../src/lib/production/storyboard-contract';

type ReadCtx = QueryCtx | MutationCtx;
const active = (row: { status?: string }) => !['ARCHIVED', 'DELETED'].includes(row.status ?? '');
const denied = (value: unknown) => { const row = object(value); return row.approved === false || row.consent === false || ['DENIED', 'REJECTED', 'REVOKED', 'EXPIRED', 'BLOCKED', 'RESTRICTED', 'QUARANTINED'].includes(String(typeof value === 'string' ? value : row.status ?? row.state ?? '').toUpperCase()); };
const frameKind = v.union(v.literal('UPLOAD'), v.literal('PROJECT_REFERENCE'), v.literal('GENERATED'), v.literal('IMAGE_EDIT'), v.literal('ANGLE'));
const guide = v.union(v.literal('IMAGE_REFERENCE'), v.literal('FIRST_FRAME'));

async function scope(ctx: ReadCtx, shotId: Id<'shots'>) {
  const shot = await ctx.db.get(shotId), production = shot?.productionId ? await ctx.db.get(shot.productionId) : null;
  if (!shot || !production?.projectId || shot.projectId !== production.projectId || !shot.productionVersionId || !active(shot)) throw new Error('STORYBOARD_SHOT_UNAVAILABLE');
  const access = await requireProjectAccess(ctx, production.projectId);
  const version = await ctx.db.get(shot.productionVersionId), scene = await ctx.db.get(shot.sceneId);
  if (!version || version.productionId !== production._id || !scene || scene.productionVersionId !== version._id || scene.productionId !== production._id || !active(scene) || production.studioExternalId !== access.project.studioExternalId) throw new Error('STORYBOARD_SHOT_UNAVAILABLE');
  return { shot, production, version, access };
}
async function editable(ctx: MutationCtx, shotId: Id<'shots'>) {
  const found = await scope(ctx, shotId);
  await requireProjectRole(ctx, found.production.projectId!, ['OWNER', 'EDITOR']);
  if (found.version.status !== 'DRAFT') throw new Error('STORYBOARD_REVISION_REQUIRED');
  await requireEditable(ctx, found.production.projectId!, 'shot', shotId);
  await requireEditable(ctx, found.production.projectId!, 'scene', found.shot.sceneId);
  if(found.shot.sequenceId)await requireEditable(ctx,found.production.projectId!,'sequence',found.shot.sequenceId);
  return found;
}
function checkMetadata(expected: unknown, current: unknown) {
  if (stableStoryboardValue(expected) !== stableStoryboardValue(current)) throw new Error('SHOT_METADATA_CHANGED');
}
async function protectedReferences(ctx:ReadCtx,found:Awaited<ReturnType<typeof scope>>){
  const metadata=object(found.shot.metadata),protectedIds:string[]=[];
  const typed=Array.isArray(metadata.resourceBindings)?metadata.resourceBindings.map(value=>object(value).resourceVersionId):[];
  const ids=[...new Set([...(Array.isArray(metadata.resourceVersionIds)?metadata.resourceVersionIds:[]),...typed])];
  for(const raw of ids.slice(0,100)){const id=typeof raw==='string'?ctx.db.normalizeId('projectResourceVersions',raw):null;const resource=id?await ctx.db.get(id):null;if(resource&&resource.projectId===found.production.projectId)protectedIds.push(...resource.assetIds);}
  const resources=object(found.version.planningContextSnapshot).resources;
  if(Array.isArray(resources))for(const raw of resources.slice(0,100)){const assets=object(raw).assetIds;if(Array.isArray(assets))for(const id of assets)if(typeof id==='string'&&found.shot.requiredAssetIds.includes(id))protectedIds.push(id);}
  if(Array.isArray(metadata.referenceBindings))for(const binding of metadata.referenceBindings){const id=object(binding).assetId;if(typeof id==='string')protectedIds.push(id);}
  if(typeof metadata.lastFrameAssetId==='string')protectedIds.push(metadata.lastFrameAssetId);
  return protectedIds;
}
async function image(ctx: ReadCtx, projectId: Id<'projects'>, assetId: Id<'assets'>,actorUserId?:Id<'users'>) {
  const asset = await ctx.db.get(assetId), stored = asset?.storageId ? await ctx.db.system.get('_storage', asset.storageId) : null;
  if (!asset || asset.projectId !== projectId || asset.scope !== 'PROJECT' || asset.deletedAt || !asset.storageId || !stored || stored.size < 1 || !normalizeSha256(stored.sha256) || !sha256Equal(asset.checksum, stored.sha256) || asset.mimeType !== stored.contentType || !['image/png', 'image/jpeg', 'image/webp'].includes(asset.mimeType ?? '') || [asset.rights, asset.provenance, asset.moderation].some(denied)) throw new Error('STORYBOARD_IMAGE_UNAVAILABLE');
  await requireApprovedResource(ctx, projectId, 'asset', assetId,undefined,actorUserId);
  const proof: StoryboardMediaProof = { assetId: asset._id, storageId: asset.storageId, checksum: stored.sha256, byteSize: stored.size, mimeType: asset.mimeType! };
  return { asset, proof };
}
export async function resolveStoryboardImage(ctx:ReadCtx,projectId:Id<'projects'>,assetId:Id<'assets'>,actorUserId?:Id<'users'>){
  return image(ctx,projectId,assetId,actorUserId);
}
async function frame(ctx: ReadCtx, frameId: Id<'storyboardFrames'>, projectId: Id<'projects'>,actorUserId?:Id<'users'>) {
  const row = await ctx.db.get(frameId);
  if (!row || row.projectId !== projectId) throw new Error('STORYBOARD_FRAME_UNAVAILABLE');
  const media = await image(ctx, projectId, row.assetId,actorUserId);
  if (stableStoryboardValue(object(row.direction).mediaProof) !== stableStoryboardValue(media.proof)) throw new Error('STORYBOARD_FRAME_CHANGED');
  if (row.sourceFrameId) {
    const source = await ctx.db.get(row.sourceFrameId);
    if (!source || source.projectId !== projectId || source.productionId !== row.productionId || source.productionVersionId !== row.productionVersionId) throw new Error('STORYBOARD_SOURCE_UNAVAILABLE');
    const sourceMedia = await image(ctx, projectId, source.assetId,actorUserId);
    if (stableStoryboardValue(object(source.direction).mediaProof) !== stableStoryboardValue(sourceMedia.proof) || stableStoryboardValue(object(row.direction).sourceProof) !== stableStoryboardValue(sourceMedia.proof)) throw new Error('STORYBOARD_SOURCE_CHANGED');
  }
  return { row, ...media };
}

/** Shared source resolver for the image quote/fence; no provider request occurs. */
export async function resolveStoryboardFrame(ctx:ReadCtx,args:{projectId:Id<'projects'>;productionId:Id<'productions'>;productionVersionId:Id<'productionVersions'>;shotId:Id<'shots'>;frameId:Id<'storyboardFrames'>;actorUserId?:Id<'users'>}){
  const selected=await frame(ctx,args.frameId,args.projectId,args.actorUserId);
  if(selected.row.productionId!==args.productionId||selected.row.productionVersionId!==args.productionVersionId||selected.row.shotId!==args.shotId)throw new Error('STORYBOARD_FRAME_UNAVAILABLE');
  return selected;
}

/** Canonical plan materialization only. New rows receive their own immutable
 * candidate lineage; earlier approved shots and candidates are never patched. */
export async function cloneStoryboardSelection(ctx:MutationCtx,args:{projectId:Id<'projects'>;productionId:Id<'productions'>;productionVersionId:Id<'productionVersions'>;shotId:Id<'shots'>;metadata:unknown}){
  const metadata=object(args.metadata),binding=parseStoryboardBinding(metadata.storyboard);
  if(!binding)return metadata;
  const target=await ctx.db.get(args.shotId),version=await ctx.db.get(args.productionVersionId);
  if(!target||target.projectId!==args.projectId||target.productionId!==args.productionId||target.productionVersionId!==args.productionVersionId||!version||version.productionId!==args.productionId)throw new Error('STORYBOARD_REVISION_INVALID');
  const originalId=ctx.db.normalizeId('storyboardFrames',binding.frameId),original=originalId?await frame(ctx,originalId,args.projectId):null;
  if(!original||original.row.productionId!==args.productionId)throw new Error('STORYBOARD_REVISION_INVALID');
  if(original.row.shotId===args.shotId&&original.row.productionVersionId===args.productionVersionId)return metadata;
  const oldShot=await ctx.db.get(original.row.shotId);
  if(!oldShot||oldShot.projectId!==args.projectId||oldShot.productionId!==args.productionId||oldShot.productionVersionId!==original.row.productionVersionId)throw new Error('STORYBOARD_REVISION_INVALID');
  const access=await requireProjectRole(ctx,args.projectId,['OWNER','EDITOR']);
  const visited=new Set<string>(),copied=new Map<string,Id<'storyboardFrames'>>();
  async function copy(id:Id<'storyboardFrames'>,depth:number):Promise<Id<'storyboardFrames'>>{
    if(depth>=8||visited.has(id))throw new Error('STORYBOARD_REVISION_LINEAGE_LIMIT');
    const prior=copied.get(id);if(prior)return prior;
    visited.add(id);const source=await frame(ctx,id,args.projectId);
    if(source.row.productionId!==args.productionId||source.row.productionVersionId!==original!.row.productionVersionId)throw new Error('STORYBOARD_REVISION_INVALID');
    const sourceFrameId=source.row.sourceFrameId?await copy(source.row.sourceFrameId,depth+1):undefined;
    const frameId=await ctx.db.insert('storyboardFrames',{projectId:args.projectId,productionId:args.productionId,productionVersionId:args.productionVersionId,shotId:args.shotId,assetId:source.row.assetId,...(sourceFrameId?{sourceFrameId}:{}),...(source.row.generationJobId?{generationJobId:source.row.generationJobId}:{}),kind:source.row.kind,direction:{...object(source.row.direction),mediaProof:source.proof},prompt:source.row.prompt,createdByUserId:access.user._id,createdAt:Date.now()});
    visited.delete(id);copied.set(id,frameId);return frameId;
  }
  const frameId=await copy(original.row._id,0);
  const next={...metadata,storyboard:{version:1,frameId,generationGuide:binding.generationGuide}};
  delete (next as Record<string,unknown>).storyboardSelection;
  return next;
}

/** Approval and purchase use server-resolved immutable candidates, never caller proofs. */
export async function resolveStoryboardSelection(ctx: ReadCtx, args: { projectId: Id<'projects'>; productionId: Id<'productions'>; productionVersionId: Id<'productionVersions'>; shotId: Id<'shots'>; metadata: unknown; requiredAssetIds: string[];actorUserId?:Id<'users'> }) {
  const binding = parseStoryboardBinding(object(args.metadata).storyboard);
  if (!binding) return null;
  const frameId = ctx.db.normalizeId('storyboardFrames', binding.frameId);
  if (!frameId) throw new Error('STORYBOARD_SELECTION_INVALID');
  const selected = await frame(ctx, frameId, args.projectId,args.actorUserId), row = selected.row;
  if (row.productionId !== args.productionId || row.productionVersionId !== args.productionVersionId || row.shotId !== args.shotId || !args.requiredAssetIds.includes(row.assetId)) throw new Error('STORYBOARD_SELECTION_INVALID');
  if (binding.generationGuide === 'FIRST_FRAME' && object(args.metadata).firstFrameAssetId !== row.assetId) throw new Error('STORYBOARD_SELECTION_INVALID');
  return { binding, frameId: row._id, assetId: row.assetId, mediaProof: selected.proof, kind: row.kind };
}

/** No URL is persisted; authorized reads resolve current Convex storage URLs. */
export const list = query({
  args: { productionId: v.id('productions'), productionVersionId: v.optional(v.id('productionVersions')), offset: v.optional(v.number()) }, returns: v.any(),
  handler: async (ctx, args): Promise<StoryboardView> => {
    const production = await ctx.db.get(args.productionId);
    if (!production?.projectId) throw new Error('STORYBOARD_PROJECT_UNAVAILABLE');
    const access = await requireProjectAccess(ctx, production.projectId);
    if(production.studioExternalId!==access.project.studioExternalId)throw new Error('STORYBOARD_PROJECT_UNAVAILABLE');
    const draft = !args.productionVersionId && production.currentPlanId ? await ctx.db.query('productionVersions').withIndex('by_source_plan', q => q.eq('sourcePlanId', production.currentPlanId!)).first() : null;
    const versionId = args.productionVersionId ?? (draft?.status === 'DRAFT' ? draft._id : production.currentVersionId ?? draft?._id);
    const version = versionId ? await ctx.db.get(versionId) : null;
    if (!version || version.productionId !== production._id) throw new Error('STORYBOARD_VERSION_UNAVAILABLE');
    const offset = args.offset ?? 0;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 200) throw new Error('STORYBOARD_PAGE_INVALID');
    const sequences = (await ctx.db.query('sequences').withIndex('by_version', q => q.eq('productionVersionId', version._id)).take(201)).filter(active).sort((a,b) => a.orderIndex-b.orderIndex);
    const scenes = (await ctx.db.query('scenes').withIndex('by_version', q => q.eq('productionVersionId', version._id)).take(201)).filter(row => active(row) && sequences.some(sequence => sequence._id === row.sequenceId));
    const shots = (await ctx.db.query('shots').withIndex('by_version', q => q.eq('productionVersionId', version._id)).take(201)).filter(row => active(row) && scenes.some(scene => scene._id === row.sceneId));
    if (sequences.length > 200 || scenes.length > 200 || shots.length > 200) throw new Error('STORYBOARD_TOO_LARGE');
    const orderedScenes = scenes.sort((a,b) => sequences.findIndex(row=>row._id===a.sequenceId)-sequences.findIndex(row=>row._id===b.sequenceId) || a.orderIndex-b.orderIndex);
    shots.sort((a,b) => orderedScenes.findIndex(row=>row._id===a.sceneId)-orderedScenes.findIndex(row=>row._id===b.sceneId) || a.orderIndex-b.orderIndex);
    const page = shots.slice(offset, offset + 24), result: StoryboardView['scenes'] = [];
    for (const scene of orderedScenes) {
      const rendered: StoryboardView['scenes'][number]['shots'] = [];
      for (const shot of page.filter(row => row.sceneId === scene._id)) {
        const candidates = await ctx.db.query('storyboardFrames').withIndex('by_shot', q => q.eq('shotId', shot._id)).take(25);
        if (candidates.length > 24) throw new Error('STORYBOARD_TOO_MANY_FRAMES');
        const frames = [];
        for (const candidate of candidates) {
          if (candidate.projectId !== production.projectId || candidate.productionId !== production._id || candidate.productionVersionId !== version._id) throw new Error('STORYBOARD_FRAME_UNAVAILABLE');
          let available = false, url: string | null = null;
          try { const current = await frame(ctx,candidate._id,production.projectId); available = true; url = await ctx.storage.getUrl(current.asset.storageId!); } catch { /* Keep history visible without exposing revoked bytes. */ }
          frames.push({ id:candidate._id,assetId:candidate.assetId,url,mimeType:String(object(object(candidate.direction).mediaProof).mimeType ?? ''),kind:candidate.kind,...(candidate.sourceFrameId?{sourceFrameId:candidate.sourceFrameId}:{}),...(candidate.generationJobId?{generationJobId:candidate.generationJobId}:{}),direction:normalizeShotDirecting(object(candidate.direction).controls),prompt:candidate.prompt,createdAt:candidate.createdAt,available });
        }
        const savedTakes = await ctx.db.query('shotVersions').withIndex('by_shot_version',q=>q.eq('shotId',shot._id)).order('desc').take(25), takes=[];
        for (const take of savedTakes.slice(0,24)) {
          if (take.projectId !== production.projectId || take.productionId !== production._id || take.productionVersionId !== version._id) continue;
          const asset = take.assetId ? await ctx.db.get(take.assetId) : null;
          const safe = asset?.projectId === production.projectId && asset.scope === 'PROJECT' && !asset.deletedAt && ![asset.rights,asset.moderation,asset.provenance].some(denied);
          const state = await getEffectiveResourceState(ctx,production.projectId,'shotVersion',take._id,production._id);
          takes.push({id:take._id,versionNumber:take.versionNumber,status:take.status,state:state.currentState,...(take.assetId?{assetId:take.assetId}:{}),url:safe && asset.storageId?await ctx.storage.getUrl(asset.storageId):null,...(safe && asset.mimeType?{mimeType:asset.mimeType}:{})});
        }
        const direction=resolveShotDirection(shot.metadata,shot.camera),binding=parseStoryboardBinding(object(shot.metadata).storyboard),selected=frames.find(candidate=>candidate.id===binding?.frameId);
        const selectedFrameDirectionOutdated=Boolean(selected&&stableStoryboardValue(selected.direction)!==stableStoryboardValue(direction));
        rendered.push({id:shot._id,title:shot.title,prompt:shot.prompt,durationSeconds:shot.durationSeconds,orderIndex:shot.orderIndex,camera:shot.camera,direction,metadata:shot.metadata??null,selectedFrame:binding,selectedFrameDirectionOutdated,frames,takes,hasMoreTakes:savedTakes.length>24});
      }
      if (rendered.length) result.push({id:scene._id,title:scene.title,purpose:scene.purpose,visualDirection:scene.visualDirection,orderIndex:scene.orderIndex,sequenceId:scene.sequenceId,orderedShotIds:shots.filter(shot=>shot.sceneId===scene._id).map(shot=>shot._id),shots:rendered});
    }
    return {projectId:production.projectId,productionId:production._id,productionVersionId:version._id,versionState:version.status,canEdit:version.status==='DRAFT'&&['OWNER','EDITOR'].includes(access.projectRole),totalShots:shots.length,nextOffset:offset+page.length<shots.length?offset+page.length:null,scenes:result};
  },
});

export const registerFrame = mutation({
  args:{shotId:v.id('shots'),assetId:v.id('assets'),kind:frameKind,sourceFrameId:v.optional(v.id('storyboardFrames')),generationJobId:v.optional(v.id('generationJobs')),direction:v.optional(v.any()),prompt:v.string()},returns:v.id('storyboardFrames'),
  handler:async(ctx,args)=>{
    const found=await editable(ctx,args.shotId), projectId=found.production.projectId!;
    const media=await image(ctx,projectId,args.assetId),controls=normalizeShotDirecting(args.direction),prompt=args.prompt.trim();
    if(prompt.length>4000)throw new Error('STORYBOARD_PROMPT_INVALID');
    let source:Awaited<ReturnType<typeof frame>>|null=null;
    if(args.sourceFrameId){source=await frame(ctx,args.sourceFrameId,projectId);if(source.row.productionId!==found.production._id||source.row.productionVersionId!==found.version._id||source.row.shotId!==args.shotId)throw new Error('STORYBOARD_SOURCE_UNAVAILABLE');}
    if(['IMAGE_EDIT','ANGLE'].includes(args.kind)&&!source)throw new Error('STORYBOARD_SOURCE_UNAVAILABLE');
    if(args.kind==='PROJECT_REFERENCE'&&(args.generationJobId||source))throw new Error('STORYBOARD_JOB_INVALID');
    if(args.kind==='UPLOAD'&&(args.generationJobId||source||media.asset.source==='AI_GENERATED'))throw new Error('STORYBOARD_JOB_INVALID');
    if(!['UPLOAD','PROJECT_REFERENCE'].includes(args.kind)){
      const job=args.generationJobId?await ctx.db.get(args.generationJobId):null,request=object(job?.request),imageRequest=object(request.imageRequest);
      if(!job||job.projectId!==projectId||job.productionId!==found.production._id||job.status!=='COMPLETED'||job.operation!=='PREPARATION'||!['CHARACTER_REFERENCE','STORYBOARD_IMAGE'].includes(String(request.preparationKind))||object(job.response).assetId!==args.assetId||object(media.asset.provenance).generationJobId!==job._id)throw new Error('STORYBOARD_JOB_INVALID');
      if(request.text!==prompt)throw new Error('STORYBOARD_JOB_INVALID');
      const output=object(object(job.response).imageOutput);
      if(output.storageId!==media.proof.storageId||output.checksum!==media.proof.checksum||output.byteSize!==media.proof.byteSize||output.contentType!==media.proof.mimeType)throw new Error('STORYBOARD_OUTPUT_CHANGED');
      if(stableStoryboardValue(normalizeShotDirecting(imageRequest.direction))!==stableStoryboardValue(controls))throw new Error('STORYBOARD_JOB_INVALID');
      if(source&&(!Array.isArray(imageRequest.sourceAssetIds)||!imageRequest.sourceAssetIds.includes(source.row.assetId)||imageRequest.purpose!==args.kind))throw new Error('STORYBOARD_JOB_INVALID');
      if(source&&(!Array.isArray(imageRequest.sourceProofs)||!imageRequest.sourceProofs.some(proof=>stableStoryboardValue(proof)===stableStoryboardValue(source.proof))))throw new Error('STORYBOARD_SOURCE_CHANGED');
      if(source&&(imageRequest.shotId!==args.shotId||imageRequest.sourceFrameId!==args.sourceFrameId||stableStoryboardValue(normalizeShotDirecting(imageRequest.direction))!==stableStoryboardValue(controls)))throw new Error('STORYBOARD_JOB_INVALID');
    }
    const rows=await ctx.db.query('storyboardFrames').withIndex('by_shot',q=>q.eq('shotId',args.shotId)).take(25);
    const direction={version:1,controls,mediaProof:media.proof,...(source?{sourceProof:source.proof}:{})};
    const existing=rows.find(row=>row.assetId===args.assetId&&row.kind===args.kind&&row.sourceFrameId===args.sourceFrameId&&row.generationJobId===args.generationJobId&&row.prompt===prompt&&stableStoryboardValue(row.direction)===stableStoryboardValue(direction));
    if(existing){await synchronizeShotDependencies(ctx,{shotId:args.shotId,expectedVersionId:found.version._id});return existing._id;}
    if(rows.length>=24)throw new Error('STORYBOARD_TOO_MANY_FRAMES');
    const frameId=await ctx.db.insert('storyboardFrames',{projectId,productionId:found.production._id,productionVersionId:found.version._id,shotId:args.shotId,assetId:args.assetId,...(args.sourceFrameId?{sourceFrameId:args.sourceFrameId}:{}),...(args.generationJobId?{generationJobId:args.generationJobId}:{}),kind:args.kind,direction,prompt,createdByUserId:found.access.user._id,createdAt:Date.now()});
    await synchronizeShotDependencies(ctx,{shotId:args.shotId,expectedVersionId:found.version._id});return frameId;
  }
});

export const selectFrame = mutation({args:{shotId:v.id('shots'),frameId:v.id('storyboardFrames'),generationGuide:guide,expectedMetadata:v.any()},returns:v.any(),handler:async(ctx,args):Promise<Doc<'shots'> | null>=>{
  const found=await editable(ctx,args.shotId);checkMetadata(args.expectedMetadata,found.shot.metadata);
  const selected=await frame(ctx,args.frameId,found.production.projectId!);
  if(selected.row.shotId!==args.shotId||selected.row.productionVersionId!==found.version._id||selected.row.productionId!==found.production._id)throw new Error('STORYBOARD_SELECTION_INVALID');
  const metadata=object(found.shot.metadata),previous=parseStoryboardBinding(metadata.storyboard),previousRow=previous?await ctx.db.get(previous.frameId as Id<'storyboardFrames'>):null;
  const boundAssets=await protectedReferences(ctx,found);
  const requiredAssetIds=selectedFrameAssetIds(found.shot.requiredAssetIds,previousRow?.shotId===args.shotId?previousRow.assetId:undefined,selected.row.assetId,boundAssets);
  const next:Record<string,unknown>={...metadata,storyboard:{version:1,frameId:args.frameId,generationGuide:args.generationGuide}};
  let camera:Record<string,unknown>|undefined;
  if(selected.row.kind==='ANGLE'){
    const captured=normalizeShotDirecting(object(selected.row.direction).controls),current=resolveShotDirection(found.shot.metadata,found.shot.camera),direction={...current};
    for(const field of SHOT_DIRECTION_FIELDS)if(captured[field])direction[field]=captured[field];
    direction.preserve=[...new Set([...current.preserve,...captured.preserve])];next.directing=direction;
    camera={...object(found.shot.camera),framing:direction.framing,angle:direction.angle,movement:direction.movement,lens:direction.lens};
  }
  if(args.generationGuide==='FIRST_FRAME'){Object.assign(next,{firstFrameAssetId:selected.row.assetId,requiresFirstFrame:true});}
  else if(previous?.generationGuide==='FIRST_FRAME'&&metadata.firstFrameAssetId===previousRow?.assetId){Object.assign(next,{firstFrameAssetId:null,requiresFirstFrame:false});}
  const saved=await ctx.runMutation(api.scenes.updateShot,{shotId:args.shotId,expectedMetadata:args.expectedMetadata,metadata:next,requiredAssetIds,...(camera?{camera}:{})});await synchronizeShotDependencies(ctx,{shotId:args.shotId,expectedVersionId:found.version._id});return saved;
}});

export const saveDirection=mutation({args:{shotId:v.id('shots'),direction:v.any(),expectedMetadata:v.any()},returns:v.any(),handler:async(ctx,args):Promise<Doc<'shots'> | null>=>{
  const found=await editable(ctx,args.shotId);checkMetadata(args.expectedMetadata,found.shot.metadata);const direction=normalizeShotDirecting(args.direction);
  const saved=await ctx.runMutation(api.scenes.updateShot,{shotId:args.shotId,expectedMetadata:args.expectedMetadata,camera:{...object(found.shot.camera),angle:direction.angle,movement:direction.movement,lens:direction.lens,framing:direction.framing},metadata:{...object(found.shot.metadata),directing:direction}});await synchronizeShotDependencies(ctx,{shotId:args.shotId,expectedVersionId:found.version._id});return saved;
}});
async function syncSaved(ctx:MutationCtx,saved:Doc<'shots'>|null){
  if(!saved?.productionVersionId)throw new Error('STORYBOARD_SHOT_UNAVAILABLE');
  await synchronizeShotDependencies(ctx,{shotId:saved._id,expectedVersionId:saved.productionVersionId});return saved;
}
export const addShot=mutation({args:{sceneId:v.id('scenes'),title:v.string(),prompt:v.string(),durationSeconds:v.number()},returns:v.any(),handler:async(ctx,args):Promise<Doc<'shots'> | null>=>syncSaved(ctx,await ctx.runMutation(api.scenes.createShot,args))});
export const updateShot=mutation({args:{shotId:v.id('shots'),title:v.optional(v.string()),prompt:v.optional(v.string()),durationSeconds:v.optional(v.number()),expectedMetadata:v.any()},returns:v.any(),handler:async(ctx,args):Promise<Doc<'shots'> | null>=>syncSaved(ctx,await ctx.runMutation(api.scenes.updateShot,args))});
export const duplicateShot=mutation({args:{shotId:v.id('shots')},returns:v.any(),handler:async(ctx,args):Promise<Doc<'shots'> | null>=>{
  const found=await editable(ctx,args.shotId);
  const existing=await ctx.db.query('shots').withIndex('by_scene',q=>q.eq('sceneId',found.shot.sceneId)).take(201);
  if(existing.filter(active).length>=200)throw new Error('STORYBOARD_TOO_LARGE');
  const result=await ctx.runMutation(api.scenes.duplicateShot,args);
  if(!result)throw new Error('STORYBOARD_SHOT_UNAVAILABLE');
  const metadata={...object(found.shot.metadata)};delete metadata.storyboard;
  const selected=parseStoryboardBinding(object(found.shot.metadata).storyboard);
  if(selected){const candidate=await resolveStoryboardFrame(ctx,{projectId:found.production.projectId!,productionId:found.production._id,productionVersionId:found.version._id,shotId:found.shot._id,frameId:selected.frameId as Id<'storyboardFrames'>});
    const frameId=await ctx.db.insert('storyboardFrames',{projectId:found.production.projectId!,productionId:found.production._id,productionVersionId:found.version._id,shotId:result._id,assetId:candidate.row.assetId,sourceFrameId:candidate.row._id,...(candidate.row.generationJobId?{generationJobId:candidate.row.generationJobId}:{}),kind:candidate.row.kind,direction:{version:1,controls:normalizeShotDirecting(object(candidate.row.direction).controls),mediaProof:candidate.proof,sourceProof:candidate.proof},prompt:candidate.row.prompt,createdByUserId:found.access.user._id,createdAt:Date.now()});
    metadata.storyboard={version:1,frameId,generationGuide:selected.generationGuide};}
  return syncSaved(ctx,await ctx.runMutation(api.scenes.updateShot,{shotId:result._id,orderIndex:Math.max(-1,...existing.filter(active).map(shot=>shot.orderIndex))+1,expectedMetadata:result.metadata??null,metadata}));
}});
export const removeShot=mutation({args:{shotId:v.id('shots')},returns:v.any(),handler:async(ctx,args):Promise<Doc<'shots'> | null>=>syncSaved(ctx,await ctx.runMutation(api.scenes.deleteShot,args))});
export const reorderShots=mutation({args:{sceneId:v.id('scenes'),orderedShotIds:v.array(v.id('shots'))},returns:v.any(),handler:async(ctx,args):Promise<Doc<'shots'>[]>=>{const saved=await ctx.runMutation(api.scenes.reorderShots,args);for(const shot of saved)await syncSaved(ctx,shot);return saved;}});
export const addSelectedAngleAsShot=mutation({args:{frameId:v.id('storyboardFrames'),title:v.optional(v.string()),durationSeconds:v.number()},returns:v.any(),handler:async(ctx,args):Promise<Doc<'shots'> | null>=>{
  const row=await ctx.db.get(args.frameId);if(!row||row.kind!=='ANGLE')throw new Error('STORYBOARD_ANGLE_REQUIRED');
  const found=await editable(ctx,row.shotId),candidate=await frame(ctx,args.frameId,found.production.projectId!),direction=normalizeShotDirecting(object(candidate.row.direction).controls);
  // The selected alternative deliberately creates a new shot; no other alternatives are inserted.
  const metadata:Record<string,unknown>={...object(found.shot.metadata),directing:direction};delete metadata.storyboard;
  const previous=parseStoryboardBinding(object(found.shot.metadata).storyboard),previousRow=previous?await ctx.db.get(previous.frameId as Id<'storyboardFrames'>):null;
  const requiredAssetIds=selectedFrameAssetIds(found.shot.requiredAssetIds,previousRow?.shotId===found.shot._id?previousRow.assetId:undefined,candidate.row.assetId,await protectedReferences(ctx,found));
  if(previous?.generationGuide==='FIRST_FRAME'&&metadata.firstFrameAssetId===previousRow?.assetId){Object.assign(metadata,{firstFrameAssetId:null,requiresFirstFrame:false});}
  const created=await ctx.runMutation(api.scenes.createShot,{sceneId:found.shot.sceneId,title:args.title?.trim()||`${found.shot.title} · alternative`,prompt:candidate.row.prompt||found.shot.prompt,durationSeconds:args.durationSeconds,camera:{...object(found.shot.camera),angle:direction.angle,movement:direction.movement,lens:direction.lens,framing:direction.framing},requiredAssetIds,metadata});
  if(!created)throw new Error('STORYBOARD_SHOT_UNAVAILABLE');
  const frameId=await ctx.db.insert('storyboardFrames',{projectId:found.production.projectId!,productionId:found.production._id,productionVersionId:found.version._id,shotId:created._id,assetId:candidate.row.assetId,sourceFrameId:candidate.row._id,...(candidate.row.generationJobId?{generationJobId:candidate.row.generationJobId}:{}),kind:'ANGLE',direction:{version:1,controls:direction,mediaProof:candidate.proof,sourceProof:candidate.proof},prompt:candidate.row.prompt,createdByUserId:found.access.user._id,createdAt:Date.now()});
  return syncSaved(ctx,await ctx.runMutation(api.scenes.updateShot,{shotId:created._id,expectedMetadata:metadata,metadata:{...metadata,storyboard:{version:1,frameId,generationGuide:'IMAGE_REFERENCE'}}}));
}});
