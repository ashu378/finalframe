'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import { CREATOR_INVOLVEMENT, parseCreatorIntent, type CreatorIntent } from '@/lib/production/creator-intent';
import { PRODUCTION_JOURNEY, creatorStageHref, type CreatorStage } from '@/lib/production/creator-journey';
import { saveProjectInvolvement } from '@/lib/production/episode-actions';
const stageNames: Record<CreatorStage, string> = { brief: 'Your idea', script: 'Script', guide: 'Style & characters', storyboard: 'Scene images', takes: 'Video clips', edit: 'Edit & sound', review: 'Review', export: 'Download' };
type JourneyProps={projectId:string;productionId?:string;activeStage:CreatorStage;timelineId?:string;creatorIntent?:CreatorIntent;projectRecordId?:string;canEdit?:boolean};
export function ProductionJourney(props:JourneyProps){return <JourneyBody key={`${props.projectId}:${props.productionId??'new'}`} {...props}/>;}
function JourneyBody({projectId,productionId,activeStage,timelineId,creatorIntent,projectRecordId,canEdit=false}:JourneyProps){
    const preference=useQuery(makeFunctionReference<'query'>('creatorPreferences:get'),projectRecordId?{projectId:projectRecordId}:'skip');
    const saved=parseCreatorIntent(preference?.creatorIntent??undefined);
    const context=creatorIntent??saved;
    const effective=context?{...context,involvement:saved?.involvement??context.involvement}:undefined;
    const [choice,setChoice]=useState<CreatorIntent['involvement']|undefined>(),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
    async function save(){if(!choice||!effective||!canEdit)return;setBusy(true);setMessage('');try{const result=await saveProjectInvolvement(projectId,choice,effective);setMessage(result.success?'Your preference is saved. Your approved work and cost limits stay the same.':result.error??'This preference could not be saved.');}catch{setMessage('This preference could not be saved. Please try again.');}finally{setBusy(false);}}
    const index = PRODUCTION_JOURNEY.findIndex(stage => stage.id === activeStage);
    const previous = PRODUCTION_JOURNEY[index - 1];
    const next = PRODUCTION_JOURNEY[index + 1];
    return <section aria-label="Production journey" className="rounded-xl border border-border bg-card px-4 py-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <details className="group min-w-0 flex-1">
          <summary className="min-h-11 cursor-pointer py-3 text-sm"><span className="text-muted-foreground">Stage {index + 1} of {PRODUCTION_JOURNEY.length}</span> · <strong>{stageNames[activeStage]}</strong></summary>
          <nav aria-label="Production stages" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">{PRODUCTION_JOURNEY.map((stage,index)=><Link key={stage.id} href={creatorStageHref(projectId,productionId,stage.id,timelineId)} aria-current={stage.id===activeStage?'step':undefined} className={`inline-flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-3 text-sm ${stage.id===activeStage?'bg-primary text-primary-foreground font-semibold':'text-muted-foreground hover:text-foreground'}`}><span aria-hidden="true" className="text-xs opacity-70">{index+1}</span>{stageNames[stage.id]}</Link>)}</nav><p className="text-xs leading-5 text-muted-foreground">Choose a step to see your saved work. You stay in control of approvals and costs.</p>{effective?<div className="flex flex-wrap items-end gap-3"><label className="text-sm">How much help would you like?<select aria-label="Project involvement preference" value={choice??effective.involvement} disabled={busy||!canEdit} onChange={event=>{setChoice(event.target.value as CreatorIntent['involvement']);setMessage('');}} className="mt-2 block min-h-11 rounded-lg border border-border bg-background px-3">{CREATOR_INVOLVEMENT.map(level=><option key={level.id} value={level.id}>{level.label}</option>)}</select></label><button type="button" disabled={!choice||busy||!canEdit} onClick={()=>void save()} className="min-w-11 ff-button-quiet min-h-11">{busy?'Saving…':'Save preference'}</button><p className="max-w-xl text-xs leading-5 text-muted-foreground">You can review or change your work at any time. Making new media still needs your approval.</p></div>:null}{message?<p role="status" className="text-sm">{message}</p>:null}</details>
        <nav aria-label="Adjacent production stages" className="flex flex-wrap items-center gap-4 text-sm">
          {previous && <Link href={creatorStageHref(projectId,productionId,previous.id,timelineId)} className="inline-flex min-h-11 items-center text-muted-foreground underline">Previous stage</Link>}
          {next && <Link href={creatorStageHref(projectId,productionId,next.id,timelineId)} className="inline-flex min-h-11 items-center text-primary">Next: {stageNames[next.id]}</Link>}
        </nav>
      </div>
    </section>;
}
