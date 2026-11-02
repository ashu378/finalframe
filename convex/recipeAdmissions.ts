import type { Doc, Id } from './_generated/dataModel';
import {reusableRecipeJob} from './recipeReuse';
import type { MutationCtx } from './_generated/server';
import { sha256Equal } from '../renderer/src/media/sha256';
import { recipeHash, stableRecipeJson } from '../src/lib/production/recipes/compiler';
import { assertRecipeSourcesCurrent, canonicalRecipeAsset, recipeEnabled, recipeObject, recipeRunScope, recipeWorkerEnabled, type RecipeReadCtx } from './recipeAuthority';

export async function recipeExecutionScope(ctx: RecipeReadCtx, execution: { nodeId: Id<'recipeRunNodes'>; leaseId: string }) {
  if (!recipeEnabled() || !recipeWorkerEnabled()) throw new Error('RECIPE_WORKER_DISABLED');
  const node = await ctx.db.get(execution.nodeId); if (!node || node.leaseId !== execution.leaseId || !node.leaseExpiresAt || node.leaseExpiresAt <= Date.now() || !['READY','RUNNING'].includes(node.status)) throw new Error('RECIPE_NODE_LEASE_INVALID');
  const scope = await recipeRunScope(ctx,node.runId); const {run} = scope;
  if (run.cancelRequestedAt || ['CANCELING','CANCELED','COMPLETED','BLOCKED','NEEDS_ATTENTION'].includes(run.status) || node.projectId !== run.projectId || node.productionVersionId !== run.productionVersionId || node.linkedGenerationJobId) throw new Error('RECIPE_NODE_NOT_ADMISSIBLE');
  await assertRecipeSourcesCurrent(ctx,run);
  const dependencies = [];
  for (const key of node.dependencies) { const dep = await ctx.db.query('recipeRunNodes').withIndex('by_run_node',q=>q.eq('runId',run._id).eq('nodeId',key)).unique(); if(!dep||dep.status!=='COMPLETED')throw new Error('RECIPE_DEPENDENCY_INCOMPLETE'); dependencies.push(dep); }
  return {...scope,node,dependencies};
}

/** Resolved grants are created privately from exact completed preparation
 * results and existing canonical approval records. No browser passes asset IDs
 * as a grant, and an approved shot snapshot is never patched. */
export async function resolveRecipeSlotGrants(ctx: RecipeReadCtx, node: Doc<'recipeRunNodes'>) {
  const request=recipeObject(node.request); const shot=recipeObject(request.shot); const refs=Array.isArray(request.references)?request.references:[]; const expectedSlots=Array.isArray(shot.approvedRecipeReferenceSlots)?shot.approvedRecipeReferenceSlots:[];
  const slots=refs.filter(value=>typeof recipeObject(value).stepKey==='string').map(value=>String(recipeObject(value).stepKey));
  if(slots.length>12||stableRecipeJson(slots)!==stableRecipeJson(expectedSlots))throw new Error('RECIPE_SLOT_PERMISSION_CHANGED');
  const grants=[];
  for(const slotKey of slots){const source=await ctx.db.query('recipeRunNodes').withIndex('by_run_node',q=>q.eq('runId',node.runId).eq('nodeId',slotKey)).unique();if(!source||source.operation!=='PREPARATION'||recipeObject(source.request).kind!=='CHARACTER_REFERENCE'||source.status!=='COMPLETED'||!source.linkedGenerationJobId||!source.resultId)throw new Error('RECIPE_REFERENCE_NOT_READY');
    const job=await ctx.db.get(source.linkedGenerationJobId);const assetId=ctx.db.normalizeId('assets',source.resultId);if(!assetId||!job||job.status!=='COMPLETED'||job.projectId!==node.projectId||recipeObject(job.response).assetId!==assetId||job.operation!=='PREPARATION'||recipeObject(job.request).preparationKind!=='CHARACTER_REFERENCE')throw new Error('RECIPE_REFERENCE_PROVENANCE_CHANGED');
    const found=await canonicalRecipeAsset(ctx,node.projectId,assetId);if(!found.asset.mimeType?.startsWith('image/')||recipeObject(found.asset.provenance).generationJobId!==job._id)throw new Error('RECIPE_REFERENCE_PROVENANCE_CHANGED');
    grants.push({slotKey,sourceNodeId:source._id,sourceJobId:job._id,preparedAssetId:assetId,...found.rawProof});
  }
  return grants;
}

