import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireMember, requireProjectAccess, requireProjectRole } from "./authorization";
import { now } from "./_shared";
import { resolvePlanningContinuity } from "./continuityPlanning";
import { selectProjectProduction } from "./projectProductions";
import { paginationOptsValidator } from "convex/server";
import { resolveGenerationContinuity } from "./generationContinuity";

type ReadCtx = QueryCtx | MutationCtx;
type PlanRecord = Doc<"directorPlans">;

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stableSerialize(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

function fingerprint(value: unknown): string {
  let hash = 2166136261;
  for (const character of stableSerialize(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function planKey(plan: Pick<PlanRecord, "approval"> & { idempotencyKey?: string }): string | undefined {
  if (typeof plan.idempotencyKey === "string" && plan.idempotencyKey.trim()) return plan.idempotencyKey;
  const value = record(plan.approval).idempotencyKey;
  return typeof value === "string" ? value : undefined;
}

function requireIdempotencyKey(value: string) {
  const key = value.trim();
  if (key.length < 8 || key.length > 200) throw new Error("Idempotency key must be between 8 and 200 characters");
  return key;
}

async function authorizedProduction(ctx: ReadCtx, productionId: Id<"productions">) {
  const production = await ctx.db.get(productionId);
  if (!production) throw new Error("Production not found");
  if (production.projectId) {
    const access = await requireProjectAccess(ctx, production.projectId);
    if (access.project.studioExternalId !== production.studioExternalId) throw new Error("Production does not belong to this project");
    return production;
  }
  await requireMember(ctx, production.studioExternalId);
  return production;
}

async function findPlanByKey(ctx: ReadCtx, productionId: Id<"productions">, key: string) {
  const indexed = await ctx.db.query("directorPlans").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", key)).first();
  if (indexed?.productionId === productionId) return indexed;
  const legacyPlans = await ctx.db.query("directorPlans").withIndex("by_production", (q) => q.eq("productionId", productionId)).order("desc").take(200);
  return legacyPlans.find((plan) => planKey(plan) === key);
}

async function validatePlanGraph(ctx: ReadCtx, projectId: Id<"projects">, plan: unknown) {
  const sequences = record(plan).sequences;
  if (!Array.isArray(sequences) || !sequences.length || sequences.length > 60) throw new Error("A bounded sequence plan is required.");
  let shots = 0;
  let duration = 0;
  const assets = new Set<string>();
  for (const sequence of sequences) {
    const scenes = record(sequence).scenes;
    if (!Array.isArray(scenes) || scenes.length > 60) throw new Error("A bounded scene plan is required.");
    for (const scene of scenes) {
      const nested = record(scene).shots;
      if (!Array.isArray(nested) || nested.length > 200) throw new Error("A bounded shot plan is required.");
      for (const shotValue of nested) {
        const shot = record(shotValue);
        if (typeof shot.durationSeconds !== "number" || !Number.isFinite(shot.durationSeconds) || shot.durationSeconds <= 0) throw new Error("Every shot needs a positive duration.");
        duration += shot.durationSeconds;
        if (++shots > 200 || duration > 60) throw new Error("An episode must total at most 60 seconds and 200 shots.");
        if (!Array.isArray(shot.requiredAssetIds) || shot.requiredAssetIds.length > 12) throw new Error("Every shot needs a bounded asset list.");
        for (const id of shot.requiredAssetIds) {
          if (typeof id !== "string") throw new Error("Invalid project asset reference.");
          assets.add(id);
        }
      }
    }
  }
  if (!shots) throw new Error("A plan must contain at least one shot.");
  for (const value of assets) {
    const id = ctx.db.normalizeId("assets", value);
    const asset = id ? await ctx.db.get(id) : null;
    if (!asset || asset.projectId !== projectId || asset.scope === "GLOBAL" || asset.deletedAt) throw new Error("Every production asset must be owned by this project. Import global assets first.");
  }
}

async function ensureDraftVersion(ctx: MutationCtx, production: Doc<"productions">, plan: PlanRecord, key: string, timestamp: number) {
  const versions = await ctx.db.query("productionVersions").withIndex("by_production", (q) => q.eq("productionId", production._id)).collect();
  const existing = versions.find((version) => version.sourcePlanId === plan._id);
  if (existing) return existing;
  const versionNumber = Math.max(0, ...versions.map((version) => version.versionNumber)) + 1;
  const versionId = await ctx.db.insert("productionVersions", {
    productionId: production._id,
    versionNumber,
    status: "DRAFT",
    sourcePlanId: plan._id,
    idempotencyKey: key,
    snapshot: plan.plan,
    planningContextSnapshot: record(plan.input).continuityContext,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  return await ctx.db.get(versionId);
}

async function materializeApprovedPlan(ctx: MutationCtx, production: Doc<"productions">, version: Doc<"productionVersions">, plan: PlanRecord) {
  const existingBible = await ctx.db.query("productionBibles").withIndex("by_version", (q) => q.eq("productionVersionId", version._id)).first();
  const planData = record(plan.plan);
  const bible = record(planData.bible);
  if (version.status === "APPROVED" && !existingBible) await ctx.db.insert("productionBibles", {
    studioExternalId: production.studioExternalId,
    studioId: production.studioId,
    productionId: production._id,
    productionVersionId: version._id,
    versionNumber: version.versionNumber,
    projectContext: bible.projectContext ?? {},
    characters: bible.characters ?? [],
    locations: bible.locations ?? [],
    products: bible.products ?? [],
    style: bible.style ?? {},
    story: bible.story ?? {},
    createdAt: now(),
  });

  const existingGraph = await ctx.db.query("sequences").withIndex("by_version", (q) => q.eq("productionVersionId", version._id)).first();
  if (existingGraph) return;
  const graphStatus = version.status === "APPROVED" ? "APPROVED" as const : "DRAFT" as const;

  const sequences = Array.isArray(planData.sequences) ? planData.sequences : [];
  for (const sequenceValue of sequences) {
    const sequence = record(sequenceValue);
    const sequenceId = await ctx.db.insert("sequences", {
      studioExternalId: production.studioExternalId,
      studioId: production.studioId,
      projectId: production.projectId,
      productionId: production._id,
      productionVersionId: version._id,
      title: typeof sequence.title === "string" ? sequence.title : "Untitled sequence",
      description: typeof sequence.description === "string" ? sequence.description : "",
      orderIndex: typeof sequence.orderIndex === "number" ? sequence.orderIndex : 0,
      status: graphStatus,
    });
    const scenes = Array.isArray(sequence.scenes) ? sequence.scenes : [];
    for (const sceneValue of scenes) {
      const scene = record(sceneValue);
      const sceneId = await ctx.db.insert("scenes", {
        studioExternalId: production.studioExternalId,
        studioId: production.studioId,
        projectId: production.projectId,
        productionId: production._id,
        productionVersionId: version._id,
        sequenceId,
        title: typeof scene.title === "string" ? scene.title : "Untitled scene",
        purpose: typeof scene.purpose === "string" ? scene.purpose : "",
        visualDirection: typeof scene.visualDirection === "string" ? scene.visualDirection : "",
        orderIndex: typeof scene.orderIndex === "number" ? scene.orderIndex : 0,
        status: graphStatus,
      });
      const shots = Array.isArray(scene.shots) ? scene.shots : [];
      for (const shotValue of shots) {
        const shot = record(shotValue);
        await ctx.db.insert("shots", {
          studioExternalId: production.studioExternalId,
          studioId: production.studioId,
          projectId: production.projectId,
          productionId: production._id,
          productionVersionId: version._id,
          sequenceId,
          sceneId,
          title: typeof shot.title === "string" ? shot.title : "Untitled shot",
          prompt: typeof shot.prompt === "string" ? shot.prompt : "",
          durationSeconds: typeof shot.durationSeconds === "number" ? shot.durationSeconds : 1,
          orderIndex: typeof shot.orderIndex === "number" ? shot.orderIndex : 0,
          camera: shot.camera ?? {},
          requiredAssetIds: Array.isArray(shot.requiredAssetIds) ? shot.requiredAssetIds.filter((id): id is string => typeof id === "string") : [],
          metadata: record(shot.metadata),
          status: graphStatus,
        });
      }
    }
  }
}

/** Freeze the actual editable draft graph, including deliberate resource
 * bindings, rather than approving the stale original provider response. */
async function draftSnapshot(ctx: MutationCtx, version: Doc<"productionVersions">, original: unknown) {
  const sequences = await ctx.db.query("sequences").withIndex("by_version", (q) => q.eq("productionVersionId", version._id)).take(201);
  if (sequences.length > 200) throw new Error("This production has too many sequences.");
  const result = [];
  let totalShots = 0;
  let durationSeconds = 0;
  for (const sequence of sequences.filter((row) => row.status !== "DELETED" && row.status !== "ARCHIVED").sort((a, b) => a.orderIndex - b.orderIndex)) {
    const scenes = await ctx.db.query("scenes").withIndex("by_sequence", (q) => q.eq("sequenceId", sequence._id)).take(201);
    if (scenes.length > 200) throw new Error("This sequence has too many scenes.");
    const nested = [];
    for (const scene of scenes.filter((row) => row.status !== "DELETED" && row.status !== "ARCHIVED").sort((a, b) => a.orderIndex - b.orderIndex)) {
      const shots = await ctx.db.query("shots").withIndex("by_scene", (q) => q.eq("sceneId", scene._id)).take(201);
      if (shots.length > 200) throw new Error("This scene has too many shots.");
      const activeShots = shots.filter((row) => row.status !== "DELETED" && row.status !== "ARCHIVED").sort((a, b) => a.orderIndex - b.orderIndex);
      totalShots += activeShots.length;
      durationSeconds += activeShots.reduce((sum, shot) => sum + shot.durationSeconds, 0);
      nested.push({ title: scene.title, purpose: scene.purpose, visualDirection: scene.visualDirection, orderIndex: scene.orderIndex,
        shots: activeShots.map((shot) => ({ title: shot.title, prompt: shot.prompt, durationSeconds: shot.durationSeconds, orderIndex: shot.orderIndex, camera: shot.camera ?? {}, requiredAssetIds: shot.requiredAssetIds ?? [], metadata: shot.metadata ?? {} })) });
    }
    result.push({ title: sequence.title, description: sequence.description, orderIndex: sequence.orderIndex, scenes: nested });
  }
  if (totalShots < 1 || totalShots > 200 || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 60) throw new Error("An approved episode must contain shots totaling at most 60 seconds.");
  return { ...record(original), sequences: result };
}

export const createPlan = mutation({
  args: {
    studioExternalId: v.string(), projectExternalId: v.string(), workflow: v.string(), inputMode: v.string(),
    durationSeconds: v.number(), language: v.string(), outputPreset: v.string(), input: v.any(), plan: v.any(),
    estimate: v.any(), idempotencyKey: v.optional(v.string()), productionId: v.optional(v.id("productions")),
  },
  handler: async (ctx, args) => {
    const member = await requireMember(ctx, args.studioExternalId);
    const project = await ctx.db.query("projects").withIndex("by_external_id", (q) => q.eq("externalId", args.projectExternalId)).unique();
    if (!project || project.studioExternalId !== member.studio.externalId) throw new Error("Project not found");
    const access = await requireProjectRole(ctx, project._id, ["OWNER", "EDITOR"]);
    await validatePlanGraph(ctx, project._id, args.plan);

    let production = await selectProjectProduction(ctx, project, args.productionId);
    if (production && production.studioExternalId !== member.studio.externalId) throw new Error("Project not found");
    if (!production) {
      const productionId = await ctx.db.insert("productions", {
        externalProjectId: args.projectExternalId,
        projectId: project._id,
        projectType: project.projectType,
        plannedDurationSeconds: args.durationSeconds,
        studioExternalId: member.studio.externalId,
        studioId: member.studio._id,
        workflow: args.workflow,
        inputMode: args.inputMode,
        requestedDurationSeconds: args.durationSeconds,
        language: args.language,
        outputPreset: args.outputPreset,
        status: "PLANNING",
        createdByExternalId: member.identity.externalId,
        createdByUserId: member.user._id,
        createdAt: now(),
        updatedAt: now(),
      });
      production = await ctx.db.get(productionId);
    } else if (production.projectId && production.projectId !== project._id) {
      throw new Error("Production does not belong to this project");
    } else {
      await ctx.db.patch(production._id, {
        projectId: project._id,
        projectType: production.projectType ?? project.projectType,
        plannedDurationSeconds: args.durationSeconds,
        updatedAt: now(),
      });
      production = await ctx.db.get(production._id);
    }
    if (!production) throw new Error("Unable to create production");

    const sourceInput = record(args.input);
    const requestedBible = typeof sourceInput.continuityBibleId === "string" ? sourceInput.continuityBibleId : undefined;
    const bibleId = requestedBible ? ctx.db.normalizeId("continuityBibles", requestedBible) : undefined;
    if (requestedBible && !bibleId) throw new Error("Choose a valid approved project continuity bible.");
    const continuityContext = await resolvePlanningContinuity(ctx, project._id, production._id, bibleId ?? undefined);
    if (sourceInput.continuityContext && fingerprint(sourceInput.continuityContext) !== fingerprint(continuityContext)) throw new Error("Continuity changed while the plan was being prepared. Refresh its references and create a revised plan.");
    const canonicalInput = continuityContext ? { ...sourceInput, continuityContext } : sourceInput;

    const idempotencyKey = requireIdempotencyKey(args.idempotencyKey?.trim() || `canonical-plan:${args.projectExternalId}:${fingerprint({ input: canonicalInput, plan: args.plan, estimate: args.estimate })}`);
    const existingPlan = await findPlanByKey(ctx, production._id, idempotencyKey);
    if (existingPlan) {
      const timestamp = now();
      const version = await ensureDraftVersion(ctx, production, existingPlan, idempotencyKey, timestamp);
      if (version?.status === "DRAFT") await materializeApprovedPlan(ctx, production, version, existingPlan);
      if (version && version.status === "DRAFT") await ctx.db.patch(production._id, { currentPlanId: existingPlan._id, status: "PLANNING", updatedAt: timestamp });
      return { productionId: production._id, planId: existingPlan._id, versionId: version?._id, estimate: existingPlan.estimate };
    }

    const previousPlans = await ctx.db.query("directorPlans").withIndex("by_production", (q) => q.eq("productionId", production._id)).collect();
    const timestamp = now();
    const planId = await ctx.db.insert("directorPlans", {
      productionId: production._id,
      versionNumber: Math.max(0, ...previousPlans.map((plan) => plan.versionNumber ?? 0)) + 1,
      idempotencyKey,
      input: canonicalInput,
      plan: args.plan,
      estimate: args.estimate,
      status: "READY",
      approval: { state: "DRAFT", idempotencyKey },
      createdByExternalId: access.identity.externalId,
      createdByUserId: access.user._id,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const createdPlan = await ctx.db.get(planId);
    if (!createdPlan) throw new Error("Unable to create production plan");
    const version = await ensureDraftVersion(ctx, production, createdPlan, idempotencyKey, timestamp);
    if (version) await materializeApprovedPlan(ctx, production, version, createdPlan);
    await ctx.db.patch(production._id, { currentPlanId: planId, status: "PLANNING", updatedAt: timestamp });
    return { productionId: production._id, planId, versionId: version?._id, estimate: args.estimate };
  },
});

export const approvePlan = mutation({
  args: { planId: v.id("directorPlans"), idempotencyKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const planRecord = await ctx.db.get(args.planId);
    if (!planRecord) throw new Error("Plan not found");
    const production = await authorizedProduction(ctx, planRecord.productionId);
    if (!production.projectId) throw new Error("Production is not attached to a project");
    const access = await requireProjectRole(ctx, production.projectId, ["OWNER", "EDITOR"]);
    const existingVersion = await ctx.db.query("productionVersions").withIndex("by_source_plan", (q) => q.eq("sourcePlanId", planRecord._id)).first();
    if (existingVersion?.status === "APPROVED") return { productionId: production._id, versionId: existingVersion._id };
    if (planRecord.status === "SUPERSEDED") throw new Error("A superseded plan cannot be approved");
    if (planRecord.status !== "READY" && planRecord.status !== "DRAFT") throw new Error("Plan is not ready for approval");

    const timestamp = now();
    const key = requireIdempotencyKey(args.idempotencyKey?.trim() || `approval:${planRecord._id.toString()}`);
    const version = existingVersion ?? await ensureDraftVersion(ctx, production, planRecord, planKey(planRecord) || key, timestamp);
    if (!version) throw new Error("Unable to create production draft version");
    if (version.status !== "DRAFT") throw new Error("This production version cannot be approved");
    await materializeApprovedPlan(ctx, production, version, planRecord);
    const snapshot = await draftSnapshot(ctx, version, planRecord.plan);
    await validatePlanGraph(ctx, production.projectId, snapshot);
    const planningInput = record(planRecord.input);
    const bibleId = typeof planningInput.continuityBibleId === "string" ? ctx.db.normalizeId("continuityBibles", planningInput.continuityBibleId) : null;
    const currentContinuity = await resolvePlanningContinuity(ctx, production.projectId, production._id, bibleId ?? undefined);
    if (fingerprint(currentContinuity) !== fingerprint(version.planningContextSnapshot ?? null)) throw new Error("Continuity changed. Create a new draft before approving this plan.");
    for (const sequence of record(snapshot).sequences as Array<{ scenes: Array<{ shots: Array<{ requiredAssetIds: string[]; metadata: unknown }> }> }>) {
      for (const scene of sequence.scenes) for (const shot of scene.shots) await resolveGenerationContinuity(ctx, { projectId: production.projectId, productionId: production._id, snapshot: version.planningContextSnapshot, explicitResourceVersionIds: record(shot.metadata).resourceVersionIds, referenceAssetIds: shot.requiredAssetIds });
    }
    await ctx.db.patch(version._id, {
      status: "APPROVED",
      snapshot,
      approvedByUserId: access.user._id,
      approvedAt: timestamp,
      updatedAt: timestamp,
    });
    await materializeApprovedPlan(ctx, production, { ...version, status: "APPROVED", approvedAt: timestamp }, { ...planRecord, plan: snapshot });
    await ctx.db.patch(planRecord._id, { status: "APPROVED", plan: snapshot, approval: { ...record(planRecord.approval), state: "APPROVED", idempotencyKey: key, approvedAt: timestamp }, approvedAt: timestamp, updatedAt: timestamp });
    await ctx.db.patch(production._id, { status: "APPROVED", currentPlanId: planRecord._id, currentVersionId: version._id, updatedAt: timestamp });
    return { productionId: production._id, versionId: version._id };
  },
});

async function workspaceForProduction(ctx: ReadCtx, production: Doc<"productions">) {
  await authorizedProduction(ctx, production._id);
  const plan = production.currentPlanId ? await ctx.db.get(production.currentPlanId) : null;
  const draftVersion = production.currentPlanId
    ? await ctx.db.query("productionVersions").withIndex("by_source_plan", (q) => q.eq("sourcePlanId", production.currentPlanId!)).first()
    : null;
  const workspaceVersionId = draftVersion?.status === "DRAFT" ? draftVersion._id : production.currentVersionId ?? draftVersion?._id;
  if (!workspaceVersionId) return { production, version: null, plan, sequences: [], jobs: [] };
  const sequences = await ctx.db.query("sequences").withIndex("by_version", (q) => q.eq("productionVersionId", workspaceVersionId)).collect();
  const nested = [];
  for (const sequence of sequences.sort((a, b) => a.orderIndex - b.orderIndex)) {
    const scenes = await ctx.db.query("scenes").withIndex("by_sequence", (q) => q.eq("sequenceId", sequence._id)).collect();
    const sceneRows = [];
    for (const scene of scenes.sort((a, b) => a.orderIndex - b.orderIndex)) {
      const shots = await ctx.db.query("shots").withIndex("by_scene", (q) => q.eq("sceneId", scene._id)).collect();
      sceneRows.push({ ...scene, shots: shots.sort((a, b) => a.orderIndex - b.orderIndex) });
    }
    nested.push({ ...sequence, scenes: sceneRows });
  }
  const jobs = await ctx.db.query("generationJobs").withIndex("by_production", (q) => q.eq("productionId", production._id)).collect();
  return { production, version: await ctx.db.get(workspaceVersionId), plan, sequences: nested, jobs };
}

export const getWorkspace = query({
  args: { productionId: v.id("productions") },
  handler: async (ctx, args) => workspaceForProduction(ctx, await authorizedProduction(ctx, args.productionId)),
});

export const getWorkspaceByProject = query({
  args: { projectExternalId: v.string(), productionId: v.optional(v.id("productions")) },
  handler: async (ctx, args) => {
    const project = await ctx.db.query("projects").withIndex("by_external_id", (q) => q.eq("externalId", args.projectExternalId)).unique();
    if (!project) return { production: null, version: null, plan: null, sequences: [], jobs: [] };
    await requireProjectAccess(ctx, project._id);
    const production = await selectProjectProduction(ctx, project, args.productionId);
    if (!production) return { production: null, version: null, plan: null, sequences: [], jobs: [] };
    if (production.projectId && production.projectId !== project._id) throw new Error("Production does not belong to this project");
    return await workspaceForProduction(ctx, production);
  },
});

export const listByProject = query({
  args: { projectId: v.optional(v.id("projects")), projectExternalId: v.optional(v.string()), paginationOpts: paginationOptsValidator },
  returns: v.any(),
  handler: async (ctx, args) => {
    if (Boolean(args.projectId) === Boolean(args.projectExternalId)) throw new Error("One project selector is required.");
    const project = args.projectId ? await ctx.db.get(args.projectId) : await ctx.db.query("projects").withIndex("by_external_id", (q) => q.eq("externalId", args.projectExternalId!)).unique();
    if (!project) throw new Error("Project not found.");
    await requireProjectAccess(ctx, project._id);
    return await ctx.db.query("productions").withIndex("by_project", (q) => q.eq("externalProjectId", project.externalId)).order("desc").paginate(args.paginationOpts);
  },
});
