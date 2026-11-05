import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireProjectAccess, requireProjectRole } from "./authorization";
import { ensureResourceState, requireEditable } from "./resourceStates";
import { resolveGenerationContinuity } from "./generationContinuity";

type ReadCtx = QueryCtx | MutationCtx;
type GraphResource = "sequence" | "scene" | "shot" | "shotVersion";
type GraphArchiveStatus = "ARCHIVED" | "DELETED";

const timestamp = () => Date.now();

function text(value: string | undefined, label: string, maxLength: number, required = false) {
  const normalized = value?.trim() ?? "";
  if (required && !normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maxLength) throw new Error(`${label} is too long.`);
  return normalized;
}

function orderIndex(value: number | undefined) {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 0) throw new Error("Order index must be a non-negative integer.");
  return value;
}

function duration(value: number) {
  if (!Number.isFinite(value) || value <= 0 || value > 3_600) {
    throw new Error("Shot duration must be greater than zero and no longer than one hour.");
  }
  return value;
}

function stringList(values: string[] | undefined, label: string, maxItems = 100) {
  if (!values) return undefined;
  if (values.length > maxItems) throw new Error(`${label} contains too many items.`);
  return values.map((value) => text(value, label, 500, true));
}

async function productionFor(ctx: ReadCtx, productionId: Id<"productions">) {
  const production = await ctx.db.get(productionId);
  if (!production) throw new Error("Production not found.");
  if (!production.projectId) throw new Error("Production is not attached to a project.");
  const access = await requireProjectAccess(ctx, production.projectId);
  if (access.project.studioExternalId !== production.studioExternalId) {
    throw new Error("Production does not belong to this project.");
  }
  return { production, access };
}

async function productionEditor(ctx: MutationCtx, productionId: Id<"productions">) {
  const production = await productionFor(ctx, productionId);
  const access = await requireProjectRole(ctx, production.production.projectId!, ["OWNER", "EDITOR"]);
  return { ...production, access };
}

async function versionFor(
  ctx: ReadCtx,
  productionId: Id<"productions">,
  productionVersionId: Id<"productionVersions">,
) {
  const { production, access } = await productionFor(ctx, productionId);
  const version = await ctx.db.get(productionVersionId);
  if (!version || version.productionId !== production._id) {
    throw new Error("Production version does not belong to this production.");
  }
  return { production, access, version };
}

async function editableVersion(
  ctx: MutationCtx,
  productionId: Id<"productions">,
  productionVersionId: Id<"productionVersions">,
) {
  const { production, version } = await versionFor(ctx, productionId, productionVersionId);
  await requireProjectRole(ctx, production.projectId!, ["OWNER", "EDITOR"]);
  if (version.status !== "DRAFT") {
    throw new Error("Approved production snapshots are immutable. Create a new draft version before editing.");
  }
  return { production, version };
}

async function resourceEditable(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  productionId: Id<"productions">,
  resourceType: GraphResource,
  resourceId: string,
) {
  const result = await requireEditable(ctx, projectId, resourceType, resourceId);
  await ensureResourceState(ctx, { projectId, productionId, resourceType, resourceId });
  return result;
}

async function stateForNewResource(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  productionId: Id<"productions">,
  resourceType: GraphResource,
  resourceId: string,
) {
  await ensureResourceState(ctx, { projectId, productionId, resourceType, resourceId });
}

async function cloneTakes(
  ctx: MutationCtx,
  sourceShotId: Id<"shots">,
  targetShotId: Id<"shots">,
  production: Doc<"productions">,
  version: Doc<"productionVersions">,
) {
  const takes = await ctx.db.query("shotVersions").withIndex("by_shot", (q) => q.eq("shotId", sourceShotId)).collect();
  for (const take of takes) {
    if (take.assetId) {
      const asset = await ctx.db.get(take.assetId);
      if (!asset || (asset.projectId && asset.projectId !== production.projectId)) {
        throw new Error("Cannot duplicate a take that references an asset outside this project.");
      }
    }
    const takeId = await ctx.db.insert("shotVersions", {
      studioExternalId: production.studioExternalId, studioId: production.studioId, projectId: production.projectId,
      productionId: production._id, productionVersionId: version._id, shotId: targetShotId, versionNumber: take.versionNumber,
      status: "DRAFT", assetId: take.assetId, promptSnapshot: take.promptSnapshot, contextSnapshot: take.contextSnapshot,
      model: take.model, provider: take.provider, actualCost: take.actualCost, createdAt: timestamp(),
    });
    await stateForNewResource(ctx, production.projectId!, production._id, "shotVersion", takeId.toString());
  }
}

