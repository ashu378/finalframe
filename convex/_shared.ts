import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export type ReadCtx = QueryCtx | MutationCtx;

export async function requireStudio(ctx: ReadCtx, studioExternalId: string, ownerExternalId: string) {
  const studio = await ctx.db
    .query("studios")
    .withIndex("by_external_id", (q) => q.eq("externalId", studioExternalId))
    .unique();
  if (!studio || studio.ownerExternalId !== ownerExternalId) {
    throw new Error("Studio not found");
  }
  return studio;
}

export async function getProduction(ctx: ReadCtx, productionId: string, ownerExternalId: string) {
  const production = await ctx.db.get(productionId as Id<"productions">);
  if (!production) {
    throw new Error("Production not found");
  }
  await requireStudio(ctx, production.studioExternalId, ownerExternalId);
  return production;
}

export function now() {
  return Date.now();
}
