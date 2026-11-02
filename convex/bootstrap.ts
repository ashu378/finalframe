import { internalMutation } from './_generated/server';
import { v } from 'convex/values';

// These legacy names have no application or fixture callers. Keep internal
// compatibility references, but no second path for creating studios, projects,
// assets or credits outside the canonical authorization and financial flows.
function legacyReadOnly(): never {
  throw new Error('LEGACY_BOOTSTRAP_READ_ONLY: Use the canonical account, project and project-asset workflows.');
}

export const ensureStudio = internalMutation({
  args: { studioExternalId: v.string(), name: v.string(), initialCredits: v.optional(v.number()) },
  returns: v.id('studios'),
  handler: async () => legacyReadOnly(),
});

export const mirrorProject = internalMutation({
  args: { studioExternalId: v.string(), projectExternalId: v.string(), name: v.string(), description: v.optional(v.string()) },
  returns: v.id('projects'),
  handler: async () => legacyReadOnly(),
});

export const mirrorAsset = internalMutation({
  args: {
    studioExternalId: v.string(), productionId: v.id('productions'), assetExternalId: v.string(), source: v.string(), roles: v.array(v.string()),
    name: v.optional(v.string()), mimeType: v.optional(v.string()), storageUrl: v.optional(v.string()), metadata: v.any(),
  },
  returns: v.id('assets'),
  handler: async () => legacyReadOnly(),
});
