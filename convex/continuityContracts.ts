import { v } from "convex/values";
import type { Doc,Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export const projectResourceKind = v.union(
  v.literal("CHARACTER"), v.literal("LOCATION"), v.literal("COSTUME"), v.literal("PROP"),
  v.literal("PRODUCT"), v.literal("BRAND"), v.literal("STYLE"),
);

export const bibleSnapshot = v.object({
  resourceBindings: v.array(v.object({ resourceId: v.id("projectResources"), resourceVersionId: v.id("projectResourceVersions") })),
  rules: v.array(v.string()),
  story: v.string(),
  visualStyle: v.string(),
});

export const storySnapshot = v.object({
  summary: v.string(), facts: v.array(v.string()), unresolvedThreads: v.array(v.string()),
  cliffhanger: v.string(), nextEpisodePayoff: v.string(),
  characterStates: v.array(v.object({ resourceId: v.id("projectResources"), knowledge: v.string(), relationships: v.string() })),
});

export function boundedText(value: string, label: string, maxLength = 4000) {
  const text = value.trim();
  if (!text || text.length > maxLength) throw new Error(`${label} must contain 1–${maxLength} characters.`);
  return text;
}

export function boundedSnapshot(value: unknown) {
  if (new TextEncoder().encode(JSON.stringify(value)).length > 100_000) throw new Error("Continuity snapshot exceeds the 100 KB limit.");
}

type ReadCtx = QueryCtx | MutationCtx;

export async function validateProjectResourceReferences(
  ctx: ReadCtx,
  projectId: Id<"projects">,
  value: { assetIds: Id<"assets">[]; voiceId?: Id<"voices">; voiceVersionId?:Id<'voiceVersions'> },
) {
  if (value.assetIds.length > 50 || new Set(value.assetIds).size !== value.assetIds.length) throw new Error("Use at most 50 distinct project reference assets.");
  for (const assetId of value.assetIds) {
    const asset = await ctx.db.get(assetId);
    if (!asset || asset.deletedAt || asset.scope !== "PROJECT" || asset.projectId !== projectId) {
      throw new Error("Every continuity asset must be explicitly owned by this project.");
    }
  }
  if (value.voiceId) {
    const voice = await ctx.db.get(value.voiceId);
    if (!voice || voice.projectId !== projectId || voice.deletedAt || voice.revokedAt || voice.status === "REVOKED") {
      throw new Error("Continuity voice must be active and owned by this project.");
    }
  }
  if(value.voiceVersionId){
    const version=await ctx.db.get(value.voiceVersionId);
    if(!value.voiceId||!version||version.projectId!==projectId||version.voiceId!==value.voiceId)throw new Error('Voice version must match the selected project voice.');
  }
}

/** Validate exact immutable resource versions; never substitute a studio default. */
export async function validateBibleBindings(ctx: ReadCtx, projectId: Id<"projects">, snapshot: unknown, approvedOnly: boolean) {
  boundedSnapshot(snapshot);
  const value = snapshot as { resourceBindings?: Array<{ resourceId: Id<"projectResources">; resourceVersionId: Id<"projectResourceVersions"> }>; rules?: string[] };
  if (!Array.isArray(value.resourceBindings) || !Array.isArray(value.rules)) throw new Error("The continuity bible has no valid resource bindings or rules.");
  if (value.resourceBindings.length > 100 || value.rules.length > 100) throw new Error("A continuity bible supports at most 100 resources and 100 rules.");
  const seen = new Set<string>();
  for (const binding of value.resourceBindings) {
    if (seen.has(binding.resourceId)) throw new Error("A resource can appear only once in a continuity bible.");
    seen.add(binding.resourceId);
    const [resource, version] = await Promise.all([ctx.db.get(binding.resourceId), ctx.db.get(binding.resourceVersionId)]);
    if (!resource || resource.projectId !== projectId || resource.archivedAt || !version || version.projectId !== projectId || version.resourceId !== resource._id) {
      throw new Error("Continuity resource versions must belong to this project.");
    }
    await validateProjectResourceReferences(ctx, projectId, version);
    if (approvedOnly) {
      const state = await ctx.db.query("resourceStates").withIndex("by_project_resource", (q) => q.eq("projectId", projectId).eq("resourceType", "projectResourceVersion").eq("resourceId", version._id.toString())).unique();
      if (!state || (state.state !== "APPROVED" && state.state !== "LOCKED")) throw new Error("Approve every bound resource version before approving the continuity bible.");
    }
  }
}

export interface ShotResourceBinding {role:string;resourceVersionId:string;voiceVersionId?:string;characterResourceVersionId?:string}
export interface ShotDialogueSegment {speakerResourceVersionId:string;voiceVersionId:string;startSeconds:number;durationSeconds:number;text:string;delivery?:string}

/** Planner IDs remain proposals until their exact project and bible versions
 * are checked. Dialogues cannot select an invented or mutable voice profile. */
export async function validateShotBindings(ctx:ReadCtx,projectId:Id<'projects'>,snapshot:unknown,metadata:unknown,durationSeconds:number){
  const plan=snapshot&&typeof snapshot==='object'?snapshot as Record<string,unknown>:{};
  const shot=metadata&&typeof metadata==='object'?metadata as Record<string,unknown>:{};
  const values=shot.resourceBindings??[],lines=shot.dialogueSegments??[];
  if(!Array.isArray(values)||values.length>32||!Array.isArray(lines)||lines.length>32)throw new Error('Use at most32 resource bindings and dialogue segments per shot.');
  const known=new Set(Array.isArray(plan.resources)?plan.resources.map((entry:unknown)=>String((entry as {resourceVersionId?:unknown})?.resourceVersionId)):[]);
  const bindings:ShotResourceBinding[]=[];const versions=new Map<string,{version:Doc<'projectResourceVersions'>;kind:string}>();
  const roles=new Set<string>();
  for(const value of values){
    if(!value||typeof value!=='object')throw new Error('Select explicit shot resources.');
    const entry=value as Record<string,unknown>;
    if(typeof entry.role!=='string'||!/^[A-Za-z][A-Za-z0-9_ -]{0,63}$/.test(entry.role)||roles.has(entry.role)||typeof entry.resourceVersionId!=='string'||!known.has(entry.resourceVersionId))throw new Error('Shot resources require distinct roles and approved bible versions.');
    const id=ctx.db.normalizeId('projectResourceVersions',entry.resourceVersionId);const version=id?await ctx.db.get(id):null;const resource=version?await ctx.db.get(version.resourceId):null;
    if(!version||!resource||version.projectId!==projectId||resource.projectId!==projectId||resource.archivedAt)throw new Error('Shot resource is unavailable in this project.');
    if(entry.voiceVersionId!==undefined&&entry.voiceVersionId!==null){const voiceId=typeof entry.voiceVersionId==='string'?ctx.db.normalizeId('voiceVersions',entry.voiceVersionId):null;const voice=voiceId?await ctx.db.get(voiceId):null;
      if(resource.kind!=='CHARACTER'||!voice||voice.projectId!==projectId||version.voiceVersionId!==voice._id||version.voiceId!==voice.voiceId)throw new Error('The selected character must use its exact immutable voice version.');}
    if(entry.characterResourceVersionId!==undefined&&entry.characterResourceVersionId!==null&&(typeof entry.characterResourceVersionId!=='string'||!['COSTUME','PROP'].includes(resource.kind)))throw new Error('Only costumes and props can bind to a character version.');
    roles.add(entry.role);versions.set(version._id,{version,kind:resource.kind});
    bindings.push({role:entry.role,resourceVersionId:version._id,...(entry.voiceVersionId?{voiceVersionId:String(entry.voiceVersionId)}:{}),...(entry.characterResourceVersionId?{characterResourceVersionId:String(entry.characterResourceVersionId)}:{})});
  }
  for(const binding of bindings){if(binding.characterResourceVersionId&&versions.get(binding.characterResourceVersionId)?.kind!=='CHARACTER')throw new Error('Select the matching character explicitly for this costume or prop.');}
  const dialogueSegments:ShotDialogueSegment[]=[];
  for(const raw of lines){
    const line=raw&&typeof raw==='object'?raw as Record<string,unknown>:{};
    const speaker=typeof line.speakerResourceVersionId==='string'?versions.get(line.speakerResourceVersionId):null;
    if(!speaker||speaker.kind!=='CHARACTER'||typeof line.voiceVersionId!=='string'||speaker.version.voiceVersionId!==line.voiceVersionId
      ||!Number.isFinite(line.startSeconds)||!Number.isFinite(line.durationSeconds)||Number(line.startSeconds)<0||Number(line.durationSeconds)<=0||Number(line.startSeconds)+Number(line.durationSeconds)>durationSeconds+0.000001
      ||typeof line.text!=='string'||!line.text.trim()||line.text.length>1000||line.delivery!==undefined&&(typeof line.delivery!=='string'||line.delivery.length>400))throw new Error('Dialogue requires a bound character voice, exact words, and timing inside the shot.');
    const bound=bindings.find(binding=>binding.resourceVersionId===line.speakerResourceVersionId);
    if(bound?.voiceVersionId!==line.voiceVersionId)throw new Error('Bind the same voice version to the dialogue speaker.');
    dialogueSegments.push({speakerResourceVersionId:String(line.speakerResourceVersionId),voiceVersionId:line.voiceVersionId,startSeconds:Number(line.startSeconds),durationSeconds:Number(line.durationSeconds),text:line.text,...(line.delivery?{delivery:String(line.delivery)}:{})});
  }
  return {resourceBindings:bindings,dialogueSegments};
}