async function assertProjectAssetReferences(ctx: ReadCtx, projectId: Id<"projects">, assetReferences: string[] | undefined) {
  if (!assetReferences) return;
  for (const reference of assetReferences) {
    let asset: Doc<"assets"> | null = null;
    try {
      asset = await ctx.db.get(reference as Id<"assets">);
    } catch {
      asset = null;
    }
    if (!asset) {
      asset = await ctx.db.query("assets").withIndex("by_external_id", (q) => q.eq("externalId", reference)).first();
    }
    if (!asset) throw new Error(`Asset reference ${reference} was not found.`);
    if (asset.scope === "GLOBAL" || asset.projectId !== projectId) {
      throw new Error("Every asset used by a shot must be imported into the same project first.");
    }
  }
}

async function validateResourceBindings(ctx: MutationCtx, production: Doc<"productions">, versionId: Id<"productionVersions">, metadata: unknown, referenceAssetIds: string[], durationSeconds: number) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return;
  if (!["resourceVersionIds", "resourceBindings", "dialogueSegments"].some((key) => key in metadata)) return;
  const version = await ctx.db.get(versionId);
  await resolveGenerationContinuity(ctx, {
    projectId: production.projectId!, productionId: production._id,
    snapshot: version?.planningContextSnapshot,
    explicitResourceVersionIds: (metadata as Record<string, unknown>).resourceVersionIds,
    referenceAssetIds, shotMetadata: metadata, durationSeconds,
  });
}

async function sequenceFor(ctx: ReadCtx, sequenceId: Id<"sequences">) {
  const sequence = await ctx.db.get(sequenceId);
  if (!sequence?.productionId || !sequence.productionVersionId) throw new Error("Sequence is not attached to a production version.");
  const context = await versionFor(ctx, sequence.productionId, sequence.productionVersionId);
  if (sequence.projectId && sequence.projectId !== context.production.projectId) throw new Error("Sequence does not belong to this project.");
  return { ...context, sequence };
}

async function sceneFor(ctx: ReadCtx, sceneId: Id<"scenes">) {
  const scene = await ctx.db.get(sceneId);
  if (!scene?.productionId || !scene.productionVersionId) throw new Error("Scene is not attached to a production version.");
  const context = await versionFor(ctx, scene.productionId, scene.productionVersionId);
  if (scene.projectId && scene.projectId !== context.production.projectId) throw new Error("Scene does not belong to this project.");
  const sequence = await ctx.db.get(scene.sequenceId);
  if (!sequence || sequence.productionId !== context.production._id) throw new Error("Scene sequence does not belong to this production.");
  return { ...context, scene, sequence };
}

async function shotFor(ctx: ReadCtx, shotId: Id<"shots">) {
  const shot = await ctx.db.get(shotId);
  if (!shot?.productionId || !shot.productionVersionId) throw new Error("Shot is not attached to a production version.");
  const context = await versionFor(ctx, shot.productionId, shot.productionVersionId);
  if (shot.projectId && shot.projectId !== context.production.projectId) throw new Error("Shot does not belong to this project.");
  const scene = await ctx.db.get(shot.sceneId);
  if (!scene || scene.productionId !== context.production._id) throw new Error("Shot scene does not belong to this production.");
  return { ...context, shot, scene };
}

async function takeFor(ctx: ReadCtx, shotVersionId: Id<"shotVersions">) {
  const take = await ctx.db.get(shotVersionId);
  if (!take?.productionId || !take.productionVersionId) throw new Error("Take is not attached to a production version.");
  const context = await versionFor(ctx, take.productionId, take.productionVersionId);
  if (take.projectId && take.projectId !== context.production.projectId) throw new Error("Take does not belong to this project.");
  const shot = await ctx.db.get(take.shotId);
  if (!shot || shot.productionId !== context.production._id) throw new Error("Take shot does not belong to this production.");
  return { ...context, take, shot };
}

async function setShotTreeStatus(ctx: MutationCtx, production: Doc<"productions">, shotId: Id<"shots">, status: GraphArchiveStatus) {
  const shot = await ctx.db.get(shotId);
  if (!shot) return;
  await resourceEditable(ctx, production.projectId!, production._id, "shot", shot._id.toString());
  await ctx.db.patch(shot._id, { status });
  const takes = await ctx.db.query("shotVersions").withIndex("by_shot", (q) => q.eq("shotId", shot._id)).collect();
  for (const take of takes) {
    await resourceEditable(ctx, production.projectId!, production._id, "shotVersion", take._id.toString());
    await ctx.db.patch(take._id, { status });
  }
}

async function setSceneTreeStatus(ctx: MutationCtx, production: Doc<"productions">, sceneId: Id<"scenes">, status: GraphArchiveStatus) {
  const scene = await ctx.db.get(sceneId);
  if (!scene) return;
  await resourceEditable(ctx, production.projectId!, production._id, "scene", scene._id.toString());
  await ctx.db.patch(scene._id, { status });
  const shots = await ctx.db.query("shots").withIndex("by_scene", (q) => q.eq("sceneId", scene._id)).collect();
  for (const shot of shots) await setShotTreeStatus(ctx, production, shot._id, status);
}

