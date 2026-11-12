'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import { CREATOR_INVOLVEMENT, parseCreatorIntent, type CreatorIntent } from '@/lib/production/creator-intent';
import { PRODUCTION_JOURNEY, creatorStageHref, type CreatorStage } from '@/lib/production/creator-journey';
import { saveProjectInvolvement } from '@/lib/production/episode-actions';
type JourneyProps={projectId:string;productionId?:string;activeStage:CreatorStage;timelineId?:string;creatorIntent?:CreatorIntent;projectRecordId?:string;canEdit?:boolean};
export function ProductionJourney(props:JourneyProps){return <JourneyBody key={`${props.projectId}:${props.productionId??'new'}`} {...props}/>;}
function JourneyBody({projectId,productionId,activeStage,timelineId,creatorIntent,projectRecordId,canEdit=false}:JourneyProps){
    const preference=useQuery(makeFunctionReference<'query'>('creatorPreferences:get'),projectRecordId?{projectId:projectRecordId}:'skip');
    const saved=parseCreatorIntent(preference?.creatorIntent??undefined);
    const context=creatorIntent??saved;
    const effective=context?{...context,involvement:saved?.involvement??context.involvement}:undefined;
    const [choice,setChoice]=useState<CreatorIntent['involvement']|undefined>(),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
    async function save(){if(!choice||!effective||!canEdit)return;setBusy(true);setMessage('');try{const result=await saveProjectInvolvement(projectId,choice,effective);setMessage(result.success?'Involvement preference saved. Existing production versions, approvals and spending authority are unchanged.':result.error??'This preference could not be saved.');}catch{setMessage('This preference could not be saved. Please try again.');}finally{setBusy(false);}}
    return <section aria-label="Production journey" className="space-y-3 rounded-xl border border-border p-4"><nav aria-label="Production stages" className="flex flex-wrap gap-2">{PRODUCTION_JOURNEY.map(stage=><Link key={stage.id} href={creatorStageHref(projectId,productionId,stage.id,timelineId)} aria-current={stage.id===activeStage?'step':undefined} className={`inline-flex min-h-11 items-center rounded-lg px-3 text-sm ${stage.id===activeStage?'bg-secondary font-semibold':'text-muted-foreground hover:text-foreground'}`}>{stage.label}</Link>)}</nav><p className="text-xs leading-5 text-muted-foreground">These are connected views of the selected production. Opening a stage never approves work or purchases media.</p>{effective?<div className="flex flex-wrap items-end gap-3"><label className="text-sm">Your involvement<select aria-label="Project involvement preference" value={choice??effective.involvement} disabled={busy||!canEdit} onChange={event=>{setChoice(event.target.value as CreatorIntent['involvement']);setMessage('');}} className="mt-2 block min-h-11 rounded-lg border border-border bg-background px-3">{CREATOR_INVOLVEMENT.map(level=><option key={level.id} value={level.id}>{level.label}</option>)}</select></label><button type="button" disabled={!choice||busy||!canEdit} onClick={()=>void save()} className="ff-button-quiet min-h-11">{busy?'Saving…':'Save preference'}</button><p className="max-w-xl text-xs leading-5 text-muted-foreground">You may pause, inspect and revise at any level. Required references, reviewed cost limits and the final cut still need approval.</p></div>:null}{message?<p role="status" className="text-sm">{message}</p>:null}</section>;
}
