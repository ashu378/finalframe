'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import { useRouter } from 'next/navigation';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { controlInput } from './resource-approval-controls';

type Job = { jobId:Id<'mediaDerivationJobs'>;sourceAssetId:Id<'assets'>;status:string;attemptCount:number;errorCode:string|null;resultAssetId:Id<'assets'>|null;actualDurationSeconds:number|null;startSeconds:number;durationSeconds:number;createdAt:number;canRetry:boolean };
const refs = {
  request:makeFunctionReference<'mutation',{projectId:Id<'projects'>;sourceAssetId:Id<'assets'>;startSeconds:number;durationSeconds:number;idempotencyKey:string},Job>('mediaDerivations:request'),
  list:makeFunctionReference<'query',{projectId:Id<'projects'>;limit?:number},Job[]>('mediaDerivations:list'),
  retry:makeFunctionReference<'mutation',{jobId:Id<'mediaDerivationJobs'>},Job>('mediaDerivations:retry'),
  cancel:makeFunctionReference<'mutation',{jobId:Id<'mediaDerivationJobs'>},Job>('mediaDerivations:cancel'),
};
export function AudioExtractionPanel({projectId,assets,canEdit}:{projectId:string;assets:Array<{id:string;name:string;mimeType:string;state:string}>;canEdit:boolean}) {
  const router=useRouter();
  const [sourceAssetId,setSource]=useState(''),[start,setStart]=useState(0),[duration,setDuration]=useState(2),[pending,setPending]=useState(false),[error,setError]=useState('');
  const intent=useRef<{fingerprint:string;key:string}|null>(null);
  const jobs=useQuery(refs.list,{projectId:projectId as Id<'projects'>,limit:20});
  const request=useMutation(refs.request),retry=useMutation(refs.retry),cancel=useMutation(refs.cancel);
  const sources=assets.filter(asset=>['video/mp4','video/webm','video/quicktime'].includes(asset.mimeType)&&['APPROVED','LOCKED'].includes(asset.state));
  const valid=Boolean(sources.some(asset=>asset.id===sourceAssetId)&&Number.isFinite(start)&&start>=0&&Number.isFinite(duration)&&duration>0&&duration<=60&&start+duration<=60);
  async function perform(action:()=>Promise<unknown>){setPending(true);setError('');try{await action();}catch{setError('Audio extraction could not start. Check project access, the approved source and selected range, then retry.');}finally{setPending(false);}}
  return <section className="ff-card space-y-4 p-5 sm:p-7" aria-labelledby="audio-extraction-heading">
    <div><h2 id="audio-extraction-heading" className="text-xl font-semibold">Extract source audio</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Save audio from an approved project video as a separate WAV. This uses local media processing with no AI charge. The source stays unchanged. Review the new draft audio before using it; extraction does not grant voice consent.</p></div>
    {canEdit?<div className="grid gap-4 sm:grid-cols-3"><label className="text-sm font-medium sm:col-span-3">Approved source video<select className={controlInput} value={sourceAssetId} onChange={event=>setSource(event.target.value)} disabled={pending}><option value="">Choose project video</option>{sources.map(asset=><option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
      <label className="text-sm font-medium">Start in seconds<input className={controlInput} type="number" min={0} max={60} step={0.001} value={start} onChange={event=>setStart(Number(event.target.value))} disabled={pending}/></label>
      <label className="text-sm font-medium">Length in seconds<input className={controlInput} type="number" min={0.001} max={60} step={0.001} value={duration} onChange={event=>setDuration(Number(event.target.value))} disabled={pending}/></label>
      <div className="flex items-end"><Button type="button" disabled={pending||!valid} onClick={()=>perform(async()=>{const payload={projectId:projectId as Id<'projects'>,sourceAssetId:sourceAssetId as Id<'assets'>,startSeconds:start,durationSeconds:duration};const fingerprint=JSON.stringify(payload);if(intent.current?.fingerprint!==fingerprint)intent.current={fingerprint,key:`extract-audio:${crypto.randomUUID()}`};await request({...payload,idempotencyKey:intent.current.key});})}>{pending?'Saving request…':'Extract audio'}</Button></div>
      <p className="text-xs leading-5 text-muted-foreground sm:col-span-3">Source video: at most 60 seconds and 50 MB. Extracts the first audio track. The selected range must contain audio throughout; missing audio is not filled with silence. Output: 48 kHz stereo PCM WAV. Times are rounded to the nearest audio sample.</p>
    </div>:null}
    {error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}
    <div aria-live="polite" className="space-y-3">{jobs?.map(job=><article key={job.jobId} className="space-y-2 rounded-xl border border-border p-3 text-sm"><p className="font-medium">{assets.find(asset=>asset.id===job.sourceAssetId)?.name??'Project video'} · {job.startSeconds.toFixed(3)}s–{(job.startSeconds+job.durationSeconds).toFixed(3)}s</p><p>{job.status} · processing attempt {job.attemptCount} of 3{job.actualDurationSeconds!==null?` · actual audio ${job.actualDurationSeconds.toFixed(3)} seconds`:''}</p>{job.resultAssetId?<p>Draft audio is saved in the project library. Review and approve it before use. <button type="button" onClick={()=>router.refresh()} className="min-h-11 text-primary underline">Refresh project media</button></p>:null}{job.errorCode?<p>{job.errorCode==='EXTRACTION_WORKER_UNAVAILABLE'?'Media processing is busy or unavailable. This same local task will retry within its processing limit.':job.errorCode==='EXTRACTION_AUDIO_WINDOW_SHORT'?'The selected window does not contain enough audio. Choose a shorter range.':job.errorCode==='EXTRACTION_CANCELED'?'Extraction canceled. Any completed local output stays private.':'Extraction stopped. Check source approval, permissions and the selected audio range.'}</p>:null}
      {canEdit?<div className="flex flex-wrap gap-2">{['QUEUED','PROCESSING','RETRYING'].includes(job.status)?<Button type="button" size="sm" variant="secondary" disabled={pending} onClick={()=>perform(async()=>{await cancel({jobId:job.jobId});intent.current=null;})}>Cancel extraction</Button>:null}{job.canRetry?<Button type="button" size="sm" variant="secondary" disabled={pending} onClick={()=>perform(()=>retry({jobId:job.jobId}))}>Retry local processing</Button>:null}</div>:null}
    </article>)}</div>
  </section>;
}
