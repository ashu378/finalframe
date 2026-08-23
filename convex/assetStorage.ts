import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { requireStudio, getProduction, now } from './_shared';

const MEDIA_RESOLUTION_TTL_SECONDS = 300;

/** Issue a short-lived Convex Storage upload URL after studio authorization. */
export const generateUploadUrl = mutation({
  args: {
    studioExternalId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireStudio(ctx, args.studioExternalId);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Bind an uploaded storage object to the existing assets table. Consent and
 * lineage remain inside metadata until schema.ts grows first-class columns.
 */
export const ingestAsset = mutation({
  args: {
    studioExternalId: v.string(),
    productionId: v.optional(v.id('productions')),
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
    await requireStudio(ctx, args.studioExternalId);
    if (args.productionId) await getProduction(ctx, args.productionId.toString());

    const storageMetadata = await ctx.db.system.get('_storage', args.storageId);
    if (!storageMetadata) throw new Error('Uploaded storage object not found');

    if (args.externalId) {
      const existing = await ctx.db
        .query('assets')
        .withIndex('by_external_id', (q) => q.eq('externalId', args.externalId))
        .unique();
      if (existing) {
        if (existing.studioExternalId !== args.studioExternalId) throw new Error('Asset external ID is already in use');
        return {
          assetId: existing._id,
          storageId: existing.storageId,
          kind: existing.metadata?.kind,
          mimeType: existing.mimeType,
          checksum: existing.checksum,
        };
      }
    }

    const metadata = {
      ...(typeof args.metadata === 'object' && args.metadata !== null && !Array.isArray(args.metadata) ? args.metadata : {}),
      contractVersion: 'media-asset.v1',
      storage: {
        sizeBytes: storageMetadata.size,
        contentType: storageMetadata.contentType,
      },
      consent: args.consent,
      lineage: args.lineage,
    };
    const assetId = await ctx.db.insert('assets', {
      externalId: args.externalId,
      studioExternalId: args.studioExternalId,
      productionId: args.productionId,
      source: args.source,
      roles: args.roles,
      name: args.name,
      mimeType: args.mimeType || storageMetadata.contentType || undefined,
      storageId: args.storageId,
      checksum: args.checksum || storageMetadata.sha256,
      provenance: args.provenance,
      rights: args.rights,
      metadata,
      createdAt: now(),
    });

    return {
      assetId,
      storageId: args.storageId,
      kind: metadata.kind,
      mimeType: args.mimeType || storageMetadata.contentType || undefined,
      checksum: args.checksum || storageMetadata.sha256,
    };
  },
});

/**
 * Resolve a media URL only after ownership is checked. Consumers must discard
 * the returned URL at expiresAt; durable records retain storageId, never URL.
 */
export const resolveAuthorizedMedia = query({
  args: {
    assetId: v.id('assets'),
  },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) return null;
    await requireStudio(ctx, asset.studioExternalId);
    if (!asset.storageId) return null;

    const url = await ctx.storage.getUrl(asset.storageId);
    if (!url) return null;
    return {
      assetId: asset._id,
      storageId: asset.storageId,
      url,
      expiresAt: now() + MEDIA_RESOLUTION_TTL_SECONDS * 1000,
      ttlSeconds: MEDIA_RESOLUTION_TTL_SECONDS,
    };
  },
});

/** Return contract metadata without resolving a playable URL. */
export const getAssetContract = query({
  args: {
    assetId: v.id('assets'),
  },
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset) return null;
    await requireStudio(ctx, asset.studioExternalId);
    return {
      assetId: asset._id,
      studioExternalId: asset.studioExternalId,
      productionId: asset.productionId,
      storageId: asset.storageId,
      source: asset.source,
      roles: asset.roles,
      name: asset.name,
      mimeType: asset.mimeType,
      checksum: asset.checksum,
      provenance: asset.provenance,
      rights: asset.rights,
      metadata: asset.metadata,
      createdAt: asset.createdAt,
    };
  },
});
