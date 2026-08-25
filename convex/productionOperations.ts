import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireMember } from "./authorization";

type ReadCtx = QueryCtx | MutationCtx;

const operationKinds = new Set([
  "EDIT_PROMPT",
  "PROMPT_EDIT",
  "REPLACE_MEDIA",
  "REGENERATE",
  "REGENERATE_TAKE",
  "TRIM",
  "SPLIT",
  "REORDER",
  "UPDATE_TEXT",
  "UPDATE_CAPTIONS",
  "ADJUST_AUDIO",
  "ADD_TRANSITION",
  "REMOVE_TRANSITION",
  "ADD_NODE",
  "UPDATE_NODE",
  "REMOVE_NODE",
  "RECONNECT_NODE",
  "REQUEST_REVIEW",
]);

const targetTypes = new Set([
  "production",
  "productionVersion",
  "sequence",
  "scene",
  "shot",
  "shotVersion",
  "videoTake",
  "asset",
  "audio",
  "transcript",
  "captionTrack",
  "timeline",
  "timelineClip",
  "review",
  "export",
  "character",
  "location",
  "product",
  "referencePack",
]);

function now() {
  return Date.now();
}

function requireIdempotencyKey(value: string) {
  const key = value.trim();
  if (key.length < 8 || key.length > 200) {
    throw new Error("Idempotency key must be between 8 and 200 characters.");
  }
  return key;
}

function requireOperationKind(value: string) {
  const kind = value.trim();
  if (!operationKinds.has(kind)) throw new Error("This Canvas operation is not supported.");
  return kind;
}

function requireTargetType(value: string) {
  const targetType = value.trim();
  if (!targetTypes.has(targetType)) throw new Error("This Canvas target is not supported.");
  return targetType;
}

function requireResourceId(value: string, label: string) {
  const resourceId = value.trim();
  if (!resourceId) throw new Error(`${label} is required.`);
  if (resourceId.length > 300) throw new Error(`${label} is too long.`);
  return resourceId;
}

function optionalString(value: string | undefined, label: string, maxLength: number) {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new Error(`${label} is too long.`);
  return normalized || undefined;
}

function requireInput(value: unknown) {
  let serialized: string;
  try {
    serialized = JSON.stringify(value ?? {});
  } catch {
    throw new Error("Operation input must be serializable.");
  }
  if (serialized.length > 100_000) throw new Error("Operation input is too large.");
  return value ?? {};
}

