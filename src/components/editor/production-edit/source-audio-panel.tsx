'use client';

import { useRef, useState } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { SourceAudioTimingChoice } from '../../../../renderer/src/media/source-audio-contract';
import { Button } from '@/components/ui/button';
import { controlInput } from '@/components/production-workspace/resource-approval-controls';

type Picture={id:string;kind:string;shotVersionId?:string;metadata?:Record<string,unknown>};
const labels:Record<SourceAudioTimingChoice,string>={EXACT:'Use the complete recording at matching timing',TRIM_RECORDING:'Trim the recording to the current picture',HOLD_PICTURE:'Hold the last picture frame for the complete recording',KEEP_PICTURE:'Keep the complete recording and current picture length'};
const measureReference=makeFunctionReference<'action',{projectId:Id<'projects'>;takeId:Id<'shotVersions'>},null>('sourceAudio:measureTake');
export function SourceAudioPanel({timelineId,clips,disabled,onCreated}:{timelineId:Id<'timelines'>;clips:Picture[];disabled:boolean;onCreated:(id:Id<'timelines'>)=>void}){
  const pictures=clips.filter(clip=>clip.kind==='VIDEO'&&clip.shotVersionId&&!clip.metadata?.sourceAudioRestoration);
  const [clipId,setClipId]=useState(pictures[0]?.id??''),[jobId,setJobId]=useState(''),[choice,setChoice]=useState<SourceAudioTimingChoice|''>('');
  const [pending,setPending]=useState(false),[error,setError]=useState('');
  const result=useQuery(api.timelineEditor.sourceAudioOptions,clipId?{timelineId,clipId}:'skip');
  const measure=useAction(measureReference),apply=useMutation(api.timelineEditor.apply);
  const busy=useRef(false),request=useRef<{signature:string;key:string}|null>(null);
  if(!result?.enabled||!result.eligible)return null;
  const selected=result.options.find((item:any)=>item.derivationJobId===jobId);
  async function measurePicture(){if(busy.current||!result?.takeId)return;busy.current=true;setPending(true);setError('');try{await measure({projectId:result.projectId,takeId:result.takeId as Id<'shotVersions'>});}catch{setError('Picture timing could not be measured. Check source approval and try again when media processing is available.');}finally{busy.current=false;setPending(false);}}
  async function restore(){
    if(!result||busy.current||disabled||!selected||!choice||!selected.choices.includes(choice)||result.needsMeasurement||result.timingIssue)return;
    const input={clipId,derivationJobId:selected.derivationJobId,timingChoice:choice,confirmedDeltaSamples:selected.deltaSamples,confirmedPlaybackFrames:result.playbackFrames};
    const signature=JSON.stringify({timelineId,...input});if(request.current?.signature!==signature)request.current={signature,key:`restore-source-audio:${crypto.randomUUID()}`};
    busy.current=true;setPending(true);setError('');
    try{const made=await apply({timelineId,kind:'restoreSourceAudio',input,idempotencyKey:request.current.key});request.current=null;onCreated(made.timelineId);}catch{setError('The original recording could not be attached. Check its approval, exact source range, measured picture timing and available space for the selected timing choice.');}finally{busy.current=false;setPending(false);}
  }
  const delta=selected?Math.abs(selected.deltaSeconds).toFixed(6):'';
  return <section className="ff-card space-y-4 p-5" aria-label="Restore original source recording">
    <h3 className="font-semibold">Restore the original recording</h3>
    <p className="text-sm text-muted-foreground">Reuse audio extracted from this take’s exact approved source. The edited take’s sound is muted only in a new draft. Other lanes and approved versions stay intact. This does not synthesize or clone a voice.</p>
    <label className="block text-sm">Edited picture<select className={controlInput} disabled={disabled||pending} value={clipId} onChange={event=>{setClipId(event.target.value);setJobId('');setChoice('');setError('');}}>{pictures.map((clip,index)=><option key={clip.id} value={clip.id}>Edited take {index+1}</option>)}</select></label>
    <p className="text-xs text-muted-foreground">Original source: {result.originalSourceName}. Current picture: {Number(result.pictureSeconds).toFixed(6)} seconds. {typeof result.decodedPictureSeconds==='number'?`Decoded edited media: ${result.decodedPictureSeconds.toFixed(6)} seconds.`:'Measure actual decoded picture frames before restoring audio.'}</p>
    {typeof result.shortPictureFrames==='number'&&result.shortPictureFrames>0?<p className="text-sm text-amber-300">The edited media is {result.shortPictureFrames} picture frame(s) shorter than this edit. Keeping its timing requires explicitly holding the last decoded picture.</p>:null}
    {result.timingIssue?<p role="alert" className="text-sm text-amber-300">{result.timingIssue}</p>:null}
    {result.needsMeasurement?<Button size="sm" variant="secondary" disabled={disabled||pending} onClick={()=>void measurePicture()}>{pending?'Measuring…':'Measure edited picture timing'}</Button>:null}
    {result.options.length?<label className="block text-sm">Approved original recording range<select className={controlInput} disabled={disabled||pending} value={jobId} onChange={event=>{setJobId(event.target.value);setChoice('');setError('');}}><option value="">Choose the exact approved extraction</option>{result.options.map((item:any)=><option key={item.derivationJobId} value={item.derivationJobId}>{item.name} · {item.audioSeconds.toFixed(6)} seconds</option>)}</select></label>:<p className="text-sm text-muted-foreground">Extract the matching range from the original video in Project references, then review and approve the saved WAV. Only matching approved extractions are listed here.</p>}
    {selected?<div className="space-y-3"><audio controls preload="metadata" src={selected.url??undefined} aria-label="Approved original recording preview" className="w-full"/><p className="text-sm">Recording: {selected.audioSeconds.toFixed(6)} seconds. {selected.deltaSamples===0?'Recording and picture lengths match.':`Recording is ${delta} seconds ${selected.deltaSamples>0?'longer':'shorter'} than the current picture.`}</p><label className="block text-sm">Timing choice<select className={controlInput} disabled={disabled||pending} value={choice} onChange={event=>setChoice(event.target.value as SourceAudioTimingChoice| '')}><option value="">Choose explicitly before saving</option>{selected.choices.map((item:SourceAudioTimingChoice)=><option key={item} value={item}>{labels[item]}</option>)}</select></label>
    {choice==='TRIM_RECORDING'?<p role="status" className="text-sm text-amber-300">This cuts {delta} seconds from the end of the recording and may remove spoken words. Review the new draft before approval.</p>:choice==='HOLD_PICTURE'?<p role="status" className="text-sm text-muted-foreground">The current last picture frame will freeze long enough to keep the complete recording. No new picture is generated. Following pictures are not moved.</p>:choice==='KEEP_PICTURE'?<p role="status" className="text-sm text-muted-foreground">The complete recording ends {delta} seconds before the current picture. The picture keeps playing with its provider sound muted.</p>:null}</div>:null}
    {result.hasMoreExtractions?<p className="text-xs text-muted-foreground">Showing matching results from the 50 most recent project extractions.</p>:null}
    <Button size="sm" disabled={disabled||pending||!selected||!choice||!selected.choices.includes(choice)||result.needsMeasurement||Boolean(result.timingIssue)} onClick={()=>void restore()}>{pending?'Saving…':'Restore recording in a new draft'}</Button>
    {error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}
  </section>;
}
