import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { object } from './generationWorkerContracts';
import {validateShotBindings} from './continuityContracts';
import {currentMemorySource} from './projectMemory';

type ReadCtx = QueryCtx | MutationCtx;

/** Resolve explicit shot bindings against the approved immutable planning
 * snapshot. Unselected project resources are retained as context, never
 * silently sent as media references or substituted for missing assets. */
export async function resolveGenerationContinuity(ctx: ReadCtx, args: {
  projectId: Id<'projects'>;
  productionId?: Id<'productions'>;
  snapshot: unknown;
  explicitResourceVersionIds?: unknown;
  referenceAssetIds: string[];
  shotMetadata?:unknown;
  durationSeconds?:number;
}) {
  const snapshot = object(args.snapshot);
  const rawResources = snapshot.resources;
  if (!Object.keys(snapshot).length) {
    if (Array.isArray(args.explicitResourceVersionIds) && args.explicitResourceVersionIds.length) throw new Error('Approve a production continuity snapshot before selecting resource versions.');
    const metadata=object(args.shotMetadata);
    if((Array.isArray(metadata.resourceBindings)&&metadata.resourceBindings.length)||(Array.isArray(metadata.dialogueSegments)&&metadata.dialogueSegments.length))throw new Error('Approve project continuity before binding characters and dialogue.');
    return { planningContextSnapshot: null, selectedResourceVersionIds: [] as string[], voiceIds: [] as string[], voiceVersionIds:[] as string[],resourceBindings:[],dialogueSegments:[],referenceAssetIds: [...new Set(args.referenceAssetIds)], promptContext: null };
  }
  if (snapshot.projectId !== args.projectId || (snapshot.productionId && snapshot.productionId !== args.productionId) || !Array.isArray(rawResources) || rawResources.length > 100) throw new Error('Production continuity does not belong to this project.');
  const bibleId = typeof snapshot.continuityBibleId === 'string' ? ctx.db.normalizeId('continuityBibles', snapshot.continuityBibleId) : null;
  const bible = bibleId ? await ctx.db.get(bibleId) : null;
  if (!bible || bible.projectId !== args.projectId || bible.state !== 'APPROVED') throw new Error('An approved continuity bible is required.');
  const bibleState = await ctx.db.query('resourceStates').withIndex('by_project_resource', (q) => q.eq('projectId', args.projectId).eq('resourceType', 'continuityBible').eq('resourceId', bible._id)).unique();
  if (!bibleState || !['APPROVED', 'LOCKED'].includes(bibleState.state)) throw new Error('The continuity bible needs approval.');
  const resourceBindings = object(bible.snapshot).resourceBindings;
  const bound = new Set(Array.isArray(resourceBindings) ? resourceBindings.map((entry) => String(object(entry).resourceVersionId)) : []);
  const structured = await validateShotBindings(ctx,args.projectId,snapshot,args.shotMetadata,args.durationSeconds??60);
  const requested = args.explicitResourceVersionIds;
  if (requested !== undefined && (!Array.isArray(requested) || requested.length > 100 || requested.some((id) => typeof id !== 'string'))) throw new Error('Select valid resource versions for this shot.');
  if(Array.isArray(requested)&&structured.resourceBindings.some(binding=>!requested.includes(binding.resourceVersionId)))throw new Error('Update the shot’s character, costume and dialogue assignments before removing their selected resource versions.');
  const selectedIds = new Set<string>([...(Array.isArray(requested) ? requested as string[] : []),...structured.resourceBindings.map(binding=>binding.resourceVersionId)]);
  const initialAssetIds = new Set(args.referenceAssetIds);
  const selectedAssets = new Set(args.referenceAssetIds);
  const selectedResources: Record<string, unknown>[] = [];
  const selectedVoices = new Set<string>();
  const selectedVoiceVersions=new Set<string>();
  const known = new Set<string>();
  for (const raw of rawResources) {
    const resourceSnapshot = object(raw);
    const resourceId = typeof resourceSnapshot.resourceId === 'string' ? ctx.db.normalizeId('projectResources', resourceSnapshot.resourceId) : null;
    const versionId = typeof resourceSnapshot.resourceVersionId === 'string' ? ctx.db.normalizeId('projectResourceVersions', resourceSnapshot.resourceVersionId) : null;
    const resource = resourceId ? await ctx.db.get(resourceId) : null;
    const version = versionId ? await ctx.db.get(versionId) : null;
    if (!resource || !version || resource.projectId !== args.projectId || version.projectId !== args.projectId || version.resourceId !== resource._id || !bound.has(version._id)) throw new Error('A continuity resource is not owned by this project.');
    known.add(version._id);
    const selected = selectedIds.has(version._id) || version.assetIds.some((assetId) => initialAssetIds.has(assetId));
    if (!selected) continue;
    if (resource.archivedAt) throw new Error('A selected continuity resource is archived.');
    const state = await ctx.db.query('resourceStates').withIndex('by_project_resource', (q) => q.eq('projectId', args.projectId).eq('resourceType', 'projectResourceVersion').eq('resourceId', version._id)).unique();
    if (!state || !['APPROVED', 'LOCKED'].includes(state.state)) throw new Error('Approve selected resource versions before generating.');
    if (JSON.stringify(resourceSnapshot.profile) !== JSON.stringify(version.profile) || JSON.stringify(resourceSnapshot.assetIds) !== JSON.stringify(version.assetIds) || object(resourceSnapshot.voice).voiceId !== version.voiceId) throw new Error('A selected continuity binding no longer matches its approved snapshot.');
    for (const assetId of version.assetIds) {
      const asset = await ctx.db.get(assetId);
      if (!asset || asset.projectId !== args.projectId || asset.scope !== 'PROJECT' || asset.deletedAt || !asset.storageId) throw new Error('Import every continuity reference into this project before generating.');
      selectedAssets.add(asset._id);
    }
    if (version.voiceId) {
      const voice = await ctx.db.get(version.voiceId);
      if (!voice || voice.projectId !== args.projectId || voice.deletedAt || voice.revokedAt || voice.status === 'REVOKED') throw new Error('A selected voice is unavailable in this project.');
      selectedVoices.add(voice._id);
      if(version.voiceVersionId){const frozen=await ctx.db.get(version.voiceVersionId);
        if(!frozen||frozen.projectId!==args.projectId||frozen.voiceId!==voice._id||object(resourceSnapshot.voice).voiceVersionId!==frozen._id)throw new Error('A selected character voice version changed.');
        selectedVoiceVersions.add(frozen._id);
      }
    }
    selectedIds.add(version._id);
    selectedResources.push({ resourceId: resource._id, resourceVersionId: version._id, kind: resource.kind, name: resource.name, profile: version.profile, assetIds: version.assetIds, voiceId: version.voiceId ?? null,voiceVersionId:version.voiceVersionId??null });
  }
  if ([...selectedIds].some((id) => !known.has(id))) throw new Error('Selected resources must be part of this production continuity snapshot.');
  if (selectedAssets.size > 50) throw new Error('Use at most 50 reference assets in one shot.');
  const bibleSnapshot = object(snapshot.bible);
  const memory=object(snapshot.approvedEpisodeMemory);const facts=Array.isArray(memory.facts)?memory.facts:[];
  if(facts.length>24)throw new Error('Project memory exceeds the bounded planning contract.');
  for(const raw of facts){const fact=object(raw);const stateId=typeof fact.storyStateId==='string'?ctx.db.normalizeId('episodeStoryStates',fact.storyStateId):null;const source=stateId?await currentMemorySource(ctx,args.projectId,stateId):null;
    if(!source||source.sourceHash!==fact.sourceHash||source.episode._id!==fact.episodeId||source.state.productionVersionId!==fact.productionVersionId||source.state.timelineId!==fact.timelineId)throw new Error('Approved project memory changed. Review a new plan.');}
  const promptContext = { rules: bibleSnapshot.rules ?? [], visualStyle: bibleSnapshot.visualStyle ?? '', acceptedPredecessorStory: snapshot.acceptedPredecessorStory ?? null, approvedEpisodeMemory:facts, resources: selectedResources,...structured };
  if (JSON.stringify(promptContext).length > 32_000) throw new Error('Narrow this shot’s selected continuity resources before generating.');
  return { planningContextSnapshot: snapshot, selectedResourceVersionIds: [...selectedIds], voiceIds: [...selectedVoices],voiceVersionIds:[...selectedVoiceVersions], referenceAssetIds: [...selectedAssets], promptContext,...structured };
}
