export const PRODUCTION_JOURNEY = [
    { id:'brief',label:'Brief' },{ id:'script',label:'Script' },{ id:'guide',label:'Creative guide' },
    { id:'storyboard',label:'Visual storyboard' },{ id:'takes',label:'Video takes' },
    { id:'edit',label:'Edit and sound' },{ id:'review',label:'Review' },{ id:'export',label:'Export' },
] as const;
export type CreatorStage = typeof PRODUCTION_JOURNEY[number]['id'];
export function parseCreatorStage(value:unknown):CreatorStage|undefined {return typeof value==='string'&&PRODUCTION_JOURNEY.some(stage=>stage.id===value)?value as CreatorStage:undefined;}
export function creatorStageHref(projectId:string,productionId:string|undefined,stage:CreatorStage,timelineId?:string){
    const base=`/dashboard/projects/${encodeURIComponent(projectId)}/workspace`;
    const query=new URLSearchParams();if(productionId)query.set('production',productionId);if(productionId&&timelineId)query.set('timeline',timelineId);
    if(['brief','script','guide'].includes(stage))query.set('stage',stage);
    return `${base}/${['brief','script','guide'].includes(stage)?'plan':stage}${query.size?'?'+query:''}`;
}