export async function assertResolvedRecipeNode(ctx: RecipeReadCtx, node: Doc<'recipeRunNodes'>) {
  const bindings=recipeObject(node.resolvedBindings);for(const value of Array.isArray(bindings.sourceProofs)?bindings.sourceProofs:[]){const proof=recipeObject(value);const found=await canonicalRecipeAsset(ctx,node.projectId,proof.assetId);if(found.asset.storageId!==proof.storageId||found.asset.checksum!==proof.assetChecksum||!sha256Equal(found.storage.sha256,proof.storageChecksum)||found.storage.size!==proof.byteSize)throw new Error('RECIPE_RESOLVED_SOURCE_CHANGED');}if(!node.resolvedRequestHash||!Array.isArray(bindings.grants)||bindings.grants.length>12)throw new Error('RECIPE_RESOLVED_INPUT_REQUIRED');
  const grants=node.operation==='GENERATION'?await resolveRecipeSlotGrants(ctx,node):[];
  if(stableRecipeJson(grants)!==stableRecipeJson(bindings.grants)||node.resolvedRequestHash!==await recipeHash({requestHash:node.requestHash,bindings}))throw new Error('RECIPE_RESOLVED_INPUT_CHANGED');
  return {bindings,grants};
}

export async function assertRecipeAdmission(ctx: MutationCtx, execution: {nodeId:Id<'recipeRunNodes'>;leaseId:string}, cost:{model:string;providerCeilingUsd:number;credits:number}) {
  const scope=await recipeExecutionScope(ctx,execution);const {node,run}=scope;const resolved=await assertResolvedRecipeNode(ctx,node);const intent=recipeObject(recipeObject(run.canonicalContext).executionIntent);const fresh=Array.isArray(intent.regenerateNodeIds)&&intent.regenerateNodeIds.includes(node.nodeId);let reusable;try{reusable=await reusableRecipeJob(ctx,node,resolved.bindings);}catch(error){if(!(error instanceof Error)||error.message!=='RECIPE_REGENERATION_REVIEW_REQUIRED'||!fresh)throw error;}if(reusable&&(!fresh||reusable.job.status!=='COMPLETED'))throw new Error('RECIPE_REUSE_NOW_AVAILABLE');
  const estimate=run.reviewedEstimateId?await ctx.db.get(run.reviewedEstimateId):null;const quote=recipeObject(recipeObject(estimate?.quotes)[node.nodeId]);const micros=Math.ceil(cost.providerCeilingUsd*1_000_000);
  if(!estimate||estimate.runId!==run._id||estimate.projectId!==run.projectId||!estimate.complete||run.reviewedEstimateHash!==estimate.quoteHash||!run.reviewedAt||Date.now()>estimate.expiresAt||!estimate.stageNodeIds.includes(node.nodeId)||quote.requestHash!==node.requestHash||quote.resolvedRequestHash!==node.resolvedRequestHash||quote.model!==cost.model||typeof quote.checkedAt!=='number'||Date.now()-quote.checkedAt>30000||quote.checkedAt>Date.now()+1000||!Number.isSafeInteger(micros)||micros<=0||!Number.isSafeInteger(cost.credits)||cost.credits<=0||micros>Number(quote.providerCeilingMicros)||cost.credits>Number(quote.creditCeiling))throw new Error('RECIPE_REVIEWED_ESTIMATE_REQUIRED');
  if(node.allocationMicros!==undefined||node.allocationCredits!==undefined||node.admissionHash)throw new Error('RECIPE_NODE_ALREADY_ALLOCATED');
  if((run.admittedMicros??0)+micros>estimate.providerCeilingMicros||(run.admittedCredits??0)+cost.credits>estimate.creditCeiling)throw new Error('RECIPE_REVIEWED_CAP_EXCEEDED');
  return {...scope,micros,estimate,quote,cost};
}

