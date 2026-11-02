/**
 * Legacy planning compatibility surface.
 *
 * New planning and approval writes belong exclusively to productions.ts. The
 * read queries below keep historical createIntents/directorPlans records
 * inspectable while migration is in progress. The old mutation names remain
 * exported so stale clients fail with a clear error instead of silently
 * creating a second planning path.
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { requireMember } from "./authorization";

const READ_ONLY_ERROR = "LEGACY_PLANNING_READ_ONLY: use productions.createPlan and productions.approvePlan.";

async function requireProduction(ctx: QueryCtx, productionId: Id<"productions">) {
  const production = await ctx.db.get(productionId);
  if (!production) throw new Error("Production not found.");
  await requireMember(ctx, production.studioExternalId);
  return production;
}

export const getIntent = query({
  args: { intentId: v.id("createIntents") },
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.intentId);
    if (!intent) throw new Error("Create intent not found.");
    await requireMember(ctx, intent.studioExternalId);
    return intent;
  },
});

export const listIntents = query({
  args: { studioExternalId: v.string() },
  handler: async (ctx, args) => {
    await requireMember(ctx, args.studioExternalId);
    return await ctx.db.query("createIntents").withIndex("by_studio", (q) => q.eq("studioExternalId", args.studioExternalId)).order("desc").collect();
  },
});

export const getPlan = query({
  args: { planId: v.id("directorPlans") },
  handler: async (ctx, args) => {
    const plan = await ctx.db.get(args.planId);
    if (!plan) throw new Error("Plan not found.");
    const production = await requireProduction(ctx, plan.productionId);
    return { plan, production };
  },
});

export const listPlans = query({
  args: { productionId: v.id("productions") },
  handler: async (ctx, args) => {
    await requireProduction(ctx, args.productionId);
    const plans = await ctx.db.query("directorPlans").withIndex("by_production", (q) => q.eq("productionId", args.productionId)).collect();
    return plans.sort((left, right) => (right.versionNumber ?? 0) - (left.versionNumber ?? 0));
  },
});

export const createIntent = mutation({
  args: {
    studioExternalId: v.string(), projectId: v.optional(v.id("projects")), productionId: v.optional(v.id("productions")),
    inputMode: v.string(), brief: v.string(), inputAssetIds: v.optional(v.array(v.id("assets"))), metadata: v.optional(v.any()), idempotencyKey: v.string(),
  },
  handler: async () => { throw new Error(READ_ONLY_ERROR); },
});

export const createPlan = mutation({
  args: { productionId: v.id("productions"), input: v.any(), plan: v.any(), estimate: v.any(), idempotencyKey: v.string(), sourceIntentId: v.optional(v.id("createIntents")) },
  handler: async () => { throw new Error(READ_ONLY_ERROR); },
});

export const revisePlan = mutation({
  args: { planId: v.id("directorPlans"), input: v.any(), plan: v.any(), estimate: v.any(), idempotencyKey: v.string() },
  handler: async () => { throw new Error(READ_ONLY_ERROR); },
});

export const approvePlan = mutation({
  args: { planId: v.id("directorPlans"), idempotencyKey: v.string() },
  handler: async () => { throw new Error(READ_ONLY_ERROR); },
});
