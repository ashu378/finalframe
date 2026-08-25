import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireMember, type AuthorizedMember } from "./authorization";

type ReadCtx = QueryCtx | MutationCtx;

type PlanningMetadata = {
  idempotencyKey?: string;
  state?: string;
  approvedAt?: number;
  revisedFromPlanId?: string;
  sourceIntentId?: string;
};

function now() {
  return Date.now();
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function planningMetadata(value: unknown): PlanningMetadata {
  const record = asRecord(value);
  const planning = record.planning;
  return planning && typeof planning === "object" && !Array.isArray(planning)
    ? planning as PlanningMetadata
    : {};
}

function requireIdempotencyKey(value: string) {
  const key = value.trim();
  if (key.length < 8 || key.length > 200) {
    throw new Error("Idempotency key must be between 8 and 200 characters.");
  }
  return key;
}

function requireBrief(value: string) {
  const brief = value.trim();
  if (!brief) throw new Error("A creative brief is required.");
  if (brief.length > 20_000) throw new Error("Creative brief is too long.");
  return brief;
}

async function requireProduction(ctx: ReadCtx, productionId: Id<"productions">) {
  const production = await ctx.db.get(productionId);
  if (!production) throw new Error("Production not found.");
  const member = await requireMember(ctx, production.studioExternalId);
  return { production, member };
}

async function requireAssetsInStudio(
  ctx: ReadCtx,
  assetIds: Id<"assets">[] | undefined,
  studioExternalId: string,
) {
  for (const assetId of assetIds ?? []) {
    const asset = await ctx.db.get(assetId);
    if (!asset) throw new Error("One or more selected media items no longer exist.");
    if (asset.studioExternalId !== studioExternalId) {
      throw new Error("Selected media is not available in this studio.");
    }
  }
}

async function findIntentByKey(
  ctx: ReadCtx,
  studioExternalId: string,
  idempotencyKey: string,
) {
  const intents = await ctx.db
    .query("createIntents")
    .withIndex("by_studio", (q) => q.eq("studioExternalId", studioExternalId))
    .collect();
  return intents.find((intent) => planningMetadata(intent.metadata).idempotencyKey === idempotencyKey);
}

async function findPlanByKey(
  ctx: ReadCtx,
  productionId: Id<"productions">,
  idempotencyKey: string,
) {
  const plans = await ctx.db
    .query("directorPlans")
    .withIndex("by_production", (q) => q.eq("productionId", productionId))
    .collect();
  return plans.find((plan) => planningMetadata(plan.approval).idempotencyKey === idempotencyKey);
}

async function findApprovedVersion(
  ctx: ReadCtx,
  productionId: Id<"productions">,
  sourcePlanId: Id<"directorPlans">,
) {
  const versions = await ctx.db
    .query("productionVersions")
    .withIndex("by_production", (q) => q.eq("productionId", productionId))
    .collect();
  return versions.find((version) => version.sourcePlanId === sourcePlanId);
}

async function createPlanVersion(
  ctx: MutationCtx,
  member: AuthorizedMember,
  args: {
    productionId: Id<"productions">;
    input: unknown;
    plan: unknown;
    estimate: unknown;
    idempotencyKey: string;
    sourceIntentId?: Id<"createIntents">;
    revisedFromPlanId?: Id<"directorPlans">;
  },
) {
  const key = requireIdempotencyKey(args.idempotencyKey);
  const existing = await findPlanByKey(ctx, args.productionId, key);
  if (existing) return existing;

  const plans = await ctx.db
    .query("directorPlans")
    .withIndex("by_production", (q) => q.eq("productionId", args.productionId))
    .collect();
  const versionNumber = Math.max(0, ...plans.map((plan) => plan.versionNumber ?? 0)) + 1;
  const createdAt = now();

  const approval: PlanningMetadata = {
    state: "DRAFT",
    idempotencyKey: key,
    sourceIntentId: args.sourceIntentId?.toString(),
    revisedFromPlanId: args.revisedFromPlanId?.toString(),
  };

  if (args.revisedFromPlanId) {
    const previous = await ctx.db.get(args.revisedFromPlanId);
    if (!previous || previous.productionId !== args.productionId) {
      throw new Error("The plan being revised does not belong to this production.");
    }
    await ctx.db.patch(previous._id, {
      status: "SUPERSEDED",
      updatedAt: createdAt,
    });
  }

  const planId = await ctx.db.insert("directorPlans", {
    productionId: args.productionId,
    versionNumber,
    input: args.input,
    plan: args.plan,
    estimate: args.estimate,
    status: "READY",
    approval,
    createdByExternalId: member.identity.externalId,
    createdByUserId: member.user._id,
    createdAt,
    updatedAt: createdAt,
  });

  await ctx.db.patch(args.productionId, {
    currentPlanId: planId,
    status: "PLANNING",
    updatedAt: createdAt,
  });

  return await ctx.db.get(planId);
}

export const createIntent = mutation({
  args: {
    studioExternalId: v.string(),
    projectId: v.optional(v.id("projects")),
    productionId: v.optional(v.id("productions")),
    inputMode: v.string(),
    brief: v.string(),
    inputAssetIds: v.optional(v.array(v.id("assets"))),
    metadata: v.optional(v.any()),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const member = await requireMember(ctx, args.studioExternalId);
    const key = requireIdempotencyKey(args.idempotencyKey);
    const brief = requireBrief(args.brief);

    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project || project.studioExternalId !== member.studio.externalId) {
        throw new Error("Project not found.");
      }
    }
    if (args.productionId) {
      const { production } = await requireProduction(ctx, args.productionId);
      if (production.studioExternalId !== member.studio.externalId) {
        throw new Error("Production does not belong to this studio.");
      }
    }
    await requireAssetsInStudio(ctx, args.inputAssetIds, member.studio.externalId);

    const existing = await findIntentByKey(ctx, member.studio.externalId, key);
    if (existing) return existing;

    const createdAt = now();
    const metadata = {
      ...asRecord(args.metadata),
      planning: {
        ...planningMetadata(args.metadata),
        idempotencyKey: key,
        createdByUserId: member.user._id.toString(),
      },
    };

    const intentId = await ctx.db.insert("createIntents", {
      studioExternalId: member.studio.externalId,
      studioId: member.studio._id,
      projectId: args.projectId,
      productionId: args.productionId,
      createdByExternalId: member.identity.externalId,
      createdByUserId: member.user._id,
      inputMode: args.inputMode,
      brief,
      inputAssetIds: args.inputAssetIds,
      metadata,
      status: "DRAFT",
      createdAt,
      updatedAt: createdAt,
    });
    return await ctx.db.get(intentId);
  },
});

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
    return await ctx.db
      .query("createIntents")
      .withIndex("by_studio", (q) => q.eq("studioExternalId", args.studioExternalId))
      .order("desc")
      .collect();
  },
});

