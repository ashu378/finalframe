import { query } from "./_generated/server";
import { v } from "convex/values";
import { getProduction } from "./_shared";
import { requireProjectAccess } from "./authorization";
import { resolveGenerationContinuity } from "./generationContinuity";
import { object } from "./generationWorkerContracts";

// Compatibility names for existing callers. Durable state lives in
// generationJobs.ts; these aliases do not create a second job authority.
export {
  create as createJob,
  get as getJob,
} from "./generationJobs";

export const getShot = query({
  args: { productionId: v.id("productions"), shotId: v.id("shots") },
  handler: async (ctx, args) => {
    const production = await getProduction(ctx, args.productionId.toString());
    const shot = await ctx.db.get(args.shotId);
    if (!shot || (shot.productionId !== undefined && shot.productionId !== production._id)) throw new Error("Shot not found");
    const scene = await ctx.db.get(shot.sceneId);
    if (!scene || (scene.productionId !== undefined && scene.productionId !== production._id)) throw new Error("Shot not found");
    let project = null;
    const referenceAssets: Array<{ assetId: string; url: string; mimeType: string }> = [];
    const audioAssetIds: string[] = [];
    let hasAudioReference = false;
    if (production.projectId) {
      const access = await requireProjectAccess(ctx, production.projectId);
      project = access.project;
      if (project.studioExternalId !== production.studioExternalId) throw new Error("Production does not belong to this project.");
      const version = production.currentVersionId ? await ctx.db.get(production.currentVersionId) : null;
      const continuity = await resolveGenerationContinuity(ctx, { projectId: project._id, productionId: production._id, snapshot: version?.planningContextSnapshot, explicitResourceVersionIds: object(shot.metadata).resourceVersionIds, referenceAssetIds: shot.requiredAssetIds || [] });
      for (const rawAssetId of continuity.referenceAssetIds) {
        const assetId = ctx.db.normalizeId("assets", rawAssetId);
        const asset = assetId ? await ctx.db.get(assetId) : null;
        if (!asset || asset.projectId !== project._id || asset.scope !== "PROJECT" || asset.deletedAt) {
          throw new Error("A shot reference is unavailable in this project. Import it into the project before generating.");
        }
        if (!asset.storageId) throw new Error("A shot reference is missing its stored media.");
        const url = await ctx.storage.getUrl(asset.storageId);
        if (!url) throw new Error("A shot reference could not be opened from project storage.");
        const mimeType = asset.mimeType || "application/octet-stream";
        if (mimeType.startsWith("audio/")) { hasAudioReference = true; audioAssetIds.push(asset._id.toString()); }
        else if (mimeType.startsWith("image/") || mimeType.startsWith("video/")) {
          referenceAssets.push({ assetId: asset._id.toString(), url, mimeType });
        } else throw new Error("A shot reference uses an unsupported media format.");
      }
    }
    return { production, shot, project, referenceAssets, audioAssetIds, hasAudioReference };
  },
});
