'use client';

import { useRef, useState } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';

type Quote = {estimateId: Id<'estimates'>; quoteHash: string; model: string; providerHoldMicros: number; totalCredits: number};

export function PerformanceRetake({takeId}: {takeId: Id<'shotVersions'>}) {
  const option = useQuery(api.storyActionRepairs.performanceOption, { takeId });
  const files = useQuery(api.assetStorage.listProjectAssets, option?.projectId ? { projectId: option.projectId } : 'skip');
  const [imageId, select] = useState<Id<'assets'> | null>(null);
  const [qualityTier, setQuality] = useState<'PREMIUM'|'STANDARD'>('PREMIUM');
  const [notes, setNotes] = useState('');
  const [replaceVideo, confirmVideo] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const router = useRouter();
  const estimate = useAction(api.storyActionRepairs.estimatePerformance);
  const confirm = useMutation(api.generationJobs.createReviewedTake);
  const submit = useMutation(api.approvals.submitForReview);
  const approve = useMutation(api.approvals.approve);
  const imageState = useQuery(api.resourceStates.get, option?.projectId && imageId ? {projectId: option.projectId, resourceType:'asset',resourceId:imageId} : 'skip');
  if (!option) return null;
  if (option.unavailable) return <p className="text-sm">{option.unavailable}</p>;
  if (option.job) return <p role="status" className="text-sm">New performance · {option.job.toLowerCase()}. Open Saved takes to review it.</p>;
  const projectId = option.projectId;
  if (!projectId) return null;
  const images = files?.filter(a => (!option.requiredImage || a._id===option.requiredImage) && a.scope==='PROJECT' && a.storageId && ['image/png','image/jpeg'].includes(a.mimeType ?? ''));
  const picked = images?.find(a => a._id===imageId);
  const ready = (s?:string) => s==='APPROVED' || s==='LOCKED';
  async function work(task:()=>Promise<unknown>) {
    if (running.current) return;
    running.current=true;setBusy(true);setMessage('');
    try {await task();}
    catch (cause) {setQuote(null);setMessage(cause instanceof Error && /premium/i.test(cause.message) ? 'Premium requires an eligible model and a spending limit in the studio settings. You can choose Standard and check its price.' : 'Could not complete this step. Check the source approvals, shot length and available models, then refresh the price. Check Saved takes before retrying a confirmed request.');}
    finally {running.current=false;setBusy(false);}
  }
  async function approveAsset(id:Id<'assets'>,state:string){
    if (!projectId) return;
    const args={projectId,resourceType:'asset',resourceId:id};
    if(state!=='IN_REVIEW')await submit(args);
    await approve(args);
  }
  return <details className="space-y-3 rounded-lg border border-border p-3">
    <summary className="cursor-pointer font-medium">Make a new performance for this shot</summary>
    <p className="mt-3 text-sm">Choose an opening picture that shows the cast and setting. FinalFrame directs the missing action in a new {option.duration}-second take. Review it, then restore the original recording in the editor.</p>
    <label className="block text-sm">Opening picture
      <select className="mt-1 block w-full rounded border bg-background p-2" disabled={busy} value={imageId??''} onChange={e=>{select(e.target.value?e.target.value as Id<'assets'>:null);setQuote(null);setMessage('');}}>
        <option value="">Choose from this project</option>
        {images?.map(a=><option key={a._id} value={a._id}>{a.name??'Project picture'}</option>)}
      </select>
    </label>
    {files && !images?.length?<p className="text-sm">Upload an opening picture to this project’s media library first.</p>:null}
    <label className="block text-sm">Performance quality
      <select className="mt-1 block w-full rounded border bg-background p-2" value={qualityTier} disabled={busy} onChange={e=>{setQuality(e.target.value==='STANDARD'?'STANDARD':'PREMIUM');setQuote(null);setMessage('');}}>
        <option value="PREMIUM">Premium · studio-preferred model</option>
        <option value="STANDARD">Standard</option>
      </select>
    </label>
    <label className="block text-sm">Acting or dialogue timing (optional)
      <textarea className="mt-1 block w-full rounded border bg-background p-2" value={notes} disabled={busy} maxLength={1200} rows={2} placeholder="Who speaks or moves in this shot, and when?" onChange={e=>{setNotes(e.target.value);setQuote(null);}}/>
    </label>
    {option.replaceVideoId?<label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={replaceVideo} disabled={busy} onChange={e=>{confirmVideo(e.target.checked);setQuote(null);}}/>
      Replace the picture from “{option.replaceVideoName || 'original shot'}” with a newly acted shot using this opening image. Keep the approved original recording.
    </label>:null}
    {picked?.storageUrl?<Image src={picked.storageUrl} alt="Selected opening picture" unoptimized width={224} height={128} className="h-32 w-auto max-w-full rounded object-contain" />:null}
    {!ready(option.state)?<Button type="button" size="sm" disabled={busy} onClick={()=>void work(()=>approveAsset(option.assetId,option.state))}>Approve the source video for reuse</Button>:null}
    {option.replaceVideoId && option.replaceVideoId!==option.assetId && option.replaceVideoId!==option.audioAssetId && !ready(option.replacementState??undefined)?<Button type="button" size="sm" disabled={busy} onClick={()=>void work(()=>approveAsset(option.replaceVideoId!,option.replacementState??'DRAFT'))}>Approve the earlier source video for reuse</Button>:null}
    {option.audioAssetId!==option.assetId && !ready(option.audioState)?<Button type="button" size="sm" disabled={busy} onClick={()=>void work(()=>approveAsset(option.audioAssetId,option.audioState))}>Approve the original recording</Button>:null}
    {picked&&imageState&&!ready(imageState.state)?<Button type="button" size="sm" disabled={busy} onClick={()=>void work(()=>approveAsset(picked._id,imageState.state))}>Approve the opening picture</Button>:null}
    {picked&&(!option.replaceVideoId||(replaceVideo&&ready(option.replacementState??undefined)))&&ready(option.state)&&ready(option.audioState)&&ready(imageState?.state)&&!quote?<Button type="button" size="sm" disabled={busy} onClick={()=>void work(async()=>setQuote(await estimate({takeId,imageId:picked._id,qualityTier,...(notes.trim()?{performanceNotes:notes.trim()}:{}),...(option.replaceVideoId&&replaceVideo?{replaceVideoAssetId:option.replaceVideoId}:{})})))}>See performance price</Button>:null}
    {quote?<div className="space-y-2"><p className="text-sm">{quote.model} · {quote.totalCredits} credits · maximum provider hold ${(quote.providerHoldMicros/1e6).toFixed(4)}</p><Button type="button" size="sm" disabled={busy} onClick={()=>void work(async()=>{await confirm({estimateId:quote.estimateId,quoteHash:quote.quoteHash});setQuote(null);router.refresh();})}>Confirm new performance</Button></div>:null}
    {message?<p role="alert" className="text-sm">{message}</p>:null}
  </details>;
}
