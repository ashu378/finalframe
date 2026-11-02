import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireProjectAccess } from "./authorization";

/** Legacy project links work only when there is exactly one production.
 * Multiple episodes always require an explicit selector. */
export async function selectProjectProduction(ctx: QueryCtx | MutationCtx, project: Doc<"projects">, productionId?: Id<"productions">): Promise<Doc<"productions"> | null> {
  await requireProjectAccess(ctx, project._id);
  if (productionId) {
    const production = await ctx.db.get(productionId);
    if (!production || production.studioExternalId !== project.studioExternalId || (production.projectId ? production.projectId !== project._id : production.externalProjectId !== project.externalId)) throw new Error("Production not found in this project.");
    return production;
  }
  const productions = await ctx.db.query("productions").withIndex("by_project", (q) => q.eq("externalProjectId", project.externalId)).take(2);
  if (productions.length > 1) throw new Error("Select an episode to open this project.");
  const production = productions[0] ?? null;
  if (production && (production.studioExternalId !== project.studioExternalId || production.projectId && production.projectId !== project._id)) throw new Error("Production not found in this project.");
  return production;
}
