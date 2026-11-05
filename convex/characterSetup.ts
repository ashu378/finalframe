import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { requireProjectRole } from './authorization';
import { requireApprovedResource } from './resourceStates';
import { createProjectResource, createContinuityBible } from './continuity';
import { boundedText, validateBibleBindings } from './continuityContracts';
import { freezeVoiceVersion, resolveVoiceSynthesisInput } from './voices';
import { normalizeSha256, sha256Equal } from '../renderer/src/media/sha256';

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const stable = (value: unknown): string => JSON.stringify(value, (_key, row) => row && typeof row === 'object' && !Array.isArray(row) ? Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))) : row);
const denied = (value: unknown) => { const row = record(value); return row.approved === false || row.consent === false || ['DENIED', 'REJECTED', 'REVOKED', 'EXPIRED', 'BLOCKED', 'RESTRICTED', 'QUARANTINED'].includes(String(typeof value === 'string' ? value : row.status ?? row.state ?? '').toUpperCase()); };
function requestKey(projectId: string, key: string) { if (key.trim().length < 8 || key.trim().length > 120) throw new Error('CHARACTER_SETUP_REQUEST_INVALID'); return `character-setup:${projectId}:${key.trim()}`; }
async function context(ctx: MutationCtx | QueryCtx, projectId: Id<'projects'>, productionId: Id<'productions'>) {
  const access = await requireProjectRole(ctx, projectId, ['OWNER', 'EDITOR']);
  const production = await ctx.db.get(productionId);
  if (!production || production.projectId !== projectId || access.project.deletedAt || access.project.archivedAt || access.project.moderationStatus === 'RESTRICTED') throw new Error('CHARACTER_SETUP_PROJECT_UNAVAILABLE');
  return { ...access, production };
}
async function approvedAsset(ctx: MutationCtx, projectId: Id<'projects'>, assetId: Id<'assets'>, imageOnly = false) {
  const asset = await ctx.db.get(assetId), stored = asset?.storageId ? await ctx.db.system.get('_storage', asset.storageId) : null;
  if (!asset || asset.projectId !== projectId || asset.scope !== 'PROJECT' || asset.deletedAt || !stored || stored.size < 1 || !normalizeSha256(stored.sha256) || !sha256Equal(asset.checksum, stored.sha256) || asset.mimeType !== stored.contentType || imageOnly && !['image/png', 'image/jpeg', 'image/webp'].includes(asset.mimeType ?? '') || [asset.rights, asset.provenance, asset.moderation].some(denied)) throw new Error('CHARACTER_SETUP_REFERENCE_UNAVAILABLE');
  await requireApprovedResource(ctx, projectId, 'asset', assetId);
  return asset;
}
async function checkedVoice(ctx: MutationCtx, projectId: Id<'projects'>, voiceId?: Id<'voices'>, voiceVersionId?: Id<'voiceVersions'>) {
  if (!voiceId) { if (voiceVersionId) throw new Error('CHARACTER_SETUP_VOICE_UNAVAILABLE'); return null; }
  await requireApprovedResource(ctx, projectId, 'voice', voiceId);
  const voice = await ctx.db.get(voiceId);
  if (!voice || voice.projectId !== projectId || voice.status !== 'READY') throw new Error('CHARACTER_SETUP_VOICE_UNAVAILABLE');
  const resolved = await resolveVoiceSynthesisInput(ctx, { projectId, voiceId, ...(voiceVersionId ? { voiceVersionId } : {}), use: 'SYNTHESIZE' });
  for (const sample of resolved.voiceConfigSnapshot.sampleProofs) await approvedAsset(ctx, projectId, sample.assetId);
  return resolved;
}
const created = v.object({ resourceId: v.id('projectResources'), resourceVersionId: v.id('projectResourceVersions'), voiceVersionId: v.union(v.id('voiceVersions'), v.null()), replayed: v.boolean() });

/** One explicit click, one stable project character. Canonical resource creation
 * stays shared with the professional editor; no approval transition is run. */
export const create = mutation({
  args: { projectId: v.id('projects'), productionId: v.id('productions'), name: v.string(), description: v.string(), imageAssetId: v.id('assets'), voiceId: v.optional(v.id('voices')), voiceVersionId: v.optional(v.id('voiceVersions')), idempotencyKey: v.string() },
  returns: created,
  handler: async (ctx, args) => {
    const access = await context(ctx, args.projectId, args.productionId);
    const name = boundedText(args.name, 'Character name', 160), description = boundedText(args.description, 'Character description', 10000);
    await approvedAsset(ctx, args.projectId, args.imageAssetId, true);
    const key = requestKey(args.projectId, args.idempotencyKey);
    const input = { name, description, imageAssetId: args.imageAssetId, voiceId: args.voiceId ?? null, voiceVersionId: args.voiceVersionId ?? null };
    const previous = await ctx.db.query('productionOperations').withIndex('by_idempotency', q => q.eq('idempotencyKey', key)).unique();
    if (previous) {
      if (previous.kind !== 'GUIDED_CHARACTER_CREATE' || previous.productionId !== args.productionId || previous.actorUserId !== access.user._id || stable(previous.input) !== stable(input)) throw new Error('CHARACTER_SETUP_REQUEST_CHANGED');
      const resourceId = ctx.db.normalizeId('projectResources', previous.outputResourceIds[0]), versionId = ctx.db.normalizeId('projectResourceVersions', previous.outputResourceIds[1]);
      const resource = resourceId ? await ctx.db.get(resourceId) : null, version = versionId ? await ctx.db.get(versionId) : null;
      if (!resource || resource.projectId !== args.projectId || resource.archivedAt || !version || version.projectId !== args.projectId || version.resourceId !== resource._id || version.assetIds.length !== 1 || version.assetIds[0] !== args.imageAssetId) throw new Error('CHARACTER_SETUP_REQUEST_CHANGED');
      await checkedVoice(ctx, args.projectId, version.voiceId, version.voiceVersionId);
      return { resourceId: resource._id, resourceVersionId: version._id, voiceVersionId: version.voiceVersionId ?? null, replayed: true };
    }
    const voice = await checkedVoice(ctx, args.projectId, args.voiceId, args.voiceVersionId);
    const voiceVersionId = voice ? await freezeVoiceVersion(ctx, voice, access.user._id) : undefined;
    const saved = await createProjectResource(ctx, { projectId: args.projectId, kind: 'CHARACTER', name, profile: { description }, assetIds: [args.imageAssetId], ...(args.voiceId ? { voiceId: args.voiceId, voiceVersionId } : {}) });
    const timestamp = Date.now();
    await ctx.db.insert('productionOperations', { productionId: args.productionId, studioExternalId: access.project.studioExternalId, ...(access.project.studioId ? { studioId: access.project.studioId } : {}), kind: 'GUIDED_CHARACTER_CREATE', targetType: 'projectResourceVersion', targetId: saved.resourceVersionId, input, idempotencyKey: key, status: 'COMPLETED', actorUserId: access.user._id, outputResourceIds: [saved.resourceId, saved.resourceVersionId], createdAt: timestamp, updatedAt: timestamp, completedAt: timestamp });
    return { resourceId: saved.resourceId, resourceVersionId: saved.resourceVersionId, voiceVersionId: voiceVersionId ?? null, replayed: false };
  },
});

