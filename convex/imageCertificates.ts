import { action, internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import type { QueryCtx, MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import type { FunctionReference } from 'convex/server';
import { v } from 'convex/values';
import { requireProjectRole } from './authorization';
import { resolveGenerationContinuity } from './generationContinuity';
import { object } from './generationWorkerContracts';
import { REVIEWED_OPERATION_CONTRACTS } from '../src/lib/ai/model-registry';
import { normalizeSha256 } from '../renderer/src/media/sha256';

export interface PortraitSourceCertificate { assetId: string; storageId: string; checksum: string; byteSize: number; width: number; height: number; imageCodec: string; mimeType: string }
type ReadCtx = QueryCtx | MutationCtx;
const argsShape = { productionId: v.id('productions'), shotId: v.id('shots') };
function valid(source: PortraitSourceCertificate) {
  const contract = REVIEWED_OPERATION_CONTRACTS.suppliedAudioAvatar;
  return Boolean(source.assetId && source.storageId && normalizeSha256(source.checksum) && Number.isSafeInteger(source.byteSize) && source.byteSize > 0 && source.byteSize <= contract.maxPortraitBytes && Number.isInteger(source.width) && source.width > 0 && source.width < contract.maxPortraitDimension && Number.isInteger(source.height) && source.height > 0 && source.height < contract.maxPortraitDimension && (source.mimeType === 'image/png' && source.imageCodec === 'png' || source.mimeType === 'image/jpeg' && source.imageCodec === 'mjpeg'));
}
export async function resolvePortraitSourceCertificate(ctx: ReadCtx, args: { projectId: Id<'projects'>; assetId: Id<'assets'> }): Promise<PortraitSourceCertificate> {
  const asset = await ctx.db.get(args.assetId); const storage = asset?.storageId ? await ctx.db.system.get('_storage',asset.storageId) : null;
  const probe = await ctx.db.query('verifiedImageProbes').withIndex('by_asset',q=>q.eq('assetId',args.assetId)).unique();
  if (!asset || asset.projectId !== args.projectId || asset.scope !== 'PROJECT' || asset.deletedAt || !asset.storageId || !storage || !probe || probe.projectId !== args.projectId || probe.storageId !== asset.storageId || probe.checksum !== storage.sha256 || probe.byteSize !== storage.size || asset.mimeType !== storage.contentType) throw new Error('Measure the current project portrait before lip sync.');
  const source = { assetId:asset._id,storageId:asset.storageId,checksum:storage.sha256,byteSize:storage.size,width:probe.width,height:probe.height,imageCodec:probe.imageCodec,mimeType:storage.contentType ?? '' };
  if (!valid(source)) throw new Error('Choose a measured PNG or JPEG portrait below 2K and16MB.');
  return source;
}
async function context(ctx: ReadCtx, args: { productionId: Id<'productions'>; shotId: Id<'shots'> }) {
  const production = await ctx.db.get(args.productionId); const shot = await ctx.db.get(args.shotId);
  if (!production?.projectId || !shot || shot.projectId !== production.projectId || shot.productionId !== production._id || shot.productionVersionId !== production.currentVersionId || object(shot.metadata).operation !== 'LIP_SYNC') throw new Error('Choose a lip-sync shot in the current production.');
  const access = await requireProjectRole(ctx,production.projectId,['OWNER','EDITOR']);
  if (access.project.archivedAt || access.project.deletedAt || access.project.moderationStatus === 'RESTRICTED') throw new Error('Project is unavailable.');
  const version = production.currentVersionId ? await ctx.db.get(production.currentVersionId) : null;
  if (!version || version.productionId !== production._id || version.status !== 'APPROVED') throw new Error('Approve the current production before measuring its portrait.');
  const continuity = await resolveGenerationContinuity(ctx,{projectId:access.project._id,productionId:production._id,snapshot:version.planningContextSnapshot,explicitResourceVersionIds:object(shot.metadata).resourceVersionIds,referenceAssetIds:shot.requiredAssetIds || []});
  const images = [];
  for (const raw of continuity.referenceAssetIds) { const id = ctx.db.normalizeId('assets',raw); const asset = id ? await ctx.db.get(id) : null; if (asset?.mimeType?.startsWith('image/')) images.push(asset); }
  if (images.length !== 1) throw new Error('Choose exactly one approved project portrait.');
  const asset = images[0]; const storage = asset.storageId ? await ctx.db.system.get('_storage',asset.storageId) : null;
  if (asset.projectId !== access.project._id || asset.scope !== 'PROJECT' || asset.deletedAt || !asset.storageId || !storage || asset.mimeType !== storage.contentType || !['image/png','image/jpeg'].includes(storage.contentType ?? '') || storage.size <= 0 || storage.size > REVIEWED_OPERATION_CONTRACTS.suppliedAudioAvatar.maxPortraitBytes) throw new Error('Choose canonical project PNG or JPEG portrait bytes.');
  return { asset,storage,projectId:access.project._id };
}
export const sourceContext = internalQuery({args:argsShape,returns:v.any(),handler:async(ctx,args)=>{
  const value = await context(ctx,args); const url = await ctx.storage.getUrl(value.asset.storageId!); if (!url) throw new Error('Portrait unavailable.');
  return {assetId:value.asset._id,storageId:value.asset.storageId,checksum:value.storage.sha256,byteSize:value.storage.size,mimeType:value.storage.contentType,url};
}});
export const recordProbe = internalMutation({args:{...argsShape,assetId:v.id('assets'),storageId:v.id('_storage'),checksum:v.string(),byteSize:v.number(),probe:v.any()},returns:v.any(),handler:async(ctx,args)=>{
  const value = await context(ctx,args); const probe=object(args.probe);
  if (value.asset._id !== args.assetId || value.asset.storageId !== args.storageId || value.storage.sha256 !== args.checksum || value.storage.size !== args.byteSize || probe.checksum !== args.checksum || probe.byteSize !== args.byteSize || probe.mimeType !== value.storage.contentType || probe.frameCount !== 1) throw new Error('Portrait measurement or source bytes changed.');
  const source = {assetId:args.assetId,storageId:args.storageId,checksum:args.checksum,byteSize:args.byteSize,width:Number(probe.width),height:Number(probe.height),imageCodec:String(probe.imageCodec ?? ''),mimeType:String(probe.mimeType ?? '')};
  if (!valid(source)) throw new Error('Invalid portrait measurement.');
  const existing=await ctx.db.query('verifiedImageProbes').withIndex('by_asset',q=>q.eq('assetId',args.assetId)).unique();
  const {mimeType:_mime,...facts}=source;void _mime;
  const row={projectId:value.projectId,...facts,probedAt:Date.now()};if(existing)await ctx.db.patch(existing._id,row);else await ctx.db.insert('verifiedImageProbes',row);return source;
}});
export const prepareSource = action({args:argsShape,returns:v.any(),handler:async(ctx,args):Promise<PortraitSourceCertificate>=>{
  const refs=(internal as unknown as {imageCertificates:Record<string,FunctionReference<any,'internal',any,any>>}).imageCertificates;
  const value=await ctx.runQuery(refs.sourceContext,args);const base=process.env.RENDER_WORKER_URL?.trim();const secret=process.env.RENDER_WORKER_SHARED_SECRET?.trim();if(!base||!secret)throw new Error('Portrait measurement is not configured.');
  const response=await fetch(base.replace(/\/$/,'')+'/media/probe',{method:'POST',headers:{'content-type':'application/json','x-finalframe-worker-secret':secret},body:JSON.stringify({...value,kind:'image'}),redirect:'error',signal:AbortSignal.timeout(45_000)});
  if(!response.ok)throw new Error('Portrait could not be verified.');return ctx.runMutation(refs.recordProbe,{...args,assetId:value.assetId,storageId:value.storageId,checksum:value.checksum,byteSize:value.byteSize,probe:await response.json()});
}});
