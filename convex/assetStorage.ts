import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireCurrentMember, requireMember, requireProjectAccess, requireProjectRole } from './authorization';
import { getProduction, now } from './_shared';

const MEDIA_RESOLUTION_TTL_SECONDS = 300;

const assetScope = v.union(v.literal('GLOBAL'), v.literal('PROJECT'));

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function requireUploadContext(ctx: MutationCtx, studioExternalId?: string, projectId?: Id<'projects'>) {
  const member = await requireCurrentMember(ctx);
  if (studioExternalId && studioExternalId !== member.studio.externalId) throw new Error('Studio context does not match the authenticated workspace.');
  const project = projectId
    ? (await requireProjectRole(ctx, projectId, ['OWNER', 'EDITOR'])).project
    : null;
  if (project && project.studioExternalId !== member.studio.externalId) throw new Error('Project does not belong to the authenticated workspace.');
  return { member, project };
}

async function requireAssetAccess(ctx: QueryCtx | MutationCtx, asset: { studioExternalId: string; projectId?: Id<'projects'> }) {
  if (asset.projectId) return await requireProjectAccess(ctx, asset.projectId);
  return { member: await requireMember(ctx, asset.studioExternalId) };
}

async function productionProject(ctx: MutationCtx, productionId: Id<'productions'>, projectId?: Id<'projects'>) {
  const production = await getProduction(ctx, productionId);
  if (!production.projectId) throw new Error('Production is not attached to a project.');
  if (projectId && production.projectId !== projectId) throw new Error('Production and project do not match.');
  const access = await requireProjectRole(ctx, production.projectId, ['OWNER', 'EDITOR']);
  if (production.studioExternalId !== access.project.studioExternalId) throw new Error('Production does not belong to the project workspace.');
  return { production, access };
}

