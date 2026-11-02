'use client';

import { useState } from 'react';
import { useConvex, useMutation, useQuery } from 'convex/react';
import type { FunctionReference } from 'convex/server';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { TimelineVersion } from '@/lib/render/contracts';
import { Button } from '@/components/ui/button';

const beatApi = (api as unknown as { beatAnalysis: Record<string, FunctionReference<any, 'public', any, any>> }).beatAnalysis;
const field = 'w-full rounded-lg border border-border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';
const reasonLabels: Record<string,string> = { SILENCE:'The source is silent or too quiet for a reliable grid.', TOO_SHORT:'More rhythmic audio is needed for a reliable estimate.', NO_PERIODIC_ONSETS:'No repeating rhythmic pattern was found.', TEMPO_AMBIGUITY:'Several timings fit; review a manual map before cutting.', VARIABLE_TEMPO:'The tempo changes. Review a manual map before cutting.', TOO_DENSE:'The attacks are too dense for a reliable automatic map.' };
function message(error: unknown) { return error instanceof Error ? error.message.match(/Uncaught Error: ([^\n]+)/)?.[1]?.slice(0,300) ?? 'This action could not finish. Review source approval, beat timing and picture ranges.' : 'This action could not finish.'; }

function ManualMap({version,disabled,onSaved}:{version:any;disabled:boolean;onSaved:(id:string)=>void}) {
  const save=useMutation(beatApi.manual);const [text,setText]=useState((version.beatsSeconds as number[]).join(', '));const [note,setNote]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  return <form className="space-y-3 rounded-xl border border-border p-3" onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{const beatsSeconds=text.split(/[\s,]+/).filter(Boolean).map(Number);const result=await save({parentVersionId:version._id,beatsSeconds,correctionNote:note,idempotencyKey:`beat-manual:${crypto.randomUUID()}`});onSaved(result.analysisVersionId);}catch(error){setError(message(error));}finally{setBusy(false);}}}>
    <label className="block space-y-1 text-sm">Reviewed beat times in original audio (seconds)<textarea aria-label="Manual beat times" className={field} rows={4} value={text} disabled={disabled||busy} onChange={event=>setText(event.target.value)} /><span className="text-xs text-muted-foreground">Use increasing comma-separated times before timeline trimming. A manual version records your choices and retains the original detector score.</span></label>
    <label className="block space-y-1 text-sm">What did you correct?<input aria-label="Beat correction note" className={field} required maxLength={1000} value={note} disabled={disabled||busy} onChange={event=>setNote(event.target.value)} /></label>
    <Button type="submit" variant="secondary" disabled={disabled||busy||!note.trim()}>Save manual beat-map version</Button>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </form>;
}

