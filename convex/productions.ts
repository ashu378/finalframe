import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getProduction, now, requireStudio } from "./_shared";
import { requireMember } from "./authorization";

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stableSerialize(value: unknown): string {
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

function planKey(plan: { approval?: unknown }): string | undefined {
  const value = record(plan.approval).idempotencyKey;
  return typeof value === "string" ? value : undefined;
}

export const createPlan = mutation({
  args: { studioExternalId: v.string(), projectExternalId: v.string(), workflow: v.string(), inputMode: v.string(), durationSeconds: v.number(), language: v.string(), outputPreset: v.string(), input: v.any(), plan: v.any(), estimate: v.any(), idempotencyKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const member = await requireMember(ctx, args.studioExternalId);
    const project = await ctx.db.query("projects").withIndex("by_external_id", (q) => q.eq("externalId", args.projectExternalId)).unique();
    if (!project || project.studioExternalId !== member.studio.externalId) throw new Error("Project not found");

    let production = await ctx.db.query("productions").withIndex("by_project", (q) => q.eq("externalProjectId", args.projectExternalId)).unique();
    if (production && production.studioExternalId !== member.studio.externalId) throw new Error("Project not found");
    if (!production) production = await ctx.db.insert("productions", { externalProjectId: args.projectExternalId, projectId: project._id, studioExternalId: member.studio.externalId, studioId: member.studio._id, workflow: args.workflow, inputMode: args.inputMode, requestedDurationSeconds: args.durationSeconds, language: args.language, outputPreset: args.outputPreset, status: "PLANNING", createdByExternalId: member.identity.externalId, createdByUserId: member.user._id, createdAt: now(), updatedAt: now() }).then((id) => ctx.db.get(id));
    if (!production) throw new Error("Unable to create production");

    const idempotencyKey = args.idempotencyKey?.trim() || `legacy-plan:${args.projectExternalId}:${fingerprint({ input: args.input, plan: args.plan, estimate: args.estimate })}`;
    if (idempotencyKey.length < 8 || idempotencyKey.length > 200) throw new Error("Idempotency key must be between 8 and 200 characters");
    const existingPlan = (await ctx.db.query("directorPlans").withIndex("by_production", (q) => q.eq("productionId", production._id)).collect()).find((plan) => planKey(plan) === idempotencyKey);
    if (existingPlan) return { productionId: production._id, planId: existingPlan._id, estimate: existingPlan.estimate };

    const previousPlans = await ctx.db.query("directorPlans").withIndex("by_production", (q) => q.eq("productionId", production._id)).collect();
    const timestamp = now();
    const planId = await ctx.db.insert("directorPlans", { productionId: production._id, versionNumber: Math.max(0, ...previousPlans.map((plan) => plan.versionNumber ?? 0)) + 1, input: args.input, plan: args.plan, estimate: args.estimate, status: "READY", approval: { state: "DRAFT", idempotencyKey }, createdByExternalId: member.identity.externalId, createdByUserId: member.user._id, createdAt: timestamp, updatedAt: timestamp });
    await ctx.db.patch(production._id, { currentPlanId: planId, status: "PLANNING", updatedAt: timestamp });
    return { productionId: production._id, planId, estimate: args.estimate };
  },
});

export const approvePlan = mutation({
  args: { planId: v.id("directorPlans") },
  handler: async (ctx, args) => {
    const planRecord = await ctx.db.get(args.planId);
    if (!planRecord) throw new Error("Plan not found");
    const production = await ctx.db.get(planRecord.productionId);
    if (!production) throw new Error("Production not found");
    await requireMember(ctx, production.studioExternalId);
    const existingVersion = (await ctx.db.query("productionVersions").withIndex("by_production", (q) => q.eq("productionId", production._id)).collect()).find((version) => version.sourcePlanId === planRecord._id);
    if (existingVersion) return { productionId: production._id, versionId: existingVersion._id };
    if (planRecord.status === "SUPERSEDED") throw new Error("A superseded plan cannot be approved");
    if (planRecord.status !== "READY" && planRecord.status !== "DRAFT") throw new Error("Plan is not ready for approval");
    const previous = await ctx.db.query("productionVersions").withIndex("by_production", (q) => q.eq("productionId", production._id)).collect();
    const timestamp = now();
    const versionId = await ctx.db.insert("productionVersions", { productionId: production._id, versionNumber: Math.max(0, ...previous.map((version) => version.versionNumber)) + 1, status: "APPROVED", sourcePlanId: args.planId, approvedAt: timestamp, createdAt: timestamp });
    const plan = planRecord.plan as any;
    await ctx.db.insert("productionBibles", { productionVersionId: versionId, projectContext: plan.bible?.projectContext ?? {}, characters: plan.bible?.characters ?? [], locations: plan.bible?.locations ?? [], products: plan.bible?.products ?? [], style: plan.bible?.style ?? {}, story: plan.bible?.story ?? {} });
    for (const sequence of plan.sequences ?? []) {
      const sequenceId = await ctx.db.insert("sequences", { productionVersionId: versionId, title: sequence.title, description: sequence.description ?? "", orderIndex: sequence.orderIndex ?? 0 });
      for (const scene of sequence.scenes ?? []) {
        const sceneId = await ctx.db.insert("scenes", { sequenceId, title: scene.title, purpose: scene.purpose ?? "", visualDirection: scene.visualDirection ?? "", orderIndex: scene.orderIndex ?? 0 });
        for (const shot of scene.shots ?? []) await ctx.db.insert("shots", { sceneId, title: shot.title, prompt: shot.prompt, durationSeconds: shot.durationSeconds, orderIndex: shot.orderIndex ?? 0, camera: shot.camera ?? {}, requiredAssetIds: shot.requiredAssetIds ?? [], status: "PLANNING" });
      }
    }
    await ctx.db.patch(args.planId, { status: "APPROVED", approval: { ...record(planRecord.approval), state: "APPROVED", idempotencyKey: `approval:${args.planId.toString()}`, approvedAt: timestamp }, approvedAt: timestamp, updatedAt: timestamp });
    await ctx.db.patch(production._id, { status: "APPROVED", currentPlanId: args.planId, currentVersionId: versionId, updatedAt: timestamp });
    return { productionId: production._id, versionId };
  },
});

export const getWorkspace = query({
  args: { productionId: v.id("productions") },
  handler: async (ctx, args) => {
    const production = await getProduction(ctx, args.productionId.toString());
    if (!production.currentVersionId) return { production, version: null, sequences: [], jobs: [] };
    const sequences = await ctx.db.query("sequences").withIndex("by_version", (q) => q.eq("productionVersionId", production.currentVersionId!)).collect();
    const nested = [];
    for (const sequence of sequences.sort((a, b) => a.orderIndex - b.orderIndex)) {
      const scenes = await ctx.db.query("scenes").withIndex("by_sequence", (q) => q.eq("sequenceId", sequence._id)).collect();
      const sceneRows = [];
      for (const scene of scenes.sort((a, b) => a.orderIndex - b.orderIndex)) sceneRows.push({ ...scene, shots: (await ctx.db.query("shots").withIndex("by_scene", (q) => q.eq("sceneId", scene._id)).collect()).sort((a, b) => a.orderIndex - b.orderIndex) });
      nested.push({ ...sequence, scenes: sceneRows });
    }
    const jobs = await ctx.db.query("generationJobs").withIndex("by_production", (q) => q.eq("productionId", production._id)).collect();
    return { production, version: await ctx.db.get(production.currentVersionId), sequences: nested, jobs };
  },
});

export const getWorkspaceByProject = query({
  args: { projectExternalId: v.string() },
  handler: async (ctx, args) => {
    const production = await ctx.db.query("productions").withIndex("by_project", (q) => q.eq("externalProjectId", args.projectExternalId)).unique();
    if (!production) return { production: null, version: null, sequences: [], jobs: [] };
    await requireStudio(ctx, production.studioExternalId);
    if (!production.currentVersionId) return { production, version: null, sequences: [], jobs: [] };
    const sequences = await ctx.db.query("sequences").withIndex("by_version", (q) => q.eq("productionVersionId", production.currentVersionId!)).collect();
    const nested = [];
    for (const sequence of sequences.sort((a, b) => a.orderIndex - b.orderIndex)) {
      const scenes = await ctx.db.query("scenes").withIndex("by_sequence", (q) => q.eq("sequenceId", sequence._id)).collect();
      const sceneRows = [];
      for (const scene of scenes.sort((a, b) => a.orderIndex - b.orderIndex)) sceneRows.push({ ...scene, shots: (await ctx.db.query("shots").withIndex("by_scene", (q) => q.eq("sceneId", scene._id)).collect()).sort((a, b) => a.orderIndex - b.orderIndex) });
      nested.push({ ...sequence, scenes: sceneRows });
    }
    const jobs = await ctx.db.query("generationJobs").withIndex("by_production", (q) => q.eq("productionId", production._id)).collect();
    return { production, version: await ctx.db.get(production.currentVersionId), sequences: nested, jobs };
  },
});