async function projectAssetCopy(
  ctx: MutationCtx,
  sourceAssetId: Id<'assets'>,
  projectId: Id<'projects'>,
  productionId: Id<'productions'> | undefined,
  copyMode: 'IMPORT' | 'DUPLICATE',
) {
  const access = await requireProjectRole(ctx, projectId, ['OWNER', 'EDITOR']);
  const source = await ctx.db.get(sourceAssetId);
  if (!source || source.studioExternalId !== access.project.studioExternalId || source.deletedAt) throw new Error('Source asset not found.');
  if (source.projectId && source.projectId !== projectId) throw new Error('Only global assets or assets in this project may be copied.');
  if (productionId) await productionProject(ctx, productionId, projectId);
  const timestamp = now();
  const sourceMetadata = record(source.metadata);
  const assetId = await ctx.db.insert('assets', {
    studioExternalId: access.project.studioExternalId,
    studioId: access.project.studioId,
    scope: 'PROJECT',
    projectId: access.project._id,
    originAssetId: source._id,
    importedByUserId: access.user._id,
    importedAt: timestamp,
    productionId,
    source: source.source,
    roles: source.roles,
    name: source.name,
    mimeType: source.mimeType,
    byteSize: source.byteSize,
    storageId: source.storageId,
    checksum: source.checksum,
    provenance: { ...record(source.provenance), importedFromAssetId: source._id.toString(), importMode: copyMode },
    rights: source.rights,
    metadata: { ...sourceMetadata, importedFromAssetId: source._id.toString(), importMode: copyMode },
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  return await ctx.db.get(assetId);
}

/** Issue an upload URL for a global asset or a project-owned asset. */
export const generateUploadUrl = mutation({
  args: {
    studioExternalId: v.optional(v.string()),
    projectId: v.optional(v.id('projects')),
  },
  handler: async (ctx, args) => {
    await requireUploadContext(ctx, args.studioExternalId, args.projectId);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Bind an uploaded storage object to the canonical project asset record. */
export const ingestAsset = mutation({
  args: {
    studioExternalId: v.string(),
    scope: v.optional(assetScope),
    projectId: v.optional(v.id('projects')),
    productionId: v.optional(v.id('productions')),
    originAssetId: v.optional(v.id('assets')),
    externalId: v.optional(v.string()),
    storageId: v.id('_storage'),
    source: v.string(),
    roles: v.array(v.string()),
    name: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    checksum: v.optional(v.string()),
    metadata: v.any(),
    provenance: v.optional(v.any()),
    rights: v.optional(v.any()),
    consent: v.optional(v.any()),
    lineage: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const member = await requireCurrentMember(ctx);
    if (args.studioExternalId !== member.studio.externalId) throw new Error('Studio context does not match the authenticated workspace.');
    const scope = args.scope ?? (args.projectId || args.productionId ? 'PROJECT' : 'GLOBAL');
    let projectId = args.projectId;
    if (args.productionId) {
      const production = await productionProject(ctx, args.productionId, projectId);
      projectId = production.production.projectId;
    }
    if (scope === 'PROJECT') {
      if (!projectId) throw new Error('Project-owned assets require a projectId.');
      await requireProjectRole(ctx, projectId, ['OWNER', 'EDITOR']);
    } else if (projectId || args.productionId) {
      throw new Error('Global assets cannot be attached to a project or production.');
    }
    if (args.originAssetId) {
      const origin = await ctx.db.get(args.originAssetId);
      if (!origin || origin.studioExternalId !== member.studio.externalId) throw new Error('Origin asset not found.');
      if (origin.projectId && origin.projectId !== projectId) throw new Error('Origin asset belongs to a different project.');
      if (scope === 'GLOBAL' && origin.projectId) throw new Error('Global assets cannot inherit from a project asset.');
    }

    const storageMetadata = await ctx.db.system.get('_storage', args.storageId);
    if (!storageMetadata) throw new Error('Uploaded storage object not found.');

    if (args.externalId) {
      const existing = await ctx.db.query('assets').withIndex('by_external_id', (q) => q.eq('externalId', args.externalId)).unique();
      if (existing) {
        if (existing.studioExternalId !== args.studioExternalId || existing.projectId?.toString() !== projectId?.toString()) throw new Error('Asset external ID is already in use.');
        return { assetId: existing._id, storageId: existing.storageId, kind: record(existing.metadata).kind, mimeType: existing.mimeType, checksum: existing.checksum };
      }
    }

    const metadata = {
      ...record(args.metadata),
      contractVersion: 'media-asset.v1',
      storage: { sizeBytes: storageMetadata.size, contentType: storageMetadata.contentType },
      consent: args.consent,
      lineage: args.lineage,
    };
    const assetId = await ctx.db.insert('assets', {
      studioExternalId: args.studioExternalId,
      studioId: member.studio._id,
      scope,
      projectId,
      originAssetId: args.originAssetId,
      importedByUserId: args.originAssetId ? member.user._id : undefined,
      importedAt: args.originAssetId ? now() : undefined,
      productionId: args.productionId,
      externalId: args.externalId,
      source: args.source,
      roles: args.roles,
      name: args.name,
      mimeType: args.mimeType || storageMetadata.contentType || undefined,
      byteSize: storageMetadata.size,
      storageId: args.storageId,
      checksum: args.checksum || storageMetadata.sha256,
      provenance: args.provenance,
      rights: args.rights,
      metadata,
      createdAt: now(),
      updatedAt: now(),
    });

    return { assetId, storageId: args.storageId, kind: record(metadata).kind, mimeType: args.mimeType || storageMetadata.contentType || undefined, checksum: args.checksum || storageMetadata.sha256 };
  },
});

export const listGlobalAssets = query({
  args: {},
  handler: async (ctx) => {
    const member = await requireCurrentMember(ctx);
    const assets = await ctx.db.query('assets').withIndex('by_studio', (q) => q.eq('studioExternalId', member.studio.externalId)).order('desc').collect();
    return await Promise.all(assets.filter((asset) => !asset.deletedAt && asset.scope !== 'PROJECT' && !asset.projectId).map(async (asset) => ({
      ...asset,
      storageUrl: asset.storageId ? await ctx.storage.getUrl(asset.storageId) : undefined,
    })));
  },
});

export const listProjectAssets = query({
  args: { projectId: v.id('projects') },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const assets = await ctx.db.query('assets').withIndex('by_project', (q) => q.eq('projectId', args.projectId)).order('desc').collect();
    return await Promise.all(assets.filter((asset) => !asset.deletedAt).map(async (asset) => ({
      ...asset,
      storageUrl: asset.storageId ? await ctx.storage.getUrl(asset.storageId) : undefined,
    })));
  },
});

export const importAsset = mutation({
  args: { sourceAssetId: v.id('assets'), projectId: v.id('projects'), productionId: v.optional(v.id('productions')) },
  handler: async (ctx, args) => projectAssetCopy(ctx, args.sourceAssetId, args.projectId, args.productionId, 'IMPORT'),
});

export const duplicateAsset = mutation({
  args: { sourceAssetId: v.id('assets'), projectId: v.id('projects'), productionId: v.optional(v.id('productions')) },
  handler: async (ctx, args) => projectAssetCopy(ctx, args.sourceAssetId, args.projectId, args.productionId, 'DUPLICATE'),
});

async function authorizedAsset(ctx: QueryCtx, assetId: string) {
  const asset = await ctx.db.get(assetId as Id<'assets'>);
  if (!asset) return null;
  await requireAssetAccess(ctx, asset);
  return asset;
}

/** Resolve a short-lived media URL only after project/studio authorization. */
export const resolveAuthorizedMedia = query({
  args: { assetId: v.id('assets') },
  handler: async (ctx, args) => {
    const asset = await authorizedAsset(ctx, args.assetId.toString());
    if (!asset || !asset.storageId) return null;
    const url = await ctx.storage.getUrl(asset.storageId);
    if (!url) return null;
    return { assetId: asset._id, storageId: asset.storageId, url, expiresAt: now() + MEDIA_RESOLUTION_TTL_SECONDS * 1000, ttlSeconds: MEDIA_RESOLUTION_TTL_SECONDS };
  },
});

export const getAssetContract = query({
  args: { assetId: v.id('assets') },
  handler: async (ctx, args) => {
    const asset = await authorizedAsset(ctx, args.assetId.toString());
    if (!asset) return null;
    return {
      assetId: asset._id,
      studioExternalId: asset.studioExternalId,
      scope: asset.scope,
      projectId: asset.projectId,
      originAssetId: asset.originAssetId,
      productionId: asset.productionId,
      storageId: asset.storageId,
      source: asset.source,
      roles: asset.roles,
      name: asset.name,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      checksum: asset.checksum,
      provenance: asset.provenance,
      rights: asset.rights,
      metadata: asset.metadata,
      createdAt: asset.createdAt,
    };
  },
});