function active<T extends { status?: string }>(rows: T[]) {
  return rows.filter((row) => row.status !== "ARCHIVED" && row.status !== "DELETED");
}

function assertCompleteOrdering(orderedIds: string[], existingIds: string[], label: string) {
  if (new Set(orderedIds).size !== orderedIds.length) throw new Error(`${label} order contains duplicate IDs.`);
  if (orderedIds.length !== existingIds.length || orderedIds.some((id) => !existingIds.includes(id))) {
    throw new Error(`${label} order must include every active item exactly once.`);
  }
}

export const list = query({
  args: { productionId: v.id("productions"), productionVersionId: v.id("productionVersions") },
  handler: async (ctx, args) => {
    await versionFor(ctx, args.productionId, args.productionVersionId);
    const sequences = active(await ctx.db.query("sequences").withIndex("by_version", (q) => q.eq("productionVersionId", args.productionVersionId)).collect())
      .sort((a, b) => a.orderIndex - b.orderIndex);
    const nested = [];
    for (const sequence of sequences) {
      const scenes = active(await ctx.db.query("scenes").withIndex("by_sequence", (q) => q.eq("sequenceId", sequence._id)).collect())
        .sort((a, b) => a.orderIndex - b.orderIndex);
      const sceneRows = [];
      for (const scene of scenes) {
        const shots = active(await ctx.db.query("shots").withIndex("by_scene", (q) => q.eq("sceneId", scene._id)).collect())
          .sort((a, b) => a.orderIndex - b.orderIndex);
        const shotRows = [];
        for (const shot of shots) {
          const takes = (await ctx.db.query("shotVersions").withIndex("by_shot", (q) => q.eq("shotId", shot._id)).collect())
            .sort((a, b) => b.versionNumber - a.versionNumber);
          shotRows.push({ ...shot, takes });
        }
        sceneRows.push({ ...scene, shots: shotRows });
      }
      nested.push({ ...sequence, scenes: sceneRows });
    }
    return nested;
  },
});

export const getSequence = query({
  args: { sequenceId: v.id("sequences") },
  handler: async (ctx, args) => {
    const { sequence } = await sequenceFor(ctx, args.sequenceId);
    return sequence;
  },
});

export const getScene = query({
  args: { sceneId: v.id("scenes") },
  handler: async (ctx, args) => {
    const { scene } = await sceneFor(ctx, args.sceneId);
    return scene;
  },
});

export const getShot = query({
  args: { shotId: v.id("shots") },
  handler: async (ctx, args) => {
    const { shot } = await shotFor(ctx, args.shotId);
    const takes = (await ctx.db.query("shotVersions").withIndex("by_shot", (q) => q.eq("shotId", shot._id)).collect())
      .sort((a, b) => b.versionNumber - a.versionNumber);
    return { ...shot, takes };
  },
});

export const getTake = query({
  args: { shotVersionId: v.id("shotVersions") },
  handler: async (ctx, args) => {
    const { take } = await takeFor(ctx, args.shotVersionId);
    return take;
  },
});

export const createSequence = mutation({
  args: {
    productionId: v.id("productions"), productionVersionId: v.id("productionVersions"),
    title: v.string(), description: v.optional(v.string()), orderIndex: v.optional(v.number()), metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { production, version } = await editableVersion(ctx, args.productionId, args.productionVersionId);
    const title = text(args.title, "Sequence title", 200, true);
    const description = text(args.description, "Sequence description", 5_000);
    const existing = active(await ctx.db.query("sequences").withIndex("by_version", (q) => q.eq("productionVersionId", version._id)).collect());
    const index = orderIndex(args.orderIndex) ?? existing.length;
    const sequenceId = await ctx.db.insert("sequences", {
      studioExternalId: production.studioExternalId,
      studioId: production.studioId,
      projectId: production.projectId,
      productionId: production._id,
      productionVersionId: version._id,
      title,
      description,
      orderIndex: index,
      status: "DRAFT",
      metadata: args.metadata ?? {},
    });
    await stateForNewResource(ctx, production.projectId!, production._id, "sequence", sequenceId.toString());
    return await ctx.db.get(sequenceId);
  },
});

