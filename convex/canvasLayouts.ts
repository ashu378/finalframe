import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireMember } from "./authorization";

type ReadCtx = QueryCtx | MutationCtx;

function now() {
  return Date.now();
}

function requireLayoutVersion(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 10_000) {
    throw new Error("Canvas layout version must be a whole number between 1 and 10,000.");
  }
  return value;
}

function requireNodeId(value: string | undefined) {
  if (value === undefined) return undefined;
  const nodeId = value.trim();
  if (!nodeId) throw new Error("Selected Canvas node cannot be empty.");
  if (nodeId.length > 300) throw new Error("Selected Canvas node is too long.");
  return nodeId;
}

function requireMobileOrder(value: string[] | undefined) {
  if (value === undefined) return undefined;
  if (value.length > 2_000) throw new Error("Canvas mobile order contains too many nodes.");
  return value.map((nodeId) => {
    const normalized = nodeId.trim();
    if (!normalized || normalized.length > 300) {
      throw new Error("Canvas mobile order contains an invalid node.");
    }
    return normalized;
  });
}

function serializedSize(value: unknown) {
  try {
    return JSON.stringify(value ?? null).length;
  } catch {
    throw new Error("Canvas layout data must be serializable.");
  }
}

function requireLayoutData(layout: unknown) {
  if (serializedSize(layout) > 500_000) {
    throw new Error("Canvas layout data is too large.");
  }
  return layout;
}

function requireViewport(viewport: unknown) {
  if (viewport === undefined) return undefined;
  if (serializedSize(viewport) > 20_000) throw new Error("Canvas viewport data is too large.");
  return viewport;
}

async function requireProduction(ctx: ReadCtx, productionId: Id<"productions">) {
  const production = await ctx.db.get(productionId);
  if (!production) throw new Error("Production not found.");
  const member = await requireMember(ctx, production.studioExternalId);
  return { production, member };
}

async function validateProductionVersion(
  ctx: ReadCtx,
  productionId: Id<"productions">,
  productionVersionId: Id<"productionVersions"> | undefined,
) {
  if (!productionVersionId) return;
  const version = await ctx.db.get(productionVersionId);
  if (!version || version.productionId !== productionId) {
    throw new Error("The selected production version does not belong to this video project.");
  }
}

async function findLayout(
  ctx: ReadCtx,
  productionId: Id<"productions">,
  productionVersionId: Id<"productionVersions"> | undefined,
) {
  const layouts = await ctx.db
    .query("canvasLayouts")
    .withIndex("by_production", (q) => q.eq("productionId", productionId))
    .collect();

  return layouts
    .filter((layout) => layout.productionVersionId === productionVersionId)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export const get = query({
  args: {
    productionId: v.id("productions"),
    productionVersionId: v.optional(v.id("productionVersions")),
  },
  handler: async (ctx, args) => {
    const { production } = await requireProduction(ctx, args.productionId);
    await validateProductionVersion(ctx, production._id, args.productionVersionId);
    return await findLayout(ctx, production._id, args.productionVersionId);
  },
});

export const save = mutation({
  args: {
    productionId: v.id("productions"),
    productionVersionId: v.optional(v.id("productionVersions")),
    layoutVersion: v.number(),
    layout: v.any(),
    selectedNodeId: v.optional(v.string()),
    viewport: v.optional(v.any()),
    mobileOrder: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { production, member } = await requireProduction(ctx, args.productionId);
    await validateProductionVersion(ctx, production._id, args.productionVersionId);

    const layoutVersion = requireLayoutVersion(args.layoutVersion);
    const layout = requireLayoutData(args.layout);
    const selectedNodeId = requireNodeId(args.selectedNodeId);
    const viewport = requireViewport(args.viewport);
    const mobileOrder = requireMobileOrder(args.mobileOrder);
    const existing = await findLayout(ctx, production._id, args.productionVersionId);

    if (
      existing &&
      existing.layoutVersion === layoutVersion &&
      sameJson(existing.layout, layout) &&
      existing.selectedNodeId === selectedNodeId &&
      sameJson(existing.viewport, viewport) &&
      sameJson(existing.mobileOrder, mobileOrder)
    ) {
      return { layout: existing, created: false, changed: false };
    }

    const updatedAt = now();
    const values = {
      studioExternalId: member.studio.externalId,
      studioId: member.studio._id,
      productionId: production._id,
      productionVersionId: args.productionVersionId,
      layoutVersion,
      layout,
      selectedNodeId,
      viewport,
      mobileOrder,
      createdByUserId: existing?.createdByUserId ?? member.user._id,
      updatedAt,
    };

    if (existing) {
      await ctx.db.patch(existing._id, values);
      return { layout: await ctx.db.get(existing._id), created: false, changed: true };
    }

    const layoutId = await ctx.db.insert("canvasLayouts", values);
    return { layout: await ctx.db.get(layoutId), created: true, changed: true };
  },
});

