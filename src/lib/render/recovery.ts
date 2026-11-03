export type FinishingRetryFacts = {
  status: string; executionStage?: string; acceptedAt?: number; dispatchAttempt?: number; errorCode?: string;
  providerJobId?: string; leaseId?: string; dispatchPayload?: unknown;
};
export function finishingRetryEligibility(job: FinishingRetryFacts, context: { canWrite?: boolean; archived?: boolean } = {}) {
  if(context.canWrite===false)return{eligible:false,reason:'Only project owners and editors can retry finishing.'};
  if(context.archived)return{eligible:false,reason:'Restore this project before retrying finishing.'};
  if(['NEEDS_ATTENTION','RECONCILIATION_REQUIRED'].includes(job.executionStage??'')||['RENDER_GRAPHICS_HANDOFF_UNKNOWN','RENDER_HANDOFF_UNKNOWN','RENDER_RECONCILIATION_REQUIRED','RENDER_RECOVERY_WINDOW_EXPIRED'].includes(job.errorCode??''))return{eligible:false,reason:'This job needs recovery review. It cannot be restarted here.'};
  if(!['FAILED','RETRYING'].includes(job.status)) {
    const reason=job.status==='COMPLETED'?'This finishing job is complete.':job.status==='CANCELED'?'This finishing job was canceled.':job.status==='SUBMITTED'?'This finishing job is waiting for completion. Refresh its status as it continues.':['QUEUED','PROCESSING'].includes(job.status)?'This finishing job is already active. Refresh its status as it continues.':'This job is not waiting for a finishing retry.';
    return{eligible:false,reason};
  }
  if(job.acceptedAt!==undefined||job.providerJobId!==undefined||job.leaseId!==undefined||job.dispatchPayload!==undefined||job.executionStage==='AWAITING_CALLBACK')return{eligible:false,reason:'This job needs recovery review. It cannot be restarted here.'};
  const attempts=job.dispatchAttempt??0;
  if(!Number.isSafeInteger(attempts)||attempts<0||attempts>=3||job.errorCode==='RENDER_MAX_ATTEMPTS')return{eligible:false,reason:'This export needs an administrator check before another render attempt.'};
  return{eligible:true,reason:null};
}
export type FinishingRecoveryJob = {
  id: string; status: string; stage: string | null; progress: number; createdAt: number; preset: string;
  error: string | null; canRetry: boolean; retryReason: string | null;
};
export type FinishingRecoverySnapshot = { jobs: FinishingRecoveryJob[]; hasMore: boolean };
export type FinishingProductionPage = { page: Array<{ id: string; label: string }>; continueCursor: string; isDone: boolean };