export const updateSequence = mutation({
  args: {
    sequenceId: v.id("sequences"), title: v.optional(v.string()), description: v.optional(v.string()),
    orderIndex: v.optional(v.number()), metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { production, sequence } = await sequenceFor(ctx, args.sequenceId);
    await editableVersion(ctx, production._id, sequence.productionVersionId);
    await resourceEditable(ctx, production.projectId!, production._id, "sequence", sequence._id.toString());
    const patch: Record<string, unknown> = {};
    if (args.title !== undefined) patch.title = text(args.title, "Sequence title", 200, true);
    if (args.description !== undefined) patch.description = text(args.description, "Sequence description", 5_000);
    if (args.orderIndex !== undefined) patch.orderIndex = orderIndex(args.orderIndex);
    if (args.metadata !== undefined) patch.metadata = args.metadata;
    if (Object.keys(patch).length === 0) return sequence;
    await ctx.db.patch(sequence._id, patch as never);
    return await ctx.db.get(sequence._id);
  },
});

export const reorderSequences = mutation({
  args: { productionId: v.id("productions"), productionVersionId: v.id("productionVersions"), orderedSequenceIds: v.array(v.id("sequences")) },
  handler: async (ctx, args) => {
    const { production, version } = await editableVersion(ctx, args.productionId, args.productionVersionId);
    const rows = active(await ctx.db.query("sequences").withIndex("by_version", (q) => q.eq("productionVersionId", version._id)).collect());
    assertCompleteOrdering(args.orderedSequenceIds.map(String), rows.map((row) => row._id.toString()), "Sequence");
    for (const [index, sequenceId] of args.orderedSequenceIds.entries()) {
      const sequence = await ctx.db.get(sequenceId);
      if (!sequence || sequence.productionId !== production._id) throw new Error("Sequence does not belong to this production.");
      await resourceEditable(ctx, production.projectId!, production._id, "sequence", sequence._id.toString());
      await ctx.db.patch(sequence._id, { orderIndex: index });
    }
    return active(await ctx.db.query("sequences").withIndex("by_version", (q) => q.eq("productionVersionId", version._id)).collect()).sort((a, b) => a.orderIndex - b.orderIndex);
  },
});

export const duplicateSequence = mutation({
  args: { sequenceId: v.id("sequences"), title: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { production, version, sequence } = await sequenceFor(ctx, args.sequenceId);
    await editableVersion(ctx, production._id, version._id);
    await resourceEditable(ctx, production.projectId!, production._id, "sequence", sequence._id.toString());
    const sequenceId = await ctx.db.insert("sequences", {
      studioExternalId: production.studioExternalId, studioId: production.studioId, projectId: production.projectId,
      productionId: production._id, productionVersionId: version._id, title: text(args.title, "Sequence title", 200) || `${sequence.title} copy`,
      description: sequence.description, orderIndex: sequence.orderIndex + 1, status: "DRAFT", metadata: sequence.metadata ?? {},
    });
    await stateForNewResource(ctx, production.projectId!, production._id, "sequence", sequenceId.toString());
    const scenes = active(await ctx.db.query("scenes").withIndex("by_sequence", (q) => q.eq("sequenceId", sequence._id)).collect()).sort((a, b) => a.orderIndex - b.orderIndex);
    for (const scene of scenes) {
      const sceneId = await ctx.db.insert("scenes", {
        studioExternalId: production.studioExternalId, studioId: production.studioId, projectId: production.projectId,
        productionId: production._id, productionVersionId: version._id, sequenceId, title: scene.title, purpose: scene.purpose,
        visualDirection: scene.visualDirection, orderIndex: scene.orderIndex, status: "DRAFT", metadata: scene.metadata ?? {},
      });
      await stateForNewResource(ctx, production.projectId!, production._id, "scene", sceneId.toString());
      const shots = active(await ctx.db.query("shots").withIndex("by_scene", (q) => q.eq("sceneId", scene._id)).collect()).sort((a, b) => a.orderIndex - b.orderIndex);
      for (const shot of shots) {
        const shotId = await ctx.db.insert("shots", {
          studioExternalId: production.studioExternalId, studioId: production.studioId, projectId: production.projectId,
          productionId: production._id, productionVersionId: version._id, sequenceId: sequenceId, sceneId,
          title: shot.title, prompt: shot.prompt, durationSeconds: shot.durationSeconds, orderIndex: shot.orderIndex,
          camera: shot.camera, requiredAssetIds: shot.requiredAssetIds, referencePackIds: shot.referencePackIds,
          status: "DRAFT", metadata: shot.metadata ?? {},
        });
        await stateForNewResource(ctx, production.projectId!, production._id, "shot", shotId.toString());
        await cloneTakes(ctx, shot._id, shotId, production, version);
      }
    }
    return await ctx.db.get(sequenceId);
  },
});

export const archiveSequence = mutation({
  args: { sequenceId: v.id("sequences") },
  handler: async (ctx, args) => {
    const { production, sequence } = await sequenceFor(ctx, args.sequenceId);
    await editableVersion(ctx, production._id, sequence.productionVersionId);
    await resourceEditable(ctx, production.projectId!, production._id, "sequence", sequence._id.toString());
    await ctx.db.patch(sequence._id, { status: "ARCHIVED" });
    const scenes = await ctx.db.query("scenes").withIndex("by_sequence", (q) => q.eq("sequenceId", sequence._id)).collect();
    for (const scene of scenes) await setSceneTreeStatus(ctx, production, scene._id, "ARCHIVED");
    return await ctx.db.get(sequence._id);
  },
});

