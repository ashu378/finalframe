import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { requireProjectRole, resolveProjectAccessForActor, type AuthorizedProject, type AuthorizedProjectActor } from './authorization';
import { normalizeSha256, sha256Equal } from '../renderer/src/media/sha256';
import { recipeHash, stableRecipeJson } from '../src/lib/production/recipes/compiler';
import { canonicalShotDescriptor, logicalShotKey, snapshotLogicalShots } from '../src/lib/production/recipes/proposal';
import type { CanonicalRecipeAsset, RecipeBinding, RecipeContext, RecipeDocument } from '../src/lib/production/recipes/contract';
import { resolveGenerationContinuity } from './generationContinuity';
import { resolveVoiceSynthesisInput } from './voices';
export type RecipeReadCtx = MutationCtx | QueryCtx;
export const recipeEnabled = () => process.env.FINALFRAME_RECIPE_ENABLED === 'true';
export const recipeWorkerEnabled = () => process.env.FINALFRAME_RECIPE_WORKER_ENABLED === 'true';
export function requireRecipeEnabled() { if (!recipeEnabled()) throw new Error('RECIPE_DISABLED'); }
export const recipeObject = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
export function boundedRecipeJson(value: unknown, maxBytes: number) { const text = JSON.stringify(value); if (!text || new TextEncoder().encode(text).length > maxBytes) throw new Error('RECIPE_SIZE_LIMIT'); return JSON.parse(text); }
export function recipeKey(value: string) { if (!/^[A-Za-z0-9:._-]{8,200}$/.test(value)) throw new Error('RECIPE_REQUEST_KEY_INVALID'); return value; }
const denied = (value: unknown) => { const row = recipeObject(value); return row.approved === false || row.consent === false || ['REVOKED','DENIED','REJECTED','EXPIRED'].includes(String(row.status ?? row.state ?? '').toUpperCase()); };
export async function approvedRecipeResource(ctx: RecipeReadCtx, projectId: Id<'projects'>, resourceType: string, resourceId: string, locked = false) { const row = await ctx.db.query('resourceStates').withIndex('by_project_resource', q => q.eq('projectId', projectId).eq('resourceType', resourceType).eq('resourceId', resourceId)).unique(); if (!row || !(locked ? row.state === 'LOCKED' : ['APPROVED','LOCKED'].includes(row.state))) throw new Error('RECIPE_APPROVAL_REQUIRED'); return row; }
export async function recipeProductionScope(ctx: RecipeReadCtx, productionId: Id<'productions'>, actorId?: Id<'users'>) {
  const production = await ctx.db.get(productionId); if (!production?.projectId) throw new Error('RECIPE_PRODUCTION_UNAVAILABLE');
  const access: AuthorizedProject | AuthorizedProjectActor = actorId ? await resolveProjectAccessForActor(ctx, production.projectId, actorId, ['OWNER','EDITOR']) : await requireProjectRole(ctx, production.projectId, ['OWNER','EDITOR']);
  if (access.project.deletedAt || access.project.archivedAt || ['ARCHIVED','DELETED'].includes(String(access.project.status)) || access.project.moderationStatus === 'RESTRICTED' || production.studioExternalId !== access.project.studioExternalId) throw new Error('RECIPE_PROJECT_UNAVAILABLE');
  return { production, access };
}
export async function recipeRunScope(ctx: RecipeReadCtx, runId: Id<'recipeRuns'>) {
  const run = await ctx.db.get(runId); if (!run) throw new Error('RECIPE_RUN_UNAVAILABLE');
  const scope = await recipeProductionScope(ctx, run.productionId, run.reviewedByUserId ?? run.createdByUserId);
  const version = await ctx.db.get(run.productionVersionId);
  if (run.projectId !== scope.production.projectId || scope.production.currentVersionId !== run.productionVersionId || !version || version.productionId !== run.productionId || version.sourcePlanId !== run.sourcePlanId || version.status !== 'APPROVED' || await recipeHash(version.snapshot) !== run.directorSnapshotHash) throw new Error('RECIPE_APPROVED_VERSION_CHANGED');
  await materializedRecipeShots(ctx,version);
  return { run, version, ...scope };
}
export async function materializedRecipeShots(ctx: RecipeReadCtx, version: Doc<'productionVersions'>) {
  const frozen = await snapshotLogicalShots(version.snapshot); const sequences = await ctx.db.query('sequences').withIndex('by_version', q => q.eq('productionVersionId', version._id)).take(201); if (sequences.length > 200) throw new Error('RECIPE_GRAPH_LIMIT');
  const result = []; let count = 0;
  for (const sequence of sequences) {
    const scenes = await ctx.db.query('scenes').withIndex('by_sequence', q => q.eq('sequenceId', sequence._id)).take(201); if (scenes.length > 200) throw new Error('RECIPE_GRAPH_LIMIT');
    for (const scene of scenes) {
      const shots = await ctx.db.query('shots').withIndex('by_scene', q => q.eq('sceneId', scene._id)).take(201); if (shots.length > 200) throw new Error('RECIPE_GRAPH_LIMIT');
      for (const shot of shots) { if (['ARCHIVED','DELETED'].includes(String(shot.status))) continue; if (++count > 200 || shot.productionId !== version.productionId || shot.productionVersionId !== version._id || scene.productionVersionId !== version._id || sequence.productionVersionId !== version._id) throw new Error('RECIPE_SHOT_OWNERSHIP'); const key = logicalShotKey(sequence.orderIndex, scene.orderIndex, shot.orderIndex); const descriptorHash = await recipeHash(canonicalShotDescriptor(shot)); const proof = frozen.find(value => value.key === key); if (!proof || proof.descriptorHash !== descriptorHash) throw new Error('RECIPE_CANONICAL_SHOT_CHANGED'); result.push({ shotId: shot._id, sequenceOrderIndex: sequence.orderIndex, sceneOrderIndex: scene.orderIndex, shotOrderIndex: shot.orderIndex, descriptorHash }); }
    }
  }
  if(result.length!==frozen.length)throw new Error('RECIPE_CANONICAL_SHOT_CHANGED');
  return result;
}
export async function canonicalRecipeAsset(ctx: RecipeReadCtx, projectId: Id<'projects'>, assetId: Id<'assets'>) {
  const asset = await ctx.db.get(assetId); const storage = asset?.storageId ? await ctx.db.system.get('_storage', asset.storageId) : null;
  if (!asset || asset.projectId !== projectId || asset.scope !== 'PROJECT' || asset.deletedAt || !asset.storageId || !asset.checksum || !storage || storage.size < 1 || !normalizeSha256(storage.sha256) || !sha256Equal(asset.checksum, storage.sha256) || asset.mimeType !== storage.contentType || [asset.rights,asset.provenance,asset.moderation].some(denied)) throw new Error('RECIPE_ASSET_UNAVAILABLE');
  const state = await approvedRecipeResource(ctx, projectId, 'asset', assetId);
  let durationSeconds: number | undefined;
  if (asset.mimeType?.startsWith('audio/')) { const probe = await ctx.db.query('verifiedAudioProbes').withIndex('by_asset', q => q.eq('assetId', assetId)).unique(); if (probe && probe.projectId === projectId && probe.storageId === asset.storageId && sha256Equal(probe.checksum, storage.sha256) && probe.byteSize === storage.size && probe.durationMeasurement === 'DECODED_PCM_SAMPLES_V1' && probe.hasVideo === false) durationSeconds = probe.durationSeconds; }
  if (asset.mimeType?.startsWith('video/')) { const probe = await ctx.db.query('verifiedMediaProbes').withIndex('by_asset', q => q.eq('assetId', assetId)).unique(); if (probe && probe.projectId === projectId && probe.storageId === asset.storageId && sha256Equal(probe.checksum, storage.sha256) && probe.byteSize === storage.size && probe.videoCodec) durationSeconds = probe.durationSeconds; }
  const canonical: CanonicalRecipeAsset = { id: asset._id, projectId, storageId: asset.storageId, checksum: normalizeSha256(storage.sha256)!, byteSize: storage.size, mimeType: asset.mimeType!, state: state.state as 'APPROVED'|'LOCKED', rightsApproved: true, ...(Number.isFinite(durationSeconds) && durationSeconds! > 0 ? { durationSeconds } : {}) };
  return { asset, storage, canonical, rawProof: { assetId, storageId: asset.storageId, assetChecksum: asset.checksum, storageChecksum: storage.sha256, byteSize: storage.size } };
}
export async function canonicalRecipeContext(ctx: RecipeReadCtx, recipe: RecipeDocument, version: Doc<'productionVersions'>): Promise<RecipeContext & { rawSourceBindings: unknown[] }> {
  const production = await ctx.db.get(version.productionId);
  if (!production?.projectId || recipe.binding.projectId !== production.projectId || recipe.binding.productionId !== production._id || recipe.binding.productionVersionId !== version._id || recipe.binding.snapshotHash !== await recipeHash(version.snapshot) || version.status !== 'APPROVED') throw new Error('RECIPE_BINDING_INVALID');
  const expectedBible = recipeObject(version.planningContextSnapshot).continuityBibleId;
  if ((recipe.binding.continuityBibleId ?? null) !== (expectedBible ?? null)) throw new Error('RECIPE_CONTINUITY_CHANGED');
  if (expectedBible) { if (recipe.binding.continuityHash !== await recipeHash(version.planningContextSnapshot)) throw new Error('RECIPE_CONTINUITY_CHANGED'); await approvedRecipeResource(ctx, production.projectId, 'continuityBible', expectedBible); }
  const assets = new Map<string, CanonicalRecipeAsset>(); const raw = new Map<string, unknown>(); const shots: RecipeContext['shots'] = []; const voices: RecipeContext['voices'] = [];
  let metadataBytes=0;
  const addAsset = async (value: string) => { if (assets.has(value)) return; const id = ctx.db.normalizeId('assets', value); if (!id || assets.size >= 200) throw new Error('RECIPE_ASSET_LIMIT'); const found = await canonicalRecipeAsset(ctx, production.projectId!, id); metadataBytes+=new TextEncoder().encode(JSON.stringify(found.asset)).length;if(metadataBytes>4*1024*1024)throw new Error('RECIPE_ASSET_METADATA_LIMIT');assets.set(value, found.canonical); raw.set(value, found.rawProof); };
  for (const step of recipe.steps) {
    if ('sourceAssetId' in step && step.sourceAssetId) await addAsset(step.sourceAssetId);
    if (step.operation === 'GRAPHIC' && step.logoAssetId) await addAsset(step.logoAssetId);
    if (step.operation === 'NARRATION' && step.mode === 'GENERATE') {
      const voiceId = ctx.db.normalizeId('voices', step.voiceId); if (!voiceId) throw new Error('RECIPE_VOICE_UNAVAILABLE');
      const primary = step.primaryVoiceSampleAssetId ? ctx.db.normalizeId('assets', step.primaryVoiceSampleAssetId) : undefined;
      const resolved = await resolveVoiceSynthesisInput(ctx, { projectId: production.projectId, voiceId, use:'SYNTHESIZE', primaryVoiceSampleAssetId: primary ?? undefined }); const voice = await ctx.db.get(voiceId); if (!voice) throw new Error('RECIPE_VOICE_UNAVAILABLE');
      if (!voices.some(value => value.id === voiceId)) voices.push({ id: voiceId, projectId: production.projectId, kind: voice.kind, approved: true, consentCurrent: resolved.mode === 'REFERENCE_CLONE' ? !!resolved.consentId : false, sampleAssetIds: voice.sampleAssetIds });
      if (step.primaryVoiceSampleAssetId) await addAsset(step.primaryVoiceSampleAssetId);
    }
    if (step.operation === 'GENERATION') {
      const id = ctx.db.normalizeId('shots', step.shotId); const shot = id ? await ctx.db.get(id) : null;
      if (!shot || shot.productionId !== production._id || shot.productionVersionId !== version._id || shot.projectId !== production.projectId) throw new Error('RECIPE_SHOT_UNAVAILABLE');
      const metadata = recipeObject(shot.metadata); const slots = metadata.recipeReferenceSlots ?? [];
      if (!Array.isArray(slots) || slots.length > 12 || slots.some(value => typeof value !== 'string')) throw new Error('RECIPE_REFERENCE_SLOTS_INVALID');
      const continuity = await resolveGenerationContinuity(ctx, { projectId: production.projectId, productionId: production._id, snapshot: version.planningContextSnapshot, explicitResourceVersionIds: metadata.resourceVersionIds, referenceAssetIds: shot.requiredAssetIds ?? [] });
      for (const assetId of continuity.referenceAssetIds) await addAsset(assetId);
      if (!shots.some(value => value.id === shot._id)) shots.push({ id: shot._id, productionVersionId: version._id, prompt: shot.prompt, durationFrames: Math.round(shot.durationSeconds * recipe.fps), referenceAssetIds: continuity.referenceAssetIds, approvedRecipeReferenceSlots: slots });
    }
  }
  const context = { binding: recipe.binding, fps: recipe.fps, productionVersionState: 'APPROVED' as const, continuityApproved: true, assets: [...assets.values()], shots, voices, quotes: {}, rawSourceBindings: [...raw.values()] };
  return boundedRecipeJson(context, 512 * 1024);
}
export async function assertRecipeSourcesCurrent(ctx: RecipeReadCtx, run: Doc<'recipeRuns'>) {
  const context = recipeObject(run.canonicalContext); const proofs = context.rawSourceBindings;
  if (!Array.isArray(proofs) || proofs.length > 200) throw new Error('RECIPE_SOURCE_PROOF_MISSING');
  let metadataBytes=0;for (const value of proofs) { const proof = recipeObject(value); const found = await canonicalRecipeAsset(ctx, run.projectId, proof.assetId); metadataBytes+=new TextEncoder().encode(JSON.stringify(found.asset)).length;if(metadataBytes>4*1024*1024)throw new Error('RECIPE_ASSET_METADATA_LIMIT');if (found.asset.storageId !== proof.storageId || found.asset.checksum !== proof.assetChecksum || !sha256Equal(found.storage.sha256, proof.storageChecksum) || found.storage.size !== proof.byteSize) throw new Error('RECIPE_SOURCE_CHANGED'); }
  if (stableRecipeJson(recipeObject(context.binding)) !== stableRecipeJson(recipeObject(run.boundRecipe).binding)) throw new Error('RECIPE_CONTEXT_CHANGED');
}