/** Explicitly create another draft snapshot. Prior approved bibles are read-only
 * sources, never patched, and every retained reference is checked again. */
export const createBible = mutation({
  args: { projectId: v.id('projects'), productionId: v.id('productions'), characterVersionId: v.id('projectResourceVersions'), sourceBibleId: v.optional(v.id('continuityBibles')), rules: v.array(v.string()), story: v.string(), visualStyle: v.string(), idempotencyKey: v.string() },
  returns: v.object({ bibleId: v.id('continuityBibles'), versionNumber: v.number() }),
  handler: async (ctx, args) => {
    await context(ctx, args.projectId, args.productionId);
    const version = await ctx.db.get(args.characterVersionId), resource = version ? await ctx.db.get(version.resourceId) : null;
    if (!version || version.projectId !== args.projectId || !resource || resource.projectId !== args.projectId || resource.kind !== 'CHARACTER' || resource.archivedAt) throw new Error('CHARACTER_SETUP_CHARACTER_UNAVAILABLE');
    await requireApprovedResource(ctx, args.projectId, 'projectResourceVersion', version._id);
    let source: { resourceBindings: Array<{ resourceId: Id<'projectResources'>; resourceVersionId: Id<'projectResourceVersions'> }>; rules: string[]; story: string; visualStyle: string } = { resourceBindings: [], rules: [], story: '', visualStyle: '' };
    if (args.sourceBibleId) {
      const bible = await ctx.db.get(args.sourceBibleId);
      if (!bible || bible.projectId !== args.projectId || bible.state !== 'APPROVED') throw new Error('CHARACTER_SETUP_BIBLE_UNAVAILABLE');
      await requireApprovedResource(ctx, args.projectId, 'continuityBible', bible._id);
      source = bible.snapshot as typeof source;
    }
    if (args.rules.length > 100 || args.rules.some(rule => !rule.trim() || rule.length > 2000) || args.story.length > 10000 || args.visualStyle.length > 10000) throw new Error('CHARACTER_SETUP_BIBLE_TOO_LARGE');
    const snapshot = { resourceBindings: [...source.resourceBindings.filter(binding => binding.resourceId !== resource._id), { resourceId: resource._id, resourceVersionId: version._id }], rules: [...new Set([...source.rules, ...args.rules.map(rule => rule.trim())])], story: args.story.trim() || source.story, visualStyle: args.visualStyle.trim() || source.visualStyle };
    await validateBibleBindings(ctx, args.projectId, snapshot, true);
    for (const binding of snapshot.resourceBindings) {
      const bound = await ctx.db.get(binding.resourceVersionId);
      if (!bound) throw new Error('CHARACTER_SETUP_CHARACTER_UNAVAILABLE');
      for (const id of bound.assetIds) await approvedAsset(ctx, args.projectId, id);
      if (bound.voiceId && !bound.voiceVersionId) throw new Error('CHARACTER_SETUP_VOICE_UNAVAILABLE');
      await checkedVoice(ctx, args.projectId, bound.voiceId, bound.voiceVersionId);
    }
    return createContinuityBible(ctx, { projectId: args.projectId, ...(args.sourceBibleId ? { sourceBibleId: args.sourceBibleId } : {}), snapshot, idempotencyKey: requestKey(args.projectId, args.idempotencyKey) });
  },
});

/** Suggestions are scoped proposals, never project identities or approved media. */
export const suggestions = query({
  args:{projectId:v.id('projects'),productionId:v.id('productions')},
  returns:v.array(v.object({name:v.string(),description:v.string()})),
  handler:async(ctx,args)=>{
    const access=await context(ctx,args.projectId,args.productionId);
    const plan=access.production.currentPlanId?await ctx.db.get(access.production.currentPlanId):null;
    if(!plan||plan.productionId!==access.production._id)return [];
    const characters=record(record(plan.plan).bible).characters;
    return (Array.isArray(characters)?characters.slice(0,8):[]).flatMap(value=>{const row=record(value);return typeof row.name==='string'&&row.name.trim()?[{name:row.name.trim().slice(0,160),description:typeof row.description==='string'?row.description.slice(0,1000):''}]:[];});
  }
});