export const deleteSequence = mutation({
  args: { sequenceId: v.id("sequences") },
  handler: async (ctx, args) => {
    const { production, sequence } = await sequenceFor(ctx, args.sequenceId);
    await editableVersion(ctx, production._id, sequence.productionVersionId);
    await resourceEditable(ctx, production.projectId!, production._id, "sequence", sequence._id.toString());
    await ctx.db.patch(sequence._id, { status: "DELETED" });
    const scenes = await ctx.db.query("scenes").withIndex("by_sequence", (q) => q.eq("sequenceId", sequence._id)).collect();
    for (const scene of scenes) await setSceneTreeStatus(ctx, production, scene._id, "DELETED");
    return await ctx.db.get(sequence._id);
  },
});

export const createScene = mutation({
  args: {
    sequenceId: v.id("sequences"), title: v.string(), purpose: v.string(), visualDirection: v.string(),
    orderIndex: v.optional(v.number()), metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { production, version, sequence } = await sequenceFor(ctx, args.sequenceId);
    await editableVersion(ctx, production._id, version._id);
    await resourceEditable(ctx, production.projectId!, production._id, "sequence", sequence._id.toString());
    const title = text(args.title, "Scene title", 200, true);
    const purpose = text(args.purpose, "Scene purpose", 10_000, true);
    const visualDirection = text(args.visualDirection, "Scene visual direction", 20_000, true);
    const existing = active(await ctx.db.query("scenes").withIndex("by_sequence", (q) => q.eq("sequenceId", sequence._id)).collect());
    const sceneId = await ctx.db.insert("scenes", {
      studioExternalId: production.studioExternalId, studioId: production.studioId, projectId: production.projectId,
      productionId: production._id, productionVersionId: version._id, sequenceId: sequence._id, title, purpose, visualDirection,
      orderIndex: orderIndex(args.orderIndex) ?? existing.length, status: "DRAFT", metadata: args.metadata ?? {},
    });
    await stateForNewResource(ctx, production.projectId!, production._id, "scene", sceneId.toString());
    return await ctx.db.get(sceneId);
  },
});

export const updateScene = mutation({
  args: {
    sceneId: v.id("scenes"), title: v.optional(v.string()), purpose: v.optional(v.string()), visualDirection: v.optional(v.string()),
    orderIndex: v.optional(v.number()), metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { production, scene } = await sceneFor(ctx, args.sceneId);
    await editableVersion(ctx, production._id, scene.productionVersionId!);
    await resourceEditable(ctx, production.projectId!, production._id, "scene", scene._id.toString());
    const patch: Record<string, unknown> = {};
    if (args.title !== undefined) patch.title = text(args.title, "Scene title", 200, true);
    if (args.purpose !== undefined) patch.purpose = text(args.purpose, "Scene purpose", 10_000, true);
    if (args.visualDirection !== undefined) patch.visualDirection = text(args.visualDirection, "Scene visual direction", 20_000, true);
    if (args.orderIndex !== undefined) patch.orderIndex = orderIndex(args.orderIndex);
    if (args.metadata !== undefined) patch.metadata = args.metadata;
    if (Object.keys(patch).length === 0) return scene;
    await ctx.db.patch(scene._id, patch as never);
    return await ctx.db.get(scene._id);
  },
});

export const reorderScenes = mutation({
  args: { sequenceId: v.id("sequences"), orderedSceneIds: v.array(v.id("scenes")) },
  handler: async (ctx, args) => {
    const { production, version, sequence } = await sequenceFor(ctx, args.sequenceId);
    await editableVersion(ctx, production._id, version._id);
    await resourceEditable(ctx, production.projectId!, production._id, "sequence", sequence._id.toString());
    const rows = active(await ctx.db.query("scenes").withIndex("by_sequence", (q) => q.eq("sequenceId", sequence._id)).collect());
    assertCompleteOrdering(args.orderedSceneIds.map(String), rows.map((row) => row._id.toString()), "Scene");
    for (const [index, sceneId] of args.orderedSceneIds.entries()) {
      const scene = await ctx.db.get(sceneId);
      if (!scene || scene.sequenceId !== sequence._id) throw new Error("Scene does not belong to this sequence.");
      await resourceEditable(ctx, production.projectId!, production._id, "scene", scene._id.toString());
      await ctx.db.patch(scene._id, { orderIndex: index });
    }
    return active(await ctx.db.query("scenes").withIndex("by_sequence", (q) => q.eq("sequenceId", sequence._id)).collect()).sort((a, b) => a.orderIndex - b.orderIndex);
  },
});

