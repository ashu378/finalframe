import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getProduction, now, requireStudio } from "./_shared";

export const createPlan = mutation({
  args: { ownerExternalId: v.string(), studioExternalId: v.string(), projectExternalId: v.string(), workflow: v.string(), inputMode: v.string(), durationSeconds: v.number(), language: v.string(), outputPreset: v.string(), input: v.any(), plan: v.any(), estimate: v.any() },
  handler: async (ctx, args) => {
    await requireStudio(ctx, args.studioExternalId, args.ownerExternalId);
    let production = await ctx.db.query("productions").withIndex("by_project", (q) => q.eq("externalProjectId", args.projectExternalId)).unique();
    if (!production) production = await ctx.db.insert("productions", { externalProjectId: args.projectExternalId, studioExternalId: args.studioExternalId, workflow: args.workflow, inputMode: args.inputMode, requestedDurationSeconds: args.durationSeconds, language: args.language, outputPreset: args.outputPreset, status: "PLANNING", createdAt: now(), updatedAt: now() }).then((id) => ctx.db.get(id));
    if (!production) throw new Error("Unable to create production");
    const planId = await ctx.db.insert("directorPlans", { productionId: production._id, input: args.input, plan: args.plan, estimate: args.estimate, status: "READY", createdAt: now() });
    return { productionId: production._id, planId, estimate: args.estimate };
  },
});

export const approvePlan = mutation({
  args: { ownerExternalId: v.string(), planId: v.id("directorPlans") },
  handler: async (ctx, args) => {
    const planRecord = await ctx.db.get(args.planId);
    if (!planRecord) throw new Error("Plan not found");
    const production = await getProduction(ctx, planRecord.productionId.toString(), args.ownerExternalId);
    if (planRecord.status === "APPROVED" && production.currentVersionId) return { productionId: production._id, versionId: production.currentVersionId };
    const previous = await ctx.db.query("productionVersions").withIndex("by_production", (q) => q.eq("productionId", production._id)).collect();
    const versionId = await ctx.db.insert("productionVersions", { productionId: production._id, versionNumber: previous.length + 1, status: "APPROVED", sourcePlanId: args.planId, approvedAt: now(), createdAt: now() });
    const plan = planRecord.plan as any;
    await ctx.db.insert("productionBibles", { productionVersionId: versionId, projectContext: plan.bible?.projectContext ?? {}, characters: plan.bible?.characters ?? [], locations: plan.bible?.locations ?? [], products: plan.bible?.products ?? [], style: plan.bible?.style ?? {}, story: plan.bible?.story ?? {} });
    for (const sequence of plan.sequences ?? []) {
      const sequenceId = await ctx.db.insert("sequences", { productionVersionId: versionId, title: sequence.title, description: sequence.description ?? "", orderIndex: sequence.orderIndex ?? 0 });
      for (const scene of sequence.scenes ?? []) {
        const sceneId = await ctx.db.insert("scenes", { sequenceId, title: scene.title, purpose: scene.purpose ?? "", visualDirection: scene.visualDirection ?? "", orderIndex: scene.orderIndex ?? 0 });
        for (const shot of scene.shots ?? []) await ctx.db.insert("shots", { sceneId, title: shot.title, prompt: shot.prompt, durationSeconds: shot.durationSeconds, orderIndex: shot.orderIndex ?? 0, camera: shot.camera ?? {}, requiredAssetIds: shot.requiredAssetIds ?? [], status: "PLANNED" });
      }
    }
    await ctx.db.patch(args.planId, { status: "APPROVED", approvedAt: now() });
    await ctx.db.patch(production._id, { status: "APPROVED", currentVersionId: versionId, updatedAt: now() });
    return { productionId: production._id, versionId };
  },
});

export const getWorkspace = query({
  args: { ownerExternalId: v.string(), productionId: v.id("productions") },
  handler: async (ctx, args) => {
    const production = await getProduction(ctx, args.productionId.toString(), args.ownerExternalId);
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
  args: { ownerExternalId: v.string(), projectExternalId: v.string() },
  handler: async (ctx, args) => {
    const production = await ctx.db.query("productions").withIndex("by_project", (q) => q.eq("externalProjectId", args.projectExternalId)).unique();
    if (!production) return { production: null, version: null, sequences: [], jobs: [] };
    await requireStudio(ctx, production.studioExternalId, args.ownerExternalId);
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
