import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { proposedCast } from '../src/lib/production/cast-requirements';

const object = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};

/** Conservative input eligibility evidence, NOT face recognition or a guarantee
 * of provider acceptance. Only explicit approved human cast descriptions in a
 * REALISTIC production qualify. Never inspect filenames or classify every
 * CHARACTER as human. Objects, animals, stylized cast and unknowns stay unknown.
 * External project images have no verified same-account provider portrait grant;
 * ordinary consent/approval does not manufacture that provider authorization. */
export async function externalHumanPortraits(ctx: QueryCtx | MutationCtx, args: {
  productionVersionId: Id<'productionVersions'>; shotId: Id<'shots'>; referenceAssetIds: readonly string[];
}): Promise<string[]> {
  const version = await ctx.db.get(args.productionVersionId), shot = await ctx.db.get(args.shotId);
  if (!version || version.status !== 'APPROVED' || !shot || shot.productionVersionId !== version._id) return [];
  const production = await ctx.db.get(version.productionId);
  if (!production?.projectId || shot.projectId !== production.projectId) return [];
  const plan = version.sourcePlanId ? await ctx.db.get(version.sourcePlanId) : null;
  if (!plan || plan.productionId !== production._id || object(object(object(plan.input).creatorIntent).visualStyle).id !== 'REALISTIC') return [];
  const context = object(version.planningContextSnapshot);
  if (context.projectId !== production.projectId) return [];
  const resources = Array.isArray(context.resources) ? context.resources.map(object) : [];
  const bindings = object(shot.metadata).resourceBindings;
  if (!Array.isArray(bindings) || bindings.length > 32) return [];
  const result = new Set<string>();
  for (const cast of proposedCast(version.snapshot)) {
    for (const binding of bindings.map(object).filter(row => row.role === cast.key)) {
      const id = typeof binding.resourceVersionId === 'string' ? ctx.db.normalizeId('projectResourceVersions', binding.resourceVersionId) : null;
      const resourceVersion = id ? await ctx.db.get(id) : null;
      const resource = resourceVersion ? await ctx.db.get(resourceVersion.resourceId) : null;
      const saved = resources.find(row => row.resourceVersionId === id);
      if (!resourceVersion || !resource || !saved || resource.kind !== 'CHARACTER' || resource.archivedAt || resource.projectId !== production.projectId || resourceVersion.projectId !== production.projectId || saved.resourceId !== resource._id || JSON.stringify(saved.assetIds) !== JSON.stringify(resourceVersion.assetIds) || resourceVersion.assetIds.length > 12) continue;
      const descriptions = [cast.description, object(resourceVersion.profile).description].filter((value): value is string => typeof value === 'string');
      if (!descriptions.some(description => /^(?:an?\s+|one\s+)?(?:original\s+|fictional\s+|photorealistic\s+|realistic\s+)*(?:adult\s+(?:woman|man|person|female|male)|human\s+(?:woman|man|person|female|male))\b/i.test(description.trim()))) continue;
      const state = await ctx.db.query('resourceStates').withIndex('by_project_resource', q => q.eq('projectId', production.projectId!).eq('resourceType', 'projectResourceVersion').eq('resourceId', id!)).unique();
      if (!state || !['APPROVED', 'LOCKED'].includes(state.state)) continue;
      for (const assetId of resourceVersion.assetIds) {
        if (!args.referenceAssetIds.includes(assetId)) continue;
        const asset = await ctx.db.get(assetId);
        if (asset?.projectId === production.projectId && asset.scope === 'PROJECT' && !asset.deletedAt && asset.storageId && asset.mimeType?.startsWith('image/')) result.add(assetId);
      }
    }
  }
  return [...result].sort();
}