export const duplicateScene = mutation({
  args: { sceneId: v.id("scenes"), title: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { production, version, scene } = await sceneFor(ctx, args.sceneId);
    await editableVersion(ctx, production._id, version._id);
    await resourceEditable(ctx, production.projectId!, production._id, "scene", scene._id.toString());
    const sceneId = await ctx.db.insert("scenes", {
      studioExternalId: production.studioExternalId, studioId: production.studioId, projectId: production.projectId,
      productionId: production._id, productionVersionId: version._id, sequenceId: scene.sequenceId,
      title: text(args.title, "Scene title", 200) || `${scene.title} copy`, purpose: scene.purpose,
      visualDirection: scene.visualDirection, orderIndex: scene.orderIndex + 1, status: "DRAFT", metadata: scene.metadata ?? {},
    });
    await stateForNewResource(ctx, production.projectId!, production._id, "scene", sceneId.toString());
    const shots = active(await ctx.db.query("shots").withIndex("by_scene", (q) => q.eq("sceneId", scene._id)).collect()).sort((a, b) => a.orderIndex - b.orderIndex);
    for (const shot of shots) {
      const shotId = await ctx.db.insert("shots", {
        studioExternalId: production.studioExternalId, studioId: production.studioId, projectId: production.projectId,
        productionId: production._id, productionVersionId: version._id, sequenceId: scene.sequenceId, sceneId,
        title: shot.title, prompt: shot.prompt, durationSeconds: shot.durationSeconds, orderIndex: shot.orderIndex,
        camera: shot.camera, requiredAssetIds: shot.requiredAssetIds, referencePackIds: shot.referencePackIds,
        status: "DRAFT", metadata: shot.metadata ?? {},
      });
      await stateForNewResource(ctx, production.projectId!, production._id, "shot", shotId.toString());
      await cloneTakes(ctx, shot._id, shotId, production, version);
    }
    return await ctx.db.get(sceneId);
  },
});

export const archiveScene = mutation({
  args: { sceneId: v.id("scenes") },
  handler: async (ctx, args) => {
    const { production, scene } = await sceneFor(ctx, args.sceneId);
    await editableVersion(ctx, production._id, scene.productionVersionId!);
    await resourceEditable(ctx, production.projectId!, production._id, "scene", scene._id.toString());
    await setSceneTreeStatus(ctx, production, scene._id, "ARCHIVED");
    return await ctx.db.get(scene._id);
  },
});

export const deleteScene = mutation({
  args: { sceneId: v.id("scenes") },
  handler: async (ctx, args) => {
    const { production, scene } = await sceneFor(ctx, args.sceneId);
    await editableVersion(ctx, production._id, scene.productionVersionId!);
    await resourceEditable(ctx, production.projectId!, production._id, "scene", scene._id.toString());
    await setSceneTreeStatus(ctx, production, scene._id, "DELETED");
    return await ctx.db.get(scene._id);
  },
});

export const createShot = mutation({
  args: {
    sceneId: v.id("scenes"), title: v.string(), prompt: v.string(), durationSeconds: v.number(), orderIndex: v.optional(v.number()),
    camera: v.optional(v.any()), requiredAssetIds: v.optional(v.array(v.string())), referencePackIds: v.optional(v.array(v.id("referencePacks"))), metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { production, version, scene } = await sceneFor(ctx, args.sceneId);
    await editableVersion(ctx, production._id, version._id);
    await resourceEditable(ctx, production.projectId!, production._id, "scene", scene._id.toString());
    const title = text(args.title, "Shot title", 200, true);
    const prompt = text(args.prompt, "Shot prompt", 20_000, true);
    await assertProjectAssetReferences(ctx, production.projectId!, args.requiredAssetIds);
    await validateResourceBindings(ctx, production, version._id, args.metadata, args.requiredAssetIds ?? [], duration(args.durationSeconds));
    const existing = active(await ctx.db.query("shots").withIndex("by_scene", (q) => q.eq("sceneId", scene._id)).collect());
    const shotId = await ctx.db.insert("shots", {
      studioExternalId: production.studioExternalId, studioId: production.studioId, projectId: production.projectId,
      productionId: production._id, productionVersionId: version._id, sequenceId: scene.sequenceId, sceneId: scene._id,
      title, prompt, durationSeconds: duration(args.durationSeconds), orderIndex: orderIndex(args.orderIndex) ?? existing.length,
      camera: args.camera ?? {}, requiredAssetIds: stringList(args.requiredAssetIds, "Required asset IDs") ?? [],
      referencePackIds: args.referencePackIds, status: "DRAFT", metadata: args.metadata ?? {},
    });
    await stateForNewResource(ctx, production.projectId!, production._id, "shot", shotId.toString());
    return await ctx.db.get(shotId);
  },
});

