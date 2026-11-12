import type {Doc} from './_generated/dataModel';
import {stableRecipeJson} from '../src/lib/production/recipes/compiler';
import {canonicalRecipeAsset,recipeObject,type RecipeReadCtx} from './recipeAuthority';
import {sanitizeSubmissionDiagnostic} from '../src/lib/ai/submission-diagnostic';

/** A submission fence is uncertainty, not acceptance proof. Only a terminal
 * rejected request with fully released canonical funds may become a deliberate
 * fresh-take choice. This helper never releases or changes any reservation. */
async function definitivelyRejected(ctx:RecipeReadCtx,job:Doc<'generationJobs'>){
 const response=recipeObject(job.response),diagnostic=sanitizeSubmissionDiagnostic(response.submissionDiagnostic);
 if(job.operation!=='SHOT_GENERATION'||job.provider!=='openrouter'||job.status!=='FAILED'||job.executionStage!=='FAILED'||job.errorCode!=='INVALID_REQUEST'||!job.submissionStartedAt||job.providerJobId||job.providerRequestId||!diagnostic||![400,422].includes(diagnostic.httpStatus??0)||recipeObject(response.submissionDiagnostic).requestId!==undefined||job.providerCostUsd!==undefined&&job.providerCostUsd!==0||job.actualCost!==undefined&&job.actualCost!==0)return false;
 if(['assetId','transcriptId','outputUrl','output','imageOutput','audioOutput','sfxOutput'].some(key=>response[key])||!job.shotVersionId||!job.canonicalReservationId||!job.providerBudgetReservationId)return false;
 const take=await ctx.db.get(job.shotVersionId);
 if(!take||take.status!=='FAILED'||take.projectId!==job.projectId||take.productionVersionId!==job.productionVersionId||take.productionId!==job.productionId||take.shotId!==job.shotId||take.studioExternalId!==job.studioExternalId||take.actualCost!==undefined&&take.actualCost!==0||take.assetId)return false;
 if(await ctx.db.query('provenance').withIndex('by_generation_job',q=>q.eq('generationJobId',job._id)).first())return false;
 const credit=await ctx.db.get(job.canonicalReservationId),provider=await ctx.db.get(job.providerBudgetReservationId);
 if(!credit||credit.generationJobId!==job._id||credit.studioExternalId!==job.studioExternalId||!Number.isSafeInteger(credit.amount)||credit.amount<=0||!provider||provider.jobId!==job._id||provider.studioExternalId!==job.studioExternalId||provider.status!=='RELEASED'||provider.actualMicros!==undefined&&provider.actualMicros!==0)return false;
 const entries=await ctx.db.query('ledger').withIndex('by_reservation',q=>q.eq('reservationId',credit._id)).take(101);
 if(entries.length!==2||entries.some(entry=>entry.studioExternalId!==job.studioExternalId||entry.sourceType!=='RESERVATION'||entry.sourceId!==String(credit._id)))return false;
 if(entries.filter(entry=>entry.entryType==='RESERVE'&&entry.amount===-credit.amount).length!==1||entries.filter(entry=>entry.entryType==='RELEASE'&&entry.amount===credit.amount).length!==1)return false;
 if(job.reservationId){const legacy=await ctx.db.get(job.reservationId);if(!legacy||legacy.generationJobId!==job._id||legacy.studioExternalId!==job.studioExternalId||legacy.status!=='RELEASED')return false;}
 return true;
}
/** The request abstract identity alone is insufficient: the immutable resolved
 * model/profile and exact source bytes must match, with current approvals. */
export async function reusableRecipeJob(ctx:RecipeReadCtx,node:Doc<'recipeRunNodes'>,bindings:Record<string,any>){
 const peers=await ctx.db.query('recipeRunNodes').withIndex('by_project_request',q=>q.eq('projectId',node.projectId).eq('operation',node.operation).eq('requestHash',node.requestHash)).take(101);if(peers.length>100)throw new Error('RECIPE_REUSE_HISTORY_LIMIT');let ambiguous=false;
 const candidates=[...peers];
 if(node.operation==='GENERATION'){const shotId=recipeObject(recipeObject(node.request).shot).id;const jobs=await ctx.db.query('generationJobs').withIndex('by_shot',q=>q.eq('shotId',shotId)).take(101);if(jobs.length>100)throw new Error('RECIPE_REUSE_HISTORY_LIMIT');for(const job of jobs){if(job.projectId!==node.projectId||job.productionVersionId!==node.productionVersionId||job._id===node.linkedGenerationJobId)continue;if(candidates.some(p=>p.linkedGenerationJobId===job._id))continue;if(await definitivelyRejected(ctx,job)){ambiguous=true;continue;}const sourceId=ctx.db.normalizeId('recipeRunNodes',recipeObject(job.request).recipeRunNodeId);const source=sourceId?await ctx.db.get(sourceId):null;if(source&&source.projectId===node.projectId&&source.productionVersionId===node.productionVersionId&&source.linkedGenerationJobId===job._id&&source.operation===node.operation)candidates.push(source);else if(job.status==='COMPLETED'||job.providerJobId||job.providerRequestId||job.submissionStartedAt||['QUEUED','PROCESSING','PENDING','SUBMITTED','RETRYING'].includes(job.status)){if(job.status!=='COMPLETED')throw new Error('RECIPE_EXISTING_ACCEPTED_BINDING_REVIEW_REQUIRED');ambiguous=true;}}}
 for(const peer of candidates){if(peer._id===node._id||!peer.linkedGenerationJobId)continue;const job=await ctx.db.get(peer.linkedGenerationJobId);if(!job||job.projectId!==node.projectId)throw new Error('RECIPE_REUSE_PROOF_INVALID');if(await definitivelyRejected(ctx,job)){ambiguous=true;continue;}if(peer.productionVersionId!==node.productionVersionId||stableRecipeJson(reuseIdentity(peer.resolvedBindings))!==stableRecipeJson(reuseIdentity(bindings))){if(job.providerJobId||job.providerRequestId||job.submissionStartedAt||['QUEUED','PROCESSING','PENDING','SUBMITTED','RETRYING'].includes(job.status)||job.executionStage==='RECONCILIATION_REQUIRED')throw new Error('RECIPE_EXISTING_ACCEPTED_BINDING_REVIEW_REQUIRED');ambiguous=true;continue;}
  if(job.status==='COMPLETED'){const id=recipeObject(job.response).assetId;if(!id){if(recipeObject(job.request).preparationKind==='TRANSCRIPT')return {job,peer};ambiguous=true;continue;}try{await canonicalRecipeAsset(ctx,node.projectId,id);if(job.shotVersionId){const approval=await ctx.db.query('resourceStates').withIndex('by_project_resource',q=>q.eq('projectId',node.projectId).eq('resourceType','shotVersion').eq('resourceId',job.shotVersionId!)).unique();if(!approval||!['APPROVED','LOCKED'].includes(approval.state))throw new Error('Unapproved');}return {job,peer};}catch{ambiguous=true;}}
  else if(job.providerJobId||job.providerRequestId||job.submissionStartedAt||['QUEUED','PROCESSING','PENDING','SUBMITTED','RETRYING'].includes(job.status)||job.executionStage==='RECONCILIATION_REQUIRED')return {job,peer};else ambiguous=true;
 }
 if(ambiguous)throw new Error('RECIPE_REGENERATION_REVIEW_REQUIRED');return null;
}

function reuseIdentity(value:unknown):unknown{return JSON.parse(JSON.stringify(value,(key,item)=>key==='sourceNodeId'?undefined:item));}
