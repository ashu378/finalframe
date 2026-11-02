'use server';

import { api } from '../../../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { requireStudioAdmin } from '@/lib/guards/platform';
import { discoverOpenRouterVideoModels } from '@/lib/ai/model-discovery';

export async function getAdminOperations() {
  const client = await getAuthenticatedConvexClient();
  return client.query(api.app.adminOperations, {});
}

/**
 * Development-only maintenance action. Convex performs the final admin and
 * feature-flag checks, so this cannot be used as a public credit endpoint.
 */
export async function grantDevelopmentTestCredits(input: {
  amount: number;
  reason: string;
  idempotencyKey: string;
}) {
  const profile = await requireStudioAdmin();
  const client = await getAuthenticatedConvexClient();
  const current = await client.query(api.account.current, {});
  const studioExternalId = current.studio?.externalId ?? profile.studio.externalId;
  if (!studioExternalId) throw new Error('No studio is associated with the admin account.');
  try {
    return await client.mutation(api.credits.grantTestCredits, {
      studioExternalId,
      amount: input.amount,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
    });
  } catch {
    throw new Error('Test credits could not be granted. Check the development flag and admin access.');
  }
}

export async function refreshVideoModelCatalog() {
  await requireStudioAdmin();
  const client = await getAuthenticatedConvexClient();
  const current = await client.query(api.account.current, {});
  const studioExternalId = current.studio?.externalId;
  if (!studioExternalId) throw new Error('No studio is associated with the admin account.');
  const discovered = await discoverOpenRouterVideoModels({ force: true, staleIfError: false });
  const models = discovered.map((model) => {
    const perSecondPrices = Object.entries(model.pricingSkus).filter(([sku]) => sku.startsWith('per-video-second')).map(([, price]) => price);
    return {
      provider: 'openrouter', modelId: model.id, canonicalSlug: model.canonicalSlug, name: model.name,
      supportedDurations: model.supportedDurations,
      supportedResolutions: model.supportedResolutions,
      supportedAspectRatios: model.supportedAspectRatios,
      supportedSizes: model.supportedSizes,
      supportedParameters: model.allowedPassthroughParameters,
      pricingSkus: model.pricingSkus, upscaleFactor: model.upscaleFactor, creativityLevels: model.creativityLevels,
      estimatedCostPerSecond: model.pricingSkus['per-video-second'] ?? (perSecondPrices.length ? Math.max(...perSecondPrices) : undefined),
    };
  });
  await client.mutation(api.videoRouting.refreshCatalog, { studioExternalId, models });
}

export async function reviewVideoModelCapabilities(formData: FormData) {
  await requireStudioAdmin();
  const client = await getAuthenticatedConvexClient();
  const current = await client.query(api.account.current, {});
  const studioExternalId = current.studio?.externalId;
  if (!studioExternalId) throw new Error('No studio is associated with the admin account.');
  const checked = (key: string) => formData.get(key) === 'on';
  await client.mutation(api.videoRouting.reviewModelCapabilities, {
    studioExternalId,
    modelId: String(formData.get('modelId') || ''),
    available: checked('available'),
    supportsTextToVideo: checked('supportsTextToVideo'),
    supportsImageReferences: checked('supportsImageReferences'),
    supportsFirstFrame: checked('supportsFirstFrame'),
    supportsLastFrame: checked('supportsLastFrame'),
    supportsAudio: checked('supportsAudio'),
    supportsVideoReferences: checked('supportsVideoReferences'),
    supportsVideoEdit: checked('supportsVideoEdit'),
    supportsVideoExtension: checked('supportsVideoExtension'),
    supportsAudioReferences: checked('supportsAudioReferences'),
    supportsPerformanceTransfer: checked('supportsPerformanceTransfer'),
    supportsLipSync: checked('supportsLipSync'),
    supportsUpscale: checked('supportsUpscale'),
    supportsSourceAudioPreservation: checked('supportsSourceAudioPreservation'),
    supportsCombinedFrameReferences: checked('supportsCombinedFrameReferences'),
    reviewedOperations: formData.getAll('reviewedOperations').map(String),
  });
}

export async function saveVideoRoutePolicy(formData: FormData) {
  await requireStudioAdmin();
  const client = await getAuthenticatedConvexClient();
  const current = await client.query(api.account.current, {});
  const studioExternalId = current.studio?.externalId;
  if (!studioExternalId) throw new Error('No studio is associated with the admin account.');
  const preferredModelIds = formData.getAll('preferredModelIds').map(String).filter(Boolean);
  const maxCost = String(formData.get('maxCostUsd') || '').trim();
  await client.mutation(api.videoRouting.savePolicy, {
    studioExternalId,
    videoType: String(formData.get('videoType')) as never,
    qualityTier: String(formData.get('qualityTier')) as never,
    path: String(formData.get('path')) as never,
    preferredModelIds,
    ...(maxCost ? { maxCostUsd: Number(maxCost) } : {}),
  });
}