function stableShotMetadata(value: unknown): string {
  return JSON.stringify(value ?? null, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key] ?? null])) : item);
}

export const updateShot = mutation({
  args: {
    shotId: v.id("shots"), title: v.optional(v.string()), prompt: v.optional(v.string()), durationSeconds: v.optional(v.number()),
    orderIndex: v.optional(v.number()), camera: v.optional(v.any()), requiredAssetIds: v.optional(v.array(v.string())),
    referencePackIds: v.optional(v.array(v.id("referencePacks"))), metadata: v.optional(v.any()), expectedMetadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { production, shot } = await shotFor(ctx, args.shotId);
    if (args.expectedMetadata !== undefined && stableShotMetadata(args.expectedMetadata) !== stableShotMetadata(shot.metadata)) throw new Error("SHOT_METADATA_CHANGED");
    await editableVersion(ctx, production._id, shot.productionVersionId!);
    await resourceEditable(ctx, production.projectId!, production._id, "shot", shot._id.toString());
    const patch: Record<string, unknown> = {};
    if (args.title !== undefined) patch.title = text(args.title, "Shot title", 200, true);
    if (args.prompt !== undefined) patch.prompt = text(args.prompt, "Shot prompt", 20_000, true);
    if (args.durationSeconds !== undefined) patch.durationSeconds = duration(args.durationSeconds);
    if (args.orderIndex !== undefined) patch.orderIndex = orderIndex(args.orderIndex);
    if (args.camera !== undefined) patch.camera = args.camera;
    if (args.requiredAssetIds !== undefined) {
      const requiredAssetIds = stringList(args.requiredAssetIds, "Required asset IDs") ?? [];
      await assertProjectAssetReferences(ctx, production.projectId!, requiredAssetIds);
      patch.requiredAssetIds = requiredAssetIds;
    }
    if (args.referencePackIds !== undefined) patch.referencePackIds = args.referencePackIds;
    if (args.metadata !== undefined || args.durationSeconds !== undefined || args.requiredAssetIds !== undefined) {
      await validateResourceBindings(ctx, production, shot.productionVersionId!, args.metadata ?? shot.metadata, args.requiredAssetIds ?? shot.requiredAssetIds ?? [], duration(args.durationSeconds ?? shot.durationSeconds));
    }
    if (args.metadata !== undefined) patch.metadata = args.metadata;
    if (Object.keys(patch).length === 0) return shot;
    await ctx.db.patch(shot._id, patch as never);
    return await ctx.db.get(shot._id);
  },
});

export const reorderShots = mutation({
  args: { sceneId: v.id("scenes"), orderedShotIds: v.array(v.id("shots")) },
  handler: async (ctx, args) => {
    const { production, version, scene } = await sceneFor(ctx, args.sceneId);
    await editableVersion(ctx, production._id, version._id);
    await resourceEditable(ctx, production.projectId!, production._id, "scene", scene._id.toString());
    const rows = active(await ctx.db.query("shots").withIndex("by_scene", (q) => q.eq("sceneId", scene._id)).collect());
    assertCompleteOrdering(args.orderedShotIds.map(String), rows.map((row) => row._id.toString()), "Shot");
    for (const [index, shotId] of args.orderedShotIds.entries()) {
      const shot = await ctx.db.get(shotId);
      if (!shot || shot.sceneId !== scene._id) throw new Error("Shot does not belong to this scene.");
      await resourceEditable(ctx, production.projectId!, production._id, "shot", shot._id.toString());
      await ctx.db.patch(shot._id, { orderIndex: index });
    }
    return active(await ctx.db.query("shots").withIndex("by_scene", (q) => q.eq("sceneId", scene._id)).collect()).sort((a, b) => a.orderIndex - b.orderIndex);
  },
});

export const duplicateShot = mutation({
  args: { shotId: v.id("shots"), title: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { production, version, shot } = await shotFor(ctx, args.shotId);
    await editableVersion(ctx, production._id, version._id);
    await resourceEditable(ctx, production.projectId!, production._id, "shot", shot._id.toString());
    const shotId = await ctx.db.insert("shots", {
      studioExternalId: production.studioExternalId, studioId: production.studioId, projectId: production.projectId,
      productionId: production._id, productionVersionId: version._id, sequenceId: shot.sequenceId, sceneId: shot.sceneId,
      title: text(args.title, "Shot title", 200) || `${shot.title} copy`, prompt: shot.prompt, durationSeconds: shot.durationSeconds,
      orderIndex: shot.orderIndex + 1, camera: shot.camera, requiredAssetIds: shot.requiredAssetIds,
      referencePackIds: shot.referencePackIds, status: "DRAFT", metadata: shot.metadata ?? {},
    });
    await stateForNewResource(ctx, production.projectId!, production._id, "shot", shotId.toString());
    return await ctx.db.get(shotId);
  },
});