function requireOlderVersionConfirmation(kind: string, input: unknown) {
  if (!["REGENERATE", "REGENERATE_TAKE", "REPLACE_MEDIA"].includes(kind)) return;
  const record = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const hasOlderVersionSelection = typeof record.olderVersionId === "string" || record.usesOlderVersion === true || record.keepOlderVersion === true;
  if (hasOlderVersionSelection && record.confirmOlderVersion !== true) {
    throw new Error("Confirm older version use before continuing.");
  }
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

async function findByIdempotencyKey(ctx: ReadCtx, idempotencyKey: string) {
  const operations = await ctx.db
    .query("productionOperations")
    .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
    .collect();
  return operations.sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
}

function resourceKey(type: string, id: string, versionId?: string) {
  return `${type}:${id}:${versionId ?? ""}`;
}

type ImpactResource = {
  resourceType: string;
  resourceId: string;
  versionId?: string;
  depth: number;
  dependencyKind: string;
  state: string;
};

export const create = mutation({
  args: {
    productionId: v.id("productions"),
    productionVersionId: v.optional(v.id("productionVersions")),
    kind: v.string(),
    targetType: v.string(),
    targetId: v.string(),
    targetVersionId: v.optional(v.string()),
    input: v.any(),
    requestHash: v.optional(v.string()),
    idempotencyKey: v.string(),
    correlationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { production, member } = await requireProduction(ctx, args.productionId);
    await validateProductionVersion(ctx, production._id, args.productionVersionId);

    const kind = requireOperationKind(args.kind);
    const targetType = requireTargetType(args.targetType);
    const targetId = requireResourceId(args.targetId, "Target resource ID");
    const targetVersionId = optionalString(args.targetVersionId, "Target version ID", 300);
    const requestHash = optionalString(args.requestHash, "Request hash", 500);
    const idempotencyKey = requireIdempotencyKey(args.idempotencyKey);
    const correlationId = optionalString(args.correlationId, "Correlation ID", 200);
    const input = requireInput(args.input);
    requireOlderVersionConfirmation(kind, input);

    const existing = await findByIdempotencyKey(ctx, idempotencyKey);
    if (existing) {
      if (existing.studioExternalId !== member.studio.externalId || existing.productionId !== production._id) {
        throw new Error("This idempotency key is already associated with another operation.");
      }
      return existing;
    }

    const createdAt = now();
    const operationId = await ctx.db.insert("productionOperations", {
      studioExternalId: member.studio.externalId,
      studioId: member.studio._id,
      productionId: production._id,
      productionVersionId: args.productionVersionId,
      kind,
      targetType,
      targetId,
      targetVersionId,
      input,
      requestHash,
      idempotencyKey,
      status: "REQUESTED",
      actorUserId: member.user._id,
      actorExternalId: member.identity.externalId,
      correlationId,
      outputResourceIds: [],
      createdAt,
      updatedAt: createdAt,
    });

    return await ctx.db.get(operationId);
  },
});

export const previewImpact = query({
  args: {
    productionId: v.id("productions"),
    targetType: v.string(),
    targetId: v.string(),
    targetVersionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { production } = await requireProduction(ctx, args.productionId);
    const targetType = requireTargetType(args.targetType);
    const targetId = requireResourceId(args.targetId, "Target resource ID");
    const targetVersionId = optionalString(args.targetVersionId, "Target version ID", 300);

    const dependencies = await ctx.db
      .query("productionDependencies")
      .withIndex("by_production", (q) => q.eq("productionId", production._id))
      .collect();

    const direct: ImpactResource[] = [];
    const downstream: ImpactResource[] = [];
    const visited = new Set<string>([resourceKey(targetType, targetId, targetVersionId)]);
    let frontier: Array<{ resourceType: string; resourceId: string; versionId?: string }> = [
      { resourceType: targetType, resourceId: targetId, versionId: targetVersionId },
    ];
    let depth = 1;

    while (frontier.length > 0 && depth <= dependencies.length + 1) {
      const next: Array<{ resourceType: string; resourceId: string; versionId?: string }> = [];

      for (const source of frontier) {
        const outgoing = dependencies.filter((dependency) => {
          if (dependency.sourceType !== source.resourceType || dependency.sourceId !== source.resourceId) return false;
          if (!source.versionId || !dependency.sourceVersionId) return true;
          return dependency.sourceVersionId === source.versionId;
        });

        for (const dependency of outgoing) {
          const key = resourceKey(dependency.targetType, dependency.targetId, dependency.targetVersionId);
          if (visited.has(key)) continue;
          visited.add(key);

          const resource: ImpactResource = {
            resourceType: dependency.targetType,
            resourceId: dependency.targetId,
            versionId: dependency.targetVersionId,
            depth,
            dependencyKind: dependency.kind,
            state: dependency.state,
          };
          if (depth === 1) direct.push(resource);
          else downstream.push(resource);
          next.push({
            resourceType: dependency.targetType,
            resourceId: dependency.targetId,
            versionId: dependency.targetVersionId,
          });
        }
      }

      frontier = next;
      depth += 1;
    }

    const affected = [...direct, ...downstream];
    return {
      productionId: production._id,
      source: { resourceType: targetType, resourceId: targetId, versionId: targetVersionId },
      direct,
      downstream,
      affected,
      affectedResourceIds: affected.map((resource) => resource.resourceId),
      dependencyCount: dependencies.length,
      requiresCreditReservation: false,
    };
  },
});