export const createPlan = mutation({
  args: {
    productionId: v.id("productions"),
    input: v.any(),
    plan: v.any(),
    estimate: v.any(),
    idempotencyKey: v.string(),
    sourceIntentId: v.optional(v.id("createIntents")),
  },
  handler: async (ctx, args) => {
    const { production, member } = await requireProduction(ctx, args.productionId);
    if (args.sourceIntentId) {
      const intent = await ctx.db.get(args.sourceIntentId);
      if (!intent || intent.studioExternalId !== production.studioExternalId) {
        throw new Error("Create intent does not belong to this production.");
      }
    }
    return await createPlanVersion(ctx, member, args);
  },
});

export const revisePlan = mutation({
  args: {
    planId: v.id("directorPlans"),
    input: v.any(),
    plan: v.any(),
    estimate: v.any(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const previous = await ctx.db.get(args.planId);
    if (!previous) throw new Error("Plan not found.");
    const { member } = await requireProduction(ctx, previous.productionId);
    return await createPlanVersion(ctx, member, {
      productionId: previous.productionId,
      input: args.input,
      plan: args.plan,
      estimate: args.estimate,
      idempotencyKey: args.idempotencyKey,
      revisedFromPlanId: previous._id,
    });
  },
});

export const getPlan = query({
  args: { planId: v.id("directorPlans") },
  handler: async (ctx, args) => {
    const plan = await ctx.db.get(args.planId);
    if (!plan) throw new Error("Plan not found.");
    const { production } = await requireProduction(ctx, plan.productionId);
    return { plan, production };
  },
});

export const listPlans = query({
  args: { productionId: v.id("productions") },
  handler: async (ctx, args) => {
    await requireProduction(ctx, args.productionId);
    const plans = await ctx.db
      .query("directorPlans")
      .withIndex("by_production", (q) => q.eq("productionId", args.productionId))
      .collect();
    return plans.sort((left, right) => (right.versionNumber ?? 0) - (left.versionNumber ?? 0));
  },
});

export const approvePlan = mutation({
  args: {
    planId: v.id("directorPlans"),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const plan = await ctx.db.get(args.planId);
    if (!plan) throw new Error("Plan not found.");
    const { production } = await requireProduction(ctx, plan.productionId);
    const key = requireIdempotencyKey(args.idempotencyKey);

    const existingVersion = await findApprovedVersion(ctx, production._id, plan._id);
    if (existingVersion) return { plan: await ctx.db.get(plan._id), production, version: existingVersion };
    if (plan.status === "SUPERSEDED") throw new Error("A superseded plan cannot be approved.");
    if (plan.status === "APPROVED") throw new Error("Plan approval is already being reconciled.");
    if (plan.status !== "READY" && plan.status !== "DRAFT") throw new Error("Plan is not ready for approval.");

    const versions = await ctx.db
      .query("productionVersions")
      .withIndex("by_production", (q) => q.eq("productionId", production._id))
      .collect();
    const timestamp = now();
    const versionId = await ctx.db.insert("productionVersions", {
      productionId: production._id,
      versionNumber: Math.max(0, ...versions.map((version) => version.versionNumber)) + 1,
      status: "APPROVED",
      sourcePlanId: plan._id,
      approvedAt: timestamp,
      createdAt: timestamp,
    });

    const approval: PlanningMetadata = {
      ...planningMetadata(plan.approval),
      state: "APPROVED",
      idempotencyKey: key,
      approvedAt: timestamp,
    };
    await ctx.db.patch(plan._id, { status: "APPROVED", approval, approvedAt: timestamp, updatedAt: timestamp });
    await ctx.db.patch(production._id, { status: "APPROVED", currentPlanId: plan._id, currentVersionId: versionId, updatedAt: timestamp });

    return { plan: await ctx.db.get(plan._id), production: await ctx.db.get(production._id), version: await ctx.db.get(versionId) };
  },
});

