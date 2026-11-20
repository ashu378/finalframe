'use client';
import { useState } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { useRouter } from 'next/navigation';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';

export function StoryActionAssistant({takeId,canEdit,humanFailed}:{takeId:Id<'shotVersions'>;canEdit:boolean;humanFailed:boolean}){
 const router=useRouter();
 const check=useQuery(api.storyActionChecks.get,{takeId}),repair=useQuery(api.storyActionRepairs.get,{takeId});
 const estimateCheck=useAction(api.storyActionVision.estimate),runCheck=useAction(api.storyActionVision.run),estimateRepair=useAction(api.storyActionRepairs.estimate),startRepair=useMutation(api.generationJobs.createReviewedTake);
 const [quote,setQuote]=useState<{checkId:Id<'storyActionChecks'>;maximumCostUsd:number}|null>(null);
 const [repairQuote,setRepairQuote]=useState<{estimateId:Id<'estimates'>;quoteHash:string;providerHoldMicros:number;totalCredits:number;expiresAt:number}|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const failed=humanFailed||(!check?.stale&&check?.observations?.some((o:any)=>o.result==='FAIL'));
 async function perform(work:()=>Promise<unknown>,failure:string){setBusy(true);setError('');try{await work();router.refresh();}catch(cause){setQuote(null);setRepairQuote(null);setError(cause instanceof Error&&cause.message.includes('ACTION_REPAIR_NEEDS_NEW_APPROACH')?'The previous repair still missed this action. FinalFrame has stopped repeat charges. Revise the shot direction or choose a separately verified approach before another attempt.':failure);}finally{setBusy(false);}}
 return <div className="space-y-3 rounded-lg bg-secondary/40 p-3">
  <h6 className="text-sm font-semibold">Let FinalFrame check the picture</h6>
  <p className="text-sm text-muted-foreground">AI checks the required actions in this exact take. It can miss subtle movement, so you still review the result. It never approves or purchases a replacement on its own.</p>
  {check?.stale?<p role="status">This check belongs to an older version. Check the current take again.</p>:null}
  {check&&!check.stale?<><p role="status" className="text-sm">{check.status==='COMPLETED'?'Picture check saved':check.status==='QUOTED'?'Ready for cost confirmation':check.status==='SUBMITTING'?'Checking the video. You can leave and return.':check.status==='RECONCILIATION_REQUIRED'?'The provider response is uncertain. The saved request must be reconciled; it will not be bought again.':check.status==='RESERVED'?'Check reserved. Do not submit another request.':'The check did not finish.'}{check.costUsd!==null?` · $${check.costUsd.toFixed(4)}`:''}</p>{check.observations?.map((o:any)=><div key={o.actionId} className="text-sm"><strong>{o.result==='PASS'?'Looks present':o.result==='FAIL'?'Needs a fix':'Needs a closer look'}</strong><p>{o.evidence}</p></div>)}</>:null}
  {canEdit&&(!check||check.stale||check.status==='QUOTED')?<Button type="button" size="sm" variant="secondary" disabled={busy} onClick={()=>void perform(async()=>{setQuote(await estimateCheck({takeId}));},'Could not price the check. Check project access, video availability and configured model support.')}>Check this take — see cost</Button>:null}
  {quote&&canEdit?<div className="space-y-2"><p className="text-sm">Maximum authorization: ${quote.maximumCostUsd.toFixed(4)}. Actual use is normally lower. This checks the video; it does not regenerate it.</p><Button type="button" size="sm" disabled={busy} onClick={()=>void perform(async()=>{await runCheck({checkId:quote.checkId});setQuote(null);},'The check could not finish. Its saved status is shown above. No automatic paid retry was sent.')}>Confirm picture check</Button></div>:null}
  {check&&!check.stale&&check.status==='COMPLETED'&&!check.observations&&canEdit?<Button disabled={busy} onClick={()=>void perform(()=>runCheck({checkId:check.id}),'The saved result could not be recovered.')}>Load saved result</Button>:null}
  {failed&&canEdit&&!repair?<Button type="button" size="sm" disabled={busy} onClick={()=>void perform(async()=>{setRepairQuote(await estimateRepair({takeId}));},'Could not prepare this repair. Use the current production, unlock the shot or scene if needed, and make sure its original recording and approved source video are available. No replacement was purchased.')}>Fix only this shot — see cost</Button>:null}
  {repairQuote&&!repair?<div className="space-y-2"><p className="text-sm">New take only: {repairQuote.totalCredits} test credits; maximum provider hold ${(repairQuote.providerHoldMicros/1e6).toFixed(4)}. The source cast and original recording stay attached. Other shots and approved versions stay unchanged. This price expires shortly; request a fresh estimate if it expires.</p><Button type="button" disabled={busy} onClick={()=>void perform(async()=>{await startRepair({estimateId:repairQuote.estimateId,quoteHash:repairQuote.quoteHash});setRepairQuote(null);},'The repair was not started. Refresh an expired estimate or check the saved job status before retrying.')}>Confirm this shot repair</Button></div>:null}
  {repair?<div role="status" className="space-y-2 text-sm"><p>Repair: {repair.status.toLowerCase().replaceAll('_',' ')} · {(repair.stage??repair.status).toLowerCase().replaceAll('_',' ')}</p>{repair.status==='COMPLETED'?<><p>Review the new take in Saved takes and check its actions again. After approval, choose it in the editor and use “Restore original recording” to keep the exact voices. Export stays blocked until that recording is attached.</p><Button type="button" size="sm" variant="secondary" onClick={()=>router.refresh()}>Show the new take</Button></>:<p>The saved job survives reload. An accepted request is never automatically purchased again.</p>}</div>:null}
  {error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}
 </div>;
}
