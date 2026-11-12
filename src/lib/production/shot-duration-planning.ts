import { videoCatalogFingerprint, VIDEO_CATALOG_MAX_AGE_MS, type VideoModelCapabilities, type VideoRoutePolicy, type VideoRoutingRequest, type VideoRouteSelection } from '../ai/video-routing';
import { canBridgeSilentDuration, selectGenerationDuration } from '../generation/duration-bridge';

export const SHOT_DURATION_PLANNING_VERSION = 'REVIEWED_SHOT_DURATIONS_V1' as const;
export class ShotDurationPlanningError extends Error {
    constructor(readonly code: 'NO_COMPATIBLE_DURATIONS' | 'TOTAL_NOT_DECOMPOSABLE' | 'PLAN_TOTAL_MISMATCH' | 'SHOT_NOT_SUPPORTED', message: string) { super(message); this.name = 'ShotDurationPlanningError'; }
}
export type ReviewedPlanningModel = VideoModelCapabilities & { reviewedAt?: number; lastSeenAt: number; reviewedCatalogFingerprint?: string; platformQuarantinedAt?: number };
export function availablePlanningModels(catalog: readonly ReviewedPlanningModel[], now: number): VideoModelCapabilities[] {
    if (catalog.length > 200 || !Number.isFinite(now)) throw new Error('Planning catalog exceeds its bounds.');
    return catalog.map(model => ({ ...model, available: model.provider === 'openrouter' && model.available && model.platformQuarantinedAt === undefined
        && Boolean(model.reviewedAt) && model.lastSeenAt >= now - VIDEO_CATALOG_MAX_AGE_MS && model.lastSeenAt <= now + 30_000
        && (!model.reviewedCatalogFingerprint || model.reviewedCatalogFingerprint === videoCatalogFingerprint(model)) }));
}
export type PlanningVideoRequest = Omit<VideoRoutingRequest, 'durationSeconds'> & {
    /** Internal planning context, independently derived again from actual shots. */
    durationBridgeAllowed?: boolean;
    hasPlannedDialogue?: boolean;
};
export type PlannedVideoRouteSelection = VideoRouteSelection & {generationDurationSeconds?:number;plannedUseDurationSeconds?:number};
function selectPlanningDuration(request:PlanningVideoRequest,durationSeconds:number,models:readonly VideoModelCapabilities[],policy:VideoRoutePolicy|undefined){
    return selectGenerationDuration({...request,durationSeconds},models,policy,request.durationBridgeAllowed!==true||request.hasPlannedDialogue===true||!Number.isInteger(durationSeconds));
}
export function eligibleShotDurations(request: PlanningVideoRequest, catalog: readonly ReviewedPlanningModel[], policy: VideoRoutePolicy | undefined, now: number): number[] {
    const models = availablePlanningModels(catalog, now);
    const conditionalEditSeconds=request.durationBridgeAllowed===true&&canBridgeSilentDuration({...request,durationSeconds:6},request.hasPlannedDialogue===true)?[4,5,6,7,8]:[];
    const candidates = [...new Set([...models.filter(model => model.available).flatMap(model => model.supportedDurations),...conditionalEditSeconds])]
        .filter(duration => Number.isFinite(duration) && duration > 0 && duration <= 60 && Number.isInteger(duration * 1000)).sort((a,b) => a-b);
    return candidates.filter(durationSeconds => {
        try { const {selection:route}=selectPlanningDuration(request,durationSeconds,models,policy); return route.provider==='openrouter' && route.estimatedCostUsd !== undefined; }
        catch { return false; }
    });
}
function gcd(a: number,b: number): number { while(b){const remainder=a%b;a=b;b=remainder;}return a; }
/** Duration composition only: never edits an approved shot, spoken words or
 * dialogue timing. The planner writes the actual coverage for this schedule. */
export function exactShotSchedule(totalSeconds: number, allowedSeconds: readonly number[]): number[] {
    if (!Number.isFinite(totalSeconds)||totalSeconds<1||totalSeconds>60||!Number.isInteger(totalSeconds*1000)) throw new ShotDurationPlanningError('TOTAL_NOT_DECOMPOSABLE','Choose an exact production duration between one and sixty seconds.');
    const totalMs=Math.round(totalSeconds*1000);
    const allowed=[...new Set(allowedSeconds)].filter(value=>Number.isFinite(value)&&value>=1&&value<=totalSeconds&&Number.isInteger(value*1000)).sort((a,b)=>a-b);
    if(!allowed.length)throw new ShotDurationPlanningError('NO_COMPATIBLE_DURATIONS','No reviewed video route supports these shot controls. Revise the format, references or finish level before planning.');
    const unit=allowed.reduce((value,duration)=>gcd(value,Math.round(duration*1000)),totalMs),total=totalMs/unit;
    const best:Array<{score:number;previous:number;duration:number}|undefined>=Array(total+1);best[0]={score:0,previous:0,duration:0};
    for(let position=1;position<=total;position++)for(const duration of allowed){const length=Math.round(duration*1000)/unit;const previous=best[position-length];if(!Number.isInteger(length)||!previous)continue;
        const score=previous.score+(duration>=4&&duration<=8?0:1000)+Math.abs(duration-6)+.01;
        if(!best[position]||score<best[position]!.score)best[position]={score,previous:position-length,duration};
    }
    if(!best[total])throw new ShotDurationPlanningError('TOTAL_NOT_DECOMPOSABLE',`The requested ${totalSeconds}-second total cannot be made exactly from the reviewed shot lengths (${allowed.join(', ')} seconds). Choose a compatible total or replan; no video request was submitted.`);
    const schedule:number[]=[];let cursor=total;while(cursor>0){const step=best[cursor]!;schedule.push(step.duration);cursor=step.previous;}return schedule.reverse();
}
export function validatePlannedShotDurations(shots: readonly { durationSeconds:number; request:PlanningVideoRequest }[], totalSeconds:number, catalog:readonly ReviewedPlanningModel[], policy:VideoRoutePolicy|undefined, now:number):PlannedVideoRouteSelection[] {
    if(!shots.length||shots.length>200)throw new ShotDurationPlanningError('SHOT_NOT_SUPPORTED','Create a bounded shot plan before approval.');
    const total=shots.reduce((sum,shot)=>sum+shot.durationSeconds,0);
    if(!Number.isFinite(total)||Math.abs(total-totalSeconds)>0.000001)throw new ShotDurationPlanningError('PLAN_TOTAL_MISMATCH',`The planned shots total ${total} seconds instead of the requested ${totalSeconds}. Revise the plan without cutting dialogue.`);
    const models=availablePlanningModels(catalog,now);
    return shots.map((shot,index)=>{
        try { const selected=selectPlanningDuration(shot.request,shot.durationSeconds,models,policy),route=selected.selection;if(route.provider!=='openrouter'||route.estimatedCostUsd===undefined)throw Error();return selected.request.durationSeconds===shot.durationSeconds?route:{...route,generationDurationSeconds:selected.request.durationSeconds,plannedUseDurationSeconds:shot.durationSeconds}; }
        catch { throw new ShotDurationPlanningError('SHOT_NOT_SUPPORTED',`Shot ${index+1} has no reviewed route for its ${shot.durationSeconds}-second duration and required controls. Revise that shot or its dialogue timing before approval.`); }
    });
}
