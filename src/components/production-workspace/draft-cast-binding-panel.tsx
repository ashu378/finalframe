'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { WorkspaceControlData } from '@/lib/production/workspace-controls';
import { Button } from '@/components/ui/button';
import { controlInput } from './resource-approval-controls';

export function DraftCastBindingPanel({ data }: { data: WorkspaceControlData }) {
  const router=useRouter(),[bibleId,setBibleId]=useState(''),[mapping,setMapping]=useState<Record<string,string>>({}),[coverage,setCoverage]=useState<Record<string,string[]>>({}),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const key=useRef<{signature:string;key:string}|null>(null);
  const info=useQuery(api.productions.draftCastOptions,data.versionId?{productionId:data.productionId as Id<'productions'>,...(bibleId?{continuityBibleId:bibleId as Id<'continuityBibles'>}:{})}:'skip');
  const bind=useMutation(api.productions.rebindDraftContinuity),approve=useMutation(api.productions.approvePlan);
  if(!info?.cast.length)return null;
  const setup=`/dashboard/projects/${encodeURIComponent(data.projectExternalId)}/workspace/media?production=${encodeURIComponent(data.productionId)}#guided-character-setup`;
  const complete=Boolean(bibleId)&&info.cast.every((item:any)=>mapping[item.key])&&info.shots.every((shot:any)=>coverage[shot.id]!==undefined)&&info.cast.every((item:any)=>info.shots.some((shot:any)=>coverage[shot.id]?.includes(item.key)));
  async function save(){if(!info||!complete||busy)return;setBusy(true);setError('');try{
    const input={projectId:data.projectId as Id<'projects'>,productionId:data.productionId as Id<'productions'>,sourcePlanId:info.planId,sourceVersionId:info.versionId,expectedUpdatedAt:info.updatedAt,expectedSnapshotHash:info.snapshotHash,continuityBibleId:bibleId as Id<'continuityBibles'>,castAssignments:info.cast.map((item:any)=>({proposalKey:item.key,characterVersionId:mapping[item.key] as Id<'projectResourceVersions'>})),shotAssignments:info.shots.map((shot:any)=>({shotId:shot.id,castKeys:coverage[shot.id],noNamedCast:coverage[shot.id].length===0}))};
    const signature=JSON.stringify(input);if(key.current?.signature!==signature)key.current={signature,key:`cast-binding:${crypto.randomUUID()}`};
    await bind({...input,idempotencyKey:key.current.key});key.current=null;setMapping({});setCoverage({});router.refresh();
  }catch{setError('References could not be bound. Reload this draft, check each approved character and bible, and explicitly choose where every character appears. No AI request was made.');}finally{setBusy(false);}}
  return <section id="draft-cast-bindings" aria-label="Approve and bind recurring characters" className="ff-card space-y-4 p-5">
    <h3 className="font-semibold">Turn proposed characters into approved references</h3><p className="text-sm text-muted-foreground">Names and descriptions are proposals, not approved identities. First create or upload each character, approve its reference and a project bible, then explicitly choose where it appears. Silent pictures do not need a voice.</p>
    <a className="inline-flex min-h-11 items-center text-sm text-primary underline" href={setup}>Open guided character and bible setup</a>
    {info.ready?<><p role="status" className="text-sm">The named cast is bound to approved project references. Review the exact shots before approval.</p>{info.versionState==='DRAFT'&&data.canEdit?<Button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await approve({planId:info.planId});router.refresh();}catch{setError('This draft could not be approved. Review its references, timing and current model capability.');}finally{setBusy(false);}}}>Approve this bound draft</Button>:null}</>:info.versionState!=='DRAFT'?<p role="alert" className="text-sm">This older approved plan needs explicit character references before any new video purchase. Create a new draft revision; its existing takes and downloads remain retained.</p>:<>
      <label className="block text-sm">Approved project bible<select className={controlInput} value={bibleId} disabled={!data.canEdit||busy} onChange={event=>{setBibleId(event.target.value);setMapping({});setCoverage({});key.current=null;}}><option value="">Choose an approved bible</option>{data.bibles.filter(item=>['APPROVED','LOCKED'].includes(item.state)).map(item=><option key={item.id} value={item.id}>Bible version {item.versionNumber} · {item.snapshot.resourceBindings.length} references</option>)}</select></label>
      {bibleId&&info.selectedBibleAvailable===false?<p role="alert" className="text-sm">This bible or one of its resources needs review. Choose another approved snapshot or return to reference setup.</p>:null}
      {info.cast.map((item:any)=><label key={item.key} className="block text-sm">{item.name} · approved character<select className={controlInput} value={mapping[item.key]??''} disabled={!data.canEdit||busy||!bibleId} onChange={event=>setMapping(previous=>({...previous,[item.key]:event.target.value}))}><option value="">Choose the exact approved version</option>{info.characters.map((character:any)=><option key={character.id} value={character.id}>{character.name} · {character.assetCount} reference images</option>)}</select></label>)}
      {info.shots.map((shot:any)=><fieldset key={shot.id} className="space-y-2 rounded-xl border border-border p-3"><legend className="px-1 text-sm font-medium">{shot.title}: who appears?</legend><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" disabled={!data.canEdit||busy} checked={coverage[shot.id]?.length===0} onChange={event=>setCoverage(previous=>{const next={...previous};if(event.target.checked)next[shot.id]=[];else delete next[shot.id];return next;})}/>No named character appears in this shot</label>{info.cast.map((item:any)=><label key={item.key} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" disabled={!data.canEdit||busy} checked={coverage[shot.id]?.includes(item.key)??false} onChange={event=>setCoverage(previous=>{const next={...previous},selected=(previous[shot.id]??[]).filter(value=>value!==item.key);if(event.target.checked)next[shot.id]=[...selected,item.key];else if(selected.length)next[shot.id]=selected;else delete next[shot.id];return next;})}/>{item.name}</label>)}</fieldset>)}
      <p className="text-xs text-muted-foreground">Every proposed character must appear in at least one selected shot. To remove a proposed character, explicitly revise the draft. Saving keeps this paid text plan and creates a separate draft; it does not generate or approve media.</p><Button disabled={!data.canEdit||busy||!complete} onClick={()=>void save()}>Bind references to a new draft · no AI purchase</Button>
    </>}{error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}
  </section>;
}
