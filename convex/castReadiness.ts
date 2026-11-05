import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { ConvexError } from 'convex/values';
import { proposedCast, castPlanShots } from '../src/lib/production/cast-requirements';
import { sha256Equal } from '../renderer/src/media/sha256';
export { proposedCast, castPlanShots };
const object = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
function fail(code = 'RECIPE_CAST_REFERENCES_REQUIRED'): never { throw new ConvexError({ code }); }
/** Called only after canonical caller authorization, and only for approval or
 * NEW video purchases. Never put this gate in read/poll/completion helpers. */
export async function requireCastReadiness(ctx: QueryCtx | MutationCtx, projectId: Id<'projects'>, plan: unknown, continuity: unknown) {
  let cast; try { cast = proposedCast(plan); } catch { fail(); }
  if (!cast.length) return;
  const context = object(continuity), known = new Map((Array.isArray(context.resources) ? context.resources : []).map((value: unknown) => { const row = object(value); return [String(row.resourceVersionId), row] as const; }));
  if (context.projectId !== projectId) fail();
  const used = new Set<string>(), versions = new Map<string, string>();
  const validated = new Set<string>();
  for (const shot of castPlanShots(plan)) {
    const metadata = object(shot.metadata), coverage = object(metadata.castCoverage), choices = coverage.castKeys;
    if (coverage.version !== 1 || !Array.isArray(choices) || choices.length > cast.length || new Set(choices).size !== choices.length || typeof coverage.noNamedCast !== 'boolean' || coverage.noNamedCast !== (choices.length === 0)) fail();
    const bindings = Array.isArray(metadata.resourceBindings) ? metadata.resourceBindings.map(object) : [];
    for (const key of choices) {
      if (typeof key !== 'string' || !cast.some(item => item.key === key)) fail();
      const matches = bindings.filter(binding => binding.role === key);
      if (matches.length !== 1 || typeof matches[0].resourceVersionId !== 'string') fail();
      const id = matches[0].resourceVersionId, saved = known.get(id);
      if (!saved || versions.has(key) && versions.get(key) !== id) fail();
      used.add(key); versions.set(key, id);
      if (validated.has(id)) continue;
      const versionId = ctx.db.normalizeId('projectResourceVersions', id), version = versionId ? await ctx.db.get(versionId) : null;
      const resource = version ? await ctx.db.get(version.resourceId) : null;
      if (!version || !resource || version.projectId !== projectId || resource.projectId !== projectId || resource.kind !== 'CHARACTER' || resource.archivedAt || saved.resourceId !== resource._id || JSON.stringify(saved.assetIds) !== JSON.stringify(version.assetIds)) fail('RECIPE_CAST_RESOURCE_UNAVAILABLE');
      const state = await ctx.db.query('resourceStates').withIndex('by_project_resource', q => q.eq('projectId', projectId).eq('resourceType', 'projectResourceVersion').eq('resourceId', id)).unique();
      if (!state || !['APPROVED', 'LOCKED'].includes(state.state)) fail('RECIPE_CAST_RESOURCE_UNAVAILABLE');
      let images = 0;
      if (version.assetIds.length > 12) fail('RECIPE_CAST_RESOURCE_UNAVAILABLE');
      for (const assetId of version.assetIds) {
        const asset = await ctx.db.get(assetId);
        if (!asset?.mimeType?.startsWith('image/')) continue;
        const stored = asset.storageId ? await ctx.db.system.get('_storage', asset.storageId) : null;
        const approval = await ctx.db.query('resourceStates').withIndex('by_project_resource', q => q.eq('projectId', projectId).eq('resourceType', 'asset').eq('resourceId', assetId)).unique();
        if (asset.projectId !== projectId || asset.scope !== 'PROJECT' || asset.deletedAt || !stored || stored.size < 1 || stored.contentType !== asset.mimeType || !sha256Equal(stored.sha256, asset.checksum) || !approval || !['APPROVED', 'LOCKED'].includes(approval.state)) fail('RECIPE_CAST_RESOURCE_UNAVAILABLE');
        if ([asset.rights, asset.provenance, asset.moderation].some(value => { const row = object(value); return row.approved === false || row.consent === false || ['DENIED','REJECTED','REVOKED','EXPIRED'].includes(String(row.status ?? row.state ?? '').toUpperCase()); })) fail('RECIPE_CAST_RESOURCE_UNAVAILABLE');
        images++;
      }
      if (!images) fail('RECIPE_CAST_RESOURCE_UNAVAILABLE');
      validated.add(id);
    }
    if (bindings.some(binding => /^cast_\d+$/.test(String(binding.role)) && !choices.includes(binding.role))) fail();
  }
  if (cast.some(item => !used.has(item.key))) fail();
}
