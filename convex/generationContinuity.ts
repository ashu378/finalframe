import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { object } from './generationWorkerContracts';

type ReadCtx = QueryCtx | MutationCtx;

/** Resolve explicit shot bindings against the approved immutable planning
 * snapshot. Unselected project resources are retained as context, never
 * silently sent as media references or substituted for missing assets. */
export async function resolveGenerationContinuity(ctx: ReadCtx, args: {
  projectId: Id<'projects'>;
  productionId: Id<'productions'>;
  snapshot: unknown;
  explicitResourceVersionIds?: unknown;
  referenceAssetIds: string[];
}) {
  const snapshot = object(args.snapshot);
  const rawResources = snapshot.resources;
  if (!Object.keys(snapshot).length) {
    if (Array.isArray(args.explicitResourceVersionIds) && args.explicitResourceVersionIds.length) throw new Error('Approve a production continuity snapshot before selecting resource versions.');
    return { planningContextSnapshot: null, selectedResourceVersionIds: [] as string[], voiceIds: [] as string[], referenceAssetIds: [...new Set(args.referenceAssetIds)], promptContext: null };
  }
  if (snapshot.projectId !== args.projectId || (snapshot.productionId && snapshot.productionId !== args.productionId) || !Array.isArray(rawResources) || rawResources.length > 100) throw new Error('Production continuity does not belong to this project.');
  const bibleId = typeof snapshot.continuityBibleId === 'string' ? ctx.db.normalizeId('continuityBibles', snapshot.continuityBibleId) : null;
  const bible = bibleId ? await ctx.db.get(bibleId) : null;
  if (!bible || bible.projectId !== args.projectId || bible.state !== 'APPROVED') throw new Error('An approved continuity bible is required.');
  const bibleState = await ctx.db.query('resourceStates').withIndex('by_project_resource', (q) => q.eq('projectId', args.projectId).eq('resourceType', 'continuityBible').eq('resourceId', bible._id)).unique();
  if (!bibleState || !['APPROVED', 'LOCKED'].includes(bibleState.state)) throw new Error('The continuity bible needs approval.');
  const resourceBindings = object(bible.snapshot).resourceBindings;
  const bound = new Set(Array.isArray(resourceBindings) ? resourceBindings.map((entry) => String(object(entry).resourceVersionId)) : []);
  const requested = args.explicitResourceVersionIds;
  if (requested !== undefined && (!Array.isArray(requested) || requested.length > 100 || requested.some((id) => typeof id !== 'string'))) throw new Error('Select valid resource versions for this shot.');
  const selectedIds = new Set<string>(Array.isArray(requested) ? requested as string[] : []);
  const initialAssetIds = new Set(args.referenceAssetIds);
  const selectedAssets = new Set(args.referenceAssetIds);
  const selectedResources: Record<string, unknown>[] = [];
  const selectedVoices = new Set<string>();
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
    }
    selectedIds.add(version._id);
    selectedResources.push({ resourceId: resource._id, resourceVersionId: version._id, kind: resource.kind, name: resource.name, profile: version.profile, assetIds: version.assetIds, voiceId: version.voiceId ?? null });
  }
  if ([...selectedIds].some((id) => !known.has(id))) throw new Error('Selected resources must be part of this production continuity snapshot.');
  if (selectedAssets.size > 50) throw new Error('Use at most 50 reference assets in one shot.');
  const bibleSnapshot = object(snapshot.bible);
  const promptContext = { rules: bibleSnapshot.rules ?? [], visualStyle: bibleSnapshot.visualStyle ?? '', acceptedPredecessorStory: snapshot.acceptedPredecessorStory ?? null, resources: selectedResources };
  if (JSON.stringify(promptContext).length > 12_000) throw new Error('Narrow this shot’s selected continuity resources before generating.');
  return { planningContextSnapshot: snapshot, selectedResourceVersionIds: [...selectedIds], voiceIds: [...selectedVoices], referenceAssetIds: [...selectedAssets], promptContext };
}