export function MusicBeatEditor({timeline,projectId,onCreatedTimeline}:{timeline:TimelineVersion;projectId:Id<'projects'>;onCreatedTimeline:(id:Id<'timelines'>)=>void}) {
  const audioClips=timeline.tracks.flatMap(track=>track.clips).filter(clip=>clip.kind==='AUDIO');
  const pictureTracks=timeline.tracks.filter(track=>track.clips.length>=2&&track.clips.every(clip=>['VIDEO','IMAGE','GRAPHIC'].includes(clip.kind)));
  const [audioId,setAudioId]=useState(audioClips[0]?.id??'');const [pictureId,setPictureId]=useState(pictureTracks[0]?.id??'');const [versionId,setVersionId]=useState('');
  const audio=audioClips.find(clip=>clip.id===audioId);const assetId=audio?.kind==='AUDIO'?audio.media.assetId:undefined;
  const state=useQuery(beatApi.list,assetId?{projectId,assetId:assetId as Id<'assets'>}:'skip');
  const request=useMutation(beatApi.request);const retry=useMutation(beatApi.retry);const cancel=useMutation(beatApi.cancel);const apply=useMutation(api.timelineEditor.applyBeatCuts);const convex=useConvex();
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [plan,setPlan]=useState<any>(null);
  const version=versionId?state?.versions.find((row:any)=>row._id===versionId):state?.versions[0];
  const active=state?.jobs.find((job:any)=>['QUEUED','PROCESSING','RETRYING'].includes(job.status));const latest=state?.jobs[0];
  const canEdit=Boolean(state?.enabled&&state?.canEdit);const usable=version&&(version.outcome==='RELIABLE'||version.origin==='MANUAL'&&version.outcome==='MANUAL');
  async function run(action:()=>Promise<void>){setBusy(true);setError('');try{await action();}catch(error){setError(message(error));}finally{setBusy(false);}}
  return <section className="space-y-4 rounded-2xl border border-border bg-card p-4" aria-label="Music beat analysis">
    <div><h2 className="text-lg font-semibold">Cut pictures to your soundtrack</h2><p className="mt-1 text-sm text-muted-foreground">Analyze approved project audio, review the beat map, then preview a new cut version. Original audio settings and the source timeline stay preserved.</p></div>
    {!audioClips.length||!pictureTracks.length?<p className="text-sm text-muted-foreground">Add an approved soundtrack and at least two clips on one picture lane to use beat-aligned cuts.</p>:<>
      <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm">Soundtrack clip<select aria-label="Beat analysis soundtrack" className={field} value={audioId} onChange={event=>{setAudioId(event.target.value);setVersionId('');setPlan(null);}}>{audioClips.map((clip,index)=><option key={clip.id} value={clip.id}>Soundtrack {index+1} · {clip.durationSeconds.toFixed(2)}s</option>)}</select></label><label className="space-y-1 text-sm">Ordered picture lane<select aria-label="Beat-aligned picture lane" className={field} value={pictureId} onChange={event=>{setPictureId(event.target.value);setPlan(null);}}>{pictureTracks.map(track=><option key={track.id} value={track.id}>{track.name} · {track.clips.length} pictures</option>)}</select></label></div>
      {state&&!state.enabled&&<p className="text-sm text-muted-foreground">Automatic beat analysis is not enabled in this workspace yet. Retained beat-map versions remain readable.</p>}
      {canEdit&&<div className="flex flex-wrap gap-2"><Button disabled={busy||Boolean(active)||!state.workerEnabled} onClick={()=>run(async()=>{const result=await request({projectId,assetId,idempotencyKey:`beat-request:${crypto.randomUUID()}`});if(result.analysisVersionId)setVersionId(result.analysisVersionId);setPlan(null);})}>Analyze soundtrack</Button>{latest?.status==='FAILED'&&<Button variant="secondary" disabled={busy} onClick={()=>run(async()=>{await retry({jobId:latest.id});})}>Retry analysis</Button>}{active&&<Button variant="secondary" disabled={busy} onClick={()=>run(async()=>{await cancel({jobId:active.id});})}>Cancel analysis</Button>}</div>}
      {active&&<p role="status" className="text-sm text-muted-foreground">{active.status==='PROCESSING'?'Analyzing audio…':active.errorCode==='BEAT_WAITING_FOR_MEDIA'?'Waiting for current media processing to finish.':'Analysis queued. Your exact audio source is retained.'}</p>}
      {state&&!state.workerEnabled&&state.enabled&&<p className="text-sm text-muted-foreground">Analysis processing is paused. Existing queued requests are retained.</p>}
      {version&&<>
        <label className="block space-y-1 text-sm">Beat-map version<select aria-label="Beat-map version" className={field} value={version._id} onChange={event=>{setVersionId(event.target.value);setPlan(null);}}>{state.versions.map((row:any)=><option key={row._id} value={row._id}>{row.origin==='MANUAL'?'Manual':'Automatic'} · {row.outcome.toLowerCase()} · {new Date(row.createdAt).toLocaleString()}</option>)}</select></label>
        <p className="text-sm">{version.origin==='MANUAL'?'Original detector score':'Detector score'}: {Math.round(version.confidence*100)}% · {version.beatsSeconds.length} observed/reviewed beats{version.tempoBpm?` · about ${version.tempoBpm.toFixed(1)} BPM`:''}. <span className="text-muted-foreground">This is a heuristic score, not a guarantee of musical timing.</span></p>
        {!usable&&<p role="status" className="text-sm text-muted-foreground">{reasonLabels[version.reasonCode]??'Review a manual beat map before applying cuts.'}</p>}
        {version.beatsSeconds.length>0&&<div><svg role="img" aria-label="Beat positions across original audio" viewBox="0 0 600 50" className="h-14 w-full rounded-lg bg-secondary"><line x1="0" y1="35" x2="600" y2="35" stroke="currentColor" opacity=".25" />{version.beatsSeconds.slice(0,200).map((beat:number,index:number)=><line key={index} x1={beat/version.durationSeconds*600} y1="8" x2={beat/version.durationSeconds*600} y2="35" stroke="currentColor" />)}</svg><p className="text-xs text-muted-foreground">Original audio: 0–{version.durationSeconds.toFixed(2)}s.{version.beatsSeconds.length>200?' Preview shows the first 200 beats; the editor retains all beat times.':''}</p></div>}
        <ManualMap key={version._id} version={version} disabled={!canEdit||busy} onSaved={id=>{setVersionId(id);setPlan(null);}} />
        <Button variant="secondary" disabled={!canEdit||!usable||busy} onClick={()=>run(async()=>{const preview=await convex.query(api.timelineEditor.previewBeatCuts,{timelineId:timeline.id as Id<'timelines'>,analysisVersionId:version._id,audioClipId:audioId,pictureTrackId:pictureId});setPlan(preview);})}>Preview beat-aligned cuts</Button>
      </>}
      {plan&&<div className="space-y-3 rounded-xl border border-border p-3"><p className="text-sm">New picture length: {plan.durationSeconds.toFixed(2)}s. Footage trims change; the soundtrack’s position, source trim, gain and fades stay unchanged. Review dialogue before approving the new cut.</p><ol className="grid gap-1 text-sm sm:grid-cols-2">{plan.clips.map((clip:any,index:number)=><li key={clip.clipId}>Picture {index+1}: {(clip.startFrame/plan.fps).toFixed(2)}s → {((clip.startFrame+clip.durationInFrames)/plan.fps).toFixed(2)}s</li>)}</ol><Button disabled={!canEdit||busy} onClick={()=>run(async()=>{const result=await apply({timelineId:timeline.id as Id<'timelines'>,analysisVersionId:plan.analysisVersionId,audioClipId:audioId,pictureTrackId:pictureId,expectedPlanHash:plan.planHash,idempotencyKey:`beat-cut:${crypto.randomUUID()}`});onCreatedTimeline(result.timelineId);setPlan(null);})}>Create new beat-aligned timeline</Button></div>}
    </>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
