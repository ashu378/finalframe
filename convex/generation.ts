import { query } from "./_generated/server";
import { v } from "convex/values";
import { getProduction } from "./_shared";

// Compatibility names for existing callers. Durable state lives in
// generationJobs.ts; these aliases do not create a second job authority.
export {
  create as createJob,
  get as getJob,
  claim as markProcessing,
  succeed as completeJob,
  fail as failJob,
} from "./generationJobs";

export const getShot = query({
  args: { productionId: v.id("productions"), shotId: v.id("shots") },
  handler: async (ctx, args) => {
    const production = await getProduction(ctx, args.productionId.toString());
    const shot = await ctx.db.get(args.shotId);
    if (!shot || (shot.productionId !== undefined && shot.productionId !== production._id)) throw new Error("Shot not found");
    const scene = await ctx.db.get(shot.sceneId);
    if (!scene || (scene.productionId !== undefined && scene.productionId !== production._id)) throw new Error("Shot not found");
    return { production, shot };
  },
});
