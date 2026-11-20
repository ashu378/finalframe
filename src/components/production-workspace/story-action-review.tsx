'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { StoryAction, StoryActionObservation } from '@/lib/production/story-actions';
import { Button } from '@/components/ui/button';

const inputClass='mt-1 min-h-11 w-full rounded-lg border border-border bg-background p-2 text-sm';
export function StoryActionReview({takeId,canReview}:{takeId:string;canReview:boolean}) {
    const data=useQuery(api.storyActionReviews.get,{takeId:takeId as Id<'shotVersions'>});
    const record=useMutation(api.storyActionReviews.record);
    const [draft,setDraft]=useState<{key:string;values:Record<string,Partial<StoryActionObservation>>}|null>(null);
    const [error,setError]=useState('');const [busy,setBusy]=useState(false);
    if(!data?.actions?.length)return null;
    const actions=data.actions as StoryAction[];
    const requirementKey=data.requirementKey;
    const saved:Record<string,Partial<StoryActionObservation>>=data.latest?.requirementKey===requirementKey?Object.fromEntries((data.latest.observations as StoryActionObservation[]).map(item=>[item.actionId,item])):{};
    const values=draft?.key===requirementKey?draft.values:saved;
    const update=(id:string,change:Partial<StoryActionObservation>)=>setDraft(previous=>{const current=previous?.key===requirementKey?previous.values:saved;return {key:requirementKey,values:{...current,[id]:{...current[id],...change}}};});
    async function save(){setBusy(true);setError('');try{await record({takeId:takeId as Id<'shotVersions'>,requirementKey,observations:actions.map(a=>({actionId:a.id,result:values[a.id]?.result??'FAIL',observedStartSeconds:values[a.id]?.observedStartSeconds??null,observedEndSeconds:values[a.id]?.observedEndSeconds??null,evidence:values[a.id]?.evidence??''}))});}catch{setError('Could not save this review. Check every action, add what you saw and enter valid timing for passing actions. Reload if the take changed.');}finally{setBusy(false);}}
    return <section aria-label="Visible story action checks" className="space-y-3 rounded-xl border border-border p-4"><h6 className="font-semibold">Does the action match the story?</h6><p className="text-sm text-muted-foreground">Watch the actual take. Spoken words and moving mouths do not prove an action happened. These checks need a human review; they are not automatic visual detection.</p>{data.passed?<p role="status" className="text-sm">All required actions were reviewed for this exact take.</p>:<p role="status" className="text-sm">Approval is blocked until every action is visibly present at the right time.</p>}{actions.map(a=><fieldset key={a.id} disabled={!canReview||busy} className="space-y-2 border-t border-border pt-3"><legend className="font-medium">{a.subject}</legend><p className="text-sm">{a.action}</p><p className="text-xs text-muted-foreground">Required at {a.startSeconds}–{a.endSeconds}s{a.beforeSeconds===null?'':`, starting before ${a.beforeSeconds}s`}.</p><label className="block text-sm">What did you see?<select className={inputClass} value={values[a.id]?.result??''} onChange={event=>update(a.id,{result:event.target.value as 'PASS'|'FAIL'})}><option value="" disabled>Choose after watching</option><option value="PASS">Action is clearly visible at the required time</option><option value="FAIL">Missing, unclear, wrong person or too late</option></select></label>{values[a.id]?.result==='PASS'?<div className="grid grid-cols-2 gap-3">{(['observedStartSeconds','observedEndSeconds'] as const).map(field=><label key={field} className="text-sm">{field==='observedStartSeconds'?'First seen (seconds)':'Last seen (seconds)'}<input type="number" min={a.startSeconds} max={a.endSeconds} step="0.01" className={inputClass} value={values[a.id]?.[field]??''} onChange={event=>update(a.id,{[field]:event.target.value===''?null:Number(event.target.value)})}/></label>)}</div>:null}<label className="block text-sm">Evidence from the picture<textarea className={inputClass} maxLength={2000} minLength={12} value={values[a.id]?.evidence??''} placeholder="Describe the movement you saw, or what was missing." onChange={event=>update(a.id,{evidence:event.target.value})}/></label></fieldset>)}{canReview?<Button type="button" variant="secondary" disabled={busy||actions.some(a=>!values[a.id]?.result||(values[a.id]?.evidence?.trim().length??0)<12)} onClick={()=>void save()}>Save action review</Button>:null}{error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}</section>;
}