/** Called in the SAME mutation as the existing job and canonical reservations.
 * These counters authorize a reviewed cap; they are not another credit ledger. */
export async function bindRecipeGenerationJob(ctx: MutationCtx, admission: Awaited<ReturnType<typeof assertRecipeAdmission>>, jobId: Id<'generationJobs'>) {
  const {run,node,micros,cost,estimate}=admission;const admissionHash=await recipeHash({runId:run._id,nodeId:node._id,requestHash:node.requestHash,resolvedRequestHash:node.resolvedRequestHash,estimateId:estimate._id,model:cost.model,micros,credits:cost.credits});
  await ctx.db.patch(node._id,{linkedGenerationJobId:jobId,admissionEstimateId:estimate._id,admissionModel:cost.model,allocationMicros:micros,allocationCredits:cost.credits,admissionHash,status:'QUEUED',leaseId:undefined,leaseExpiresAt:undefined,updatedAt:Date.now()});
  await ctx.db.patch(run._id,{admittedMicros:(run.admittedMicros??0)+micros,admittedCredits:(run.admittedCredits??0)+cost.credits,updatedAt:Date.now()});
}

export async function assertRecipeGenerationFence(ctx: MutationCtx, job: Doc<'generationJobs'>, currentProviderCeilingUsd:number) {
  const request=recipeObject(job.request);if(request.recipeRunNodeId===undefined)return;
  const nodeId=ctx.db.normalizeId('recipeRunNodes',request.recipeRunNodeId);const node=nodeId?await ctx.db.get(nodeId):null;
  if(!node||node.linkedGenerationJobId!==job._id||node.idempotencyKey!==job.idempotencyKey||node.projectId!==job.projectId||request.recipeResolvedRequestHash!==node.resolvedRequestHash||!node.admissionHash)throw new Error('RECIPE_JOB_BINDING_INVALID');
  const expectedAdmission=await recipeHash({runId:node.runId,nodeId:node._id,requestHash:node.requestHash,resolvedRequestHash:node.resolvedRequestHash,estimateId:node.admissionEstimateId,model:node.admissionModel,micros:node.allocationMicros,credits:node.allocationCredits});const estimate=node.admissionEstimateId?await ctx.db.get(node.admissionEstimateId):null;if(!estimate||estimate.runId!==node.runId||estimate.projectId!==node.projectId||node.admissionHash!==expectedAdmission||node.admissionModel!==job.model)throw new Error('RECIPE_ADMISSION_PROOF_CHANGED');
  const {run}=await recipeRunScope(ctx,node.runId);if(!recipeEnabled()||!recipeWorkerEnabled()||run.cancelRequestedAt||['CANCELING','CANCELED','BLOCKED','NEEDS_ATTENTION','COMPLETED'].includes(run.status))throw new Error('RECIPE_NEW_SUBMISSION_STOPPED');
  await assertRecipeSourcesCurrent(ctx,run);await assertResolvedRecipeNode(ctx,node);
  const current=Math.ceil(currentProviderCeilingUsd*1_000_000);if(!Number.isSafeInteger(current)||current<=0||current>Number(node.allocationMicros)||job.estimatedCost>Number(node.allocationCredits))throw new Error('RECIPE_REVIEWED_CAP_EXCEEDED');
  const bindings=recipeObject(node.resolvedBindings);const grants=Array.isArray(bindings.grants)?bindings.grants:[];
  for(const grant of grants){const proof=recipeObject(grant);const found=await canonicalRecipeAsset(ctx,run.projectId,proof.preparedAssetId);if(found.asset.storageId!==proof.storageId||found.asset.checksum!==proof.assetChecksum||!sha256Equal(found.storage.sha256,proof.storageChecksum)||found.storage.size!==proof.byteSize)throw new Error('RECIPE_REFERENCE_CHANGED');}
}
