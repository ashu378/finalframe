import { v } from 'convex/values';
import type { FunctionReference } from 'convex/server';
import { internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import { resolveProjectAccessForActor } from './authorization';
import { GENERATION_LEASE_MS, object } from './generationWorkerContracts';
import { normalizeSha256, sha256Equal } from '../renderer/src/media/sha256';

/** Deployment-admin-only repair. The operator attests a failed completion log;
 * storage timestamps alone never establish provider origin. No provider POST,
 * output approval, cost fabrication or release of an unknown-cost hold. */
export const reconcileStoredImageOutput = internalMutation({
  args: {
    jobId: v.id('generationJobs'), storageId: v.id('_storage'), expectedSha256: v.string(), expectedBytes: v.number(),
    expectedStorageCreatedAt: v.number(), expectedSubmissionStartedAt: v.number(), expectedAttemptNumber: v.number(),
    expectedReservedMicros: v.number(), reason: v.string(), logReference: v.string(), requestId: v.string(),
    attestation: v.literal('FAILED_COMPLETION_LOG_AND_UNCLAIMED_STORAGE'), providerRequestId: v.optional(v.string()),
  },
  returns: v.object({ jobId: v.id('generationJobs'), storageId: v.id('_storage'), replayed: v.boolean() }),
  handler: async (ctx, args) => {
    const reason=args.reason.trim(), logReference=args.logReference.trim();
    if(reason.length<20||reason.length>2000||logReference.length<12||logReference.length>256||!/^[A-Za-z0-9_-]{8,100}$/.test(args.requestId)||!normalizeSha256(args.expectedSha256)||!Number.isSafeInteger(args.expectedBytes)||args.expectedBytes<1||args.expectedBytes>15*1024*1024||!Number.isSafeInteger(args.expectedReservedMicros)||args.expectedReservedMicros<=0||args.providerRequestId!==undefined&&!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(args.providerRequestId))throw new Error('IMAGE_RECONCILIATION_EVIDENCE_INVALID');
    const job=await ctx.db.get(args.jobId);
    if(!job||job.provider!=='openrouter'||job.operation!=='PREPARATION'||job.modality!=='IMAGE'||object(job.request).preparationKind!=='CHARACTER_REFERENCE'||!job.projectId||!job.createdByUserId||!job.submissionStartedAt||job.submissionStartedAt!==args.expectedSubmissionStartedAt||job.attemptCount!==args.expectedAttemptNumber||job.providerJobId)throw new Error('IMAGE_RECONCILIATION_JOB_INVALID');
    const access=await resolveProjectAccessForActor(ctx,job.projectId,job.createdByUserId,['OWNER','EDITOR']);
    const production=await ctx.db.get(job.productionId);
    if(access.project.studioExternalId!==job.studioExternalId||access.project.archivedAt||!production||production.projectId!==job.projectId||production.studioExternalId!==job.studioExternalId)throw new Error('IMAGE_RECONCILIATION_OWNERSHIP_INVALID');
    const fingerprint=JSON.stringify({...args,reason,logReference,expectedSha256:normalizeSha256(args.expectedSha256)});
    const correlationId=`image-output:${args.storageId}`;
    const audit=await ctx.db.query('audit').withIndex('by_correlation',q=>q.eq('correlationId',correlationId)).unique();
    if(audit){if(audit.action!=='IMAGE_STORED_OUTPUT_RECONCILED'||audit.entityId!==job._id||object(audit.metadata).request!==fingerprint)throw new Error('IMAGE_RECONCILIATION_CONFLICT');return{jobId:job._id,storageId:args.storageId,replayed:true};}
    if(job.executionStage!=='RECONCILIATION_REQUIRED'||!['PROCESSING','PENDING'].includes(job.status)||object(job.response).assetId||object(job.response).imageOutput||job.leaseId)throw new Error('IMAGE_RECONCILIATION_JOB_INVALID');
    const hold=job.providerBudgetReservationId?await ctx.db.get(job.providerBudgetReservationId):null;
    const budget=hold?await ctx.db.get(hold.budgetId):null;
    if(!hold||hold.jobId!==job._id||!['RESERVED','RECONCILIATION_REQUIRED'].includes(hold.status)||hold.estimatedMicros!==args.expectedReservedMicros||!budget||budget.reservedMicros<hold.estimatedMicros)throw new Error('IMAGE_RECONCILIATION_HOLD_INVALID');
    const existingAsset=await ctx.db.query('assets').withIndex('by_storage',q=>q.eq('storageId',args.storageId)).first();
    if(existingAsset)throw new Error('IMAGE_RECONCILIATION_STORAGE_ALREADY_OWNED');
    const attempt=await ctx.db.query('attempts').withIndex('by_job_attempt',q=>q.eq('generationJobId',job._id).eq('attemptNumber',job.attemptCount)).unique();
    const stored=await ctx.db.system.get('_storage',args.storageId);
    if(!attempt||typeof attempt.startedAt!=='number'||!Number.isFinite(attempt.startedAt)||!stored||stored._creationTime!==args.expectedStorageCreatedAt||stored._creationTime<job.submissionStartedAt||stored._creationTime>attempt.startedAt+GENERATION_LEASE_MS||stored.size!==args.expectedBytes||!sha256Equal(stored.sha256,args.expectedSha256)||!['image/png','image/jpeg','image/webp'].includes(stored.contentType??''))throw new Error('IMAGE_RECONCILIATION_STORAGE_INVALID');
    if(job.providerRequestId&&args.providerRequestId&&job.providerRequestId!==args.providerRequestId)throw new Error('IMAGE_RECONCILIATION_RECEIPT_CONFLICT');
    const providerRequestId=args.providerRequestId??job.providerRequestId;
    const timestamp=Date.now();
    await ctx.db.patch(job._id,{status:'PENDING',executionStage:'IMAGE_FINALIZE',progress:80,errorCode:undefined,errorMessage:undefined,nextAttemptAt:undefined,...(providerRequestId?{providerRequestId}:{}),response:{...object(job.response),usage:{},imageOutput:{storageId:args.storageId,checksum:stored.sha256,byteSize:stored.size,contentType:stored.contentType,model:job.model,...(providerRequestId?{providerRequestId}:{}),completed:true,storedAt:timestamp,recoveryEvidence:'OPERATOR_FAILED_COMPLETION_LOG'}},updatedAt:timestamp});
    await ctx.db.insert('audit',{studioExternalId:job.studioExternalId,studioId:job.studioId,actorExternalId:'deployment-administrator',action:'IMAGE_STORED_OUTPUT_RECONCILED',entityType:'generationJob',entityId:job._id,correlationId,metadata:{request:fingerprint,reason,logReference,storageId:args.storageId,checksum:normalizeSha256(stored.sha256),byteSize:stored.size,attestation:args.attestation,sourceProof:'OPERATOR_LOG_ATTESTATION_NOT_TIMESTAMP_ONLY',operation:'FINALIZE_STORED_ONLY',unknownProviderCostHoldRetained:job.providerCostUsd===undefined},createdAt:timestamp});
    const worker=(internal as unknown as {generationWorker:{run:FunctionReference<'action','internal',{jobId:typeof job._id},null>}}).generationWorker.run;
    await ctx.scheduler.runAfter(0,worker,{jobId:job._id});
    return{jobId:job._id,storageId:args.storageId,replayed:false};
  },
});