export const archiveShot = mutation({
  args: { shotId: v.id("shots") },
  handler: async (ctx, args) => {
    const { production, shot } = await shotFor(ctx, args.shotId);
    await editableVersion(ctx, production._id, shot.productionVersionId!);
    await resourceEditable(ctx, production.projectId!, production._id, "shot", shot._id.toString());
    await setShotTreeStatus(ctx, production, shot._id, "ARCHIVED");
    return await ctx.db.get(shot._id);
  },
});

export const deleteShot = mutation({
  args: { shotId: v.id("shots") },
  handler: async (ctx, args) => {
    const { production, shot } = await shotFor(ctx, args.shotId);
    await editableVersion(ctx, production._id, shot.productionVersionId!);
    await resourceEditable(ctx, production.projectId!, production._id, "shot", shot._id.toString());
    await setShotTreeStatus(ctx, production, shot._id, "DELETED");
    return await ctx.db.get(shot._id);
  },
});

export const createTake = mutation({
  args: {
    shotId: v.id("shots"), promptSnapshot: v.optional(v.string()), contextSnapshot: v.optional(v.any()),
    model: v.optional(v.string()), provider: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { production, version, shot } = await shotFor(ctx, args.shotId);
    await editableVersion(ctx, production._id, version._id);
    await resourceEditable(ctx, production.projectId!, production._id, "shot", shot._id.toString());
    const takes = await ctx.db.query("shotVersions").withIndex("by_shot", (q) => q.eq("shotId", shot._id)).collect();
    const takeId = await ctx.db.insert("shotVersions", {
      studioExternalId: production.studioExternalId, studioId: production.studioId, projectId: production.projectId,
      productionId: production._id, productionVersionId: version._id, shotId: shot._id, versionNumber: Math.max(0, ...takes.map((take) => take.versionNumber)) + 1,
      status: "DRAFT", promptSnapshot: text(args.promptSnapshot ?? shot.prompt, "Prompt snapshot", 20_000, true),
      contextSnapshot: args.contextSnapshot ?? {}, model: text(args.model, "Model", 200) || undefined,
      provider: text(args.provider, "Provider", 200) || undefined, createdAt: timestamp(),
    });
    await stateForNewResource(ctx, production.projectId!, production._id, "shotVersion", takeId.toString());
    return await ctx.db.get(takeId);
  },
});

export const updateTake = mutation({
  args: {
    shotVersionId: v.id("shotVersions"), promptSnapshot: v.optional(v.string()), contextSnapshot: v.optional(v.any()),
    model: v.optional(v.string()), provider: v.optional(v.string()), assetId: v.optional(v.id("assets")),
  },
  handler: async (ctx, args) => {
    const { production, take } = await takeFor(ctx, args.shotVersionId);
    await editableVersion(ctx, production._id, take.productionVersionId!);
    await resourceEditable(ctx, production.projectId!, production._id, "shotVersion", take._id.toString());
    const patch: Record<string, unknown> = {};
    if (args.promptSnapshot !== undefined) patch.promptSnapshot = text(args.promptSnapshot, "Prompt snapshot", 20_000, true);
    if (args.contextSnapshot !== undefined) patch.contextSnapshot = args.contextSnapshot;
    if (args.model !== undefined) patch.model = text(args.model, "Model", 200) || undefined;
    if (args.provider !== undefined) patch.provider = text(args.provider, "Provider", 200) || undefined;
    if (args.assetId !== undefined) {
      const asset = await ctx.db.get(args.assetId);
      if (!asset || asset.projectId !== production.projectId) throw new Error("Take asset must belong to the same project.");
      patch.assetId = args.assetId;
    }
    if (Object.keys(patch).length === 0) return take;
    await ctx.db.patch(take._id, patch as never);
    return await ctx.db.get(take._id);
  },
});

export const archiveTake = mutation({
  args: { shotVersionId: v.id("shotVersions") },
  handler: async (ctx, args) => {
    const { production, take } = await takeFor(ctx, args.shotVersionId);
    await editableVersion(ctx, production._id, take.productionVersionId!);
    await resourceEditable(ctx, production.projectId!, production._id, "shotVersion", take._id.toString());
    await ctx.db.patch(take._id, { status: "ARCHIVED" });
    return await ctx.db.get(take._id);
  },
});

export const deleteTake = mutation({
  args: { shotVersionId: v.id("shotVersions") },
  handler: async (ctx, args) => {
    const { production, take } = await takeFor(ctx, args.shotVersionId);
    await editableVersion(ctx, production._id, take.productionVersionId!);
    await resourceEditable(ctx, production.projectId!, production._id, "shotVersion", take._id.toString());
    await ctx.db.patch(take._id, { status: "DELETED" });
    return await ctx.db.get(take._id);
  },
});
