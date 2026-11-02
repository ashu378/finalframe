import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireCurrentMember, requireProjectRole } from "./authorization";
import { softDeleteProject } from "./projects";

/**
 * Development-only fixture helpers.  This module is deliberately separate
 * from production mutations: it is guarded by an explicit environment flag
 * and a secret that is never sent to the browser.
 */

const FIXTURE_MARKER = "finalframe-dev-fixture-v1";
const DEFAULT_PROJECT_EXTERNAL_ID = "finalframe_dev_fixture_v1";
const fixtureRef = v.object({
  assetId: v.id("assets"),
  url: v.string(),
  checksum: v.string(),
  mimeType: v.string(),
  name: v.string(),
  role: v.string(),
  durationSeconds: v.optional(v.number()),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
});

function timestamp() {
  return Date.now();
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function fixtureObject(value: unknown) {
  return { ...object(value), fixtureMarker: FIXTURE_MARKER };
}

function assertFixtureEnabled(key: string) {
  if (process.env.FINALFRAME_DEV_FIXTURES !== "true" || process.env.FINALFRAME_DEV_FIXTURE_ENV !== "development") {
    throw new Error("Development fixtures are disabled. Set FINALFRAME_DEV_FIXTURES=true and FINALFRAME_DEV_FIXTURE_ENV=development on the development deployment.");
  }
  // Convex cloud development deployments execute functions with NODE_ENV set
  // to "production". The explicit deployment-scoped flag above is therefore
  // the source of truth here; it is only configured on the FinalFrame dev
  // deployment and is paired with the private fixture key.
  const configured = process.env.FINALFRAME_DEV_FIXTURE_KEY?.trim();
  if (!configured || key !== configured) throw new Error("Invalid development fixture key.");
}

async function owner(ctx: MutationCtx) {
  const member = await requireCurrentMember(ctx);
  if (member.role !== "owner" && member.role !== "admin") {
    throw new Error("Only a studio owner or admin may run development fixtures.");
  }
  return member;
}

async function projectFor(ctx: MutationCtx, externalId: string, includeDeleted = false) {
  const member = await owner(ctx);
  const project = await ctx.db.query("projects").withIndex("by_external_id", (q) => q.eq("externalId", externalId)).unique();
  if (project && project.studioExternalId !== member.studio.externalId) throw new Error("Fixture project belongs to another studio.");
  if (project && !includeDeleted && project.deletedAt) throw new Error("Fixture project is soft-deleted; run reset before reseeding.");
  return { member, project };
}

export const ensureProject = mutation({
  args: {
    fixtureKey: v.string(),
    externalId: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertFixtureEnabled(args.fixtureKey);
    const externalId = args.externalId?.trim() || DEFAULT_PROJECT_EXTERNAL_ID;
    const { member, project } = await projectFor(ctx, externalId);
    if (project) {
      const metadata = object(project.metadata);
      if (metadata.fixtureMarker !== FIXTURE_MARKER) throw new Error("The deterministic fixture project key is already used by a non-fixture project.");
      await requireProjectRole(ctx, project._id, ["OWNER", "EDITOR"]);
      return { projectId: project._id, externalId: project.externalId, productionId: undefined, userId: member.user._id, studioExternalId: member.studio.externalId };
    }

    const now = timestamp();
    const projectId = await ctx.db.insert("projects", {
      externalId,
      studioExternalId: member.studio.externalId,
      studioId: member.studio._id,
      name: args.name?.trim() || "FinalFrame deterministic fixture",
      description: "Development-only fixture project; safe to reset before launch.",
      projectType: "FIXTURE",
      status: "DRAFT",
      metadata: { fixtureMarker: FIXTURE_MARKER, fixtureVersion: 1 },
      createdByExternalId: member.identity.externalId,
      createdByUserId: member.user._id,
      ownerUserId: member.user._id,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("projectMembers", {
      projectId,
      userId: member.user._id,
      role: "OWNER",
      status: "ACTIVE",
      invitedByUserId: member.user._id,
      createdAt: now,
      updatedAt: now,
    });
    return { projectId, externalId, productionId: undefined, userId: member.user._id, studioExternalId: member.studio.externalId };
  },
});

export const seedGraph = mutation({
  args: {
    fixtureKey: v.string(),
    projectExternalId: v.string(),
    planId: v.id("directorPlans"),
    approvedVersionId: v.id("productionVersions"),
    assets: v.array(fixtureRef),
    globalAsset: v.optional(fixtureRef),
  },
  handler: async (ctx, args) => {
    assertFixtureEnabled(args.fixtureKey);
    const { member, project } = await projectFor(ctx, args.projectExternalId);
    if (!project) throw new Error("Fixture project does not exist.");
    await requireProjectRole(ctx, project._id, ["OWNER", "EDITOR"]);

    const plan = await ctx.db.get(args.planId);
    if (!plan) throw new Error("Canonical fixture plan was not found.");
    const production = await ctx.db.get(plan.productionId);
    if (!production || production.projectId !== project._id) throw new Error("Fixture plan does not belong to the fixture project.");
    const approvedVersion = await ctx.db.get(args.approvedVersionId);
    if (!approvedVersion || approvedVersion.productionId !== production._id || approvedVersion.status !== "APPROVED") {
      throw new Error("The canonical approved production version is missing.");
    }

    const assetRefs = args.assets;
    if (assetRefs.length < 2) throw new Error("The fixture requires a project image and a short video asset.");
    for (const ref of assetRefs) {
      const asset = await ctx.db.get(ref.assetId);
      if (!asset || asset.projectId !== project._id || asset.scope !== "PROJECT" || !asset.storageId || asset.checksum !== ref.checksum) {
        throw new Error(`Fixture asset ${ref.name} is not project-scoped or has a mismatched checksum.`);
      }
      // Keep project-library ownership intact. Fixture setup must not hide
      // an assembly defect by assigning uploaded assets to this production.
      const metadata = object(asset.metadata);
      await ctx.db.patch(asset._id, {
        metadata: { ...metadata, fixtureProjectExternalId: project.externalId },
        updatedAt: timestamp(),
      });
    }
    if (args.globalAsset) {
      const global = await ctx.db.get(args.globalAsset.assetId);
      if (!global || global.scope !== "GLOBAL" || global.projectId || !global.storageId) throw new Error("Global fixture probe is not global.");
    }

    const versions = await ctx.db.query("productionVersions").withIndex("by_production", (q) => q.eq("productionId", production._id)).collect();
    let draftVersion = versions.find((version) => version.status === "DRAFT" && object(version.snapshot).fixtureMarker === FIXTURE_MARKER);
    if (!draftVersion) {
      const now = timestamp();
      const createdDraftVersion = await ctx.db.get(await ctx.db.insert("productionVersions", {
        productionId: production._id,
        versionNumber: Math.max(0, ...versions.map((version) => version.versionNumber)) + 1,
        status: "DRAFT",
        sourcePlanId: plan._id,
        idempotencyKey: `${FIXTURE_MARKER}:draft`,
        snapshot: { ...object(approvedVersion.snapshot), fixtureMarker: FIXTURE_MARKER, immutableApprovedVersionId: approvedVersion._id.toString() },
        createdAt: now,
        updatedAt: now,
      }));
      draftVersion = createdDraftVersion ?? undefined;
    }
    if (!draftVersion) throw new Error("Unable to create the fixture draft version.");

    const sequences = await ctx.db.query("sequences").withIndex("by_version", (q) => q.eq("productionVersionId", approvedVersion._id)).collect();
    const sequence = sequences.sort((a, b) => a.orderIndex - b.orderIndex)[0];
    if (!sequence) throw new Error("Canonical approval did not materialize a fixture sequence.");
    const scenes = await ctx.db.query("scenes").withIndex("by_sequence", (q) => q.eq("sequenceId", sequence._id)).collect();
    const scene = scenes.sort((a, b) => a.orderIndex - b.orderIndex)[0];
    if (!scene) throw new Error("Canonical approval did not materialize a fixture scene.");
    const shots = (await ctx.db.query("shots").withIndex("by_scene", (q) => q.eq("sceneId", scene._id)).collect()).sort((a, b) => a.orderIndex - b.orderIndex);
    if (shots.length < 2) throw new Error("Canonical approval did not materialize two fixture shots.");

    const takeIds: Id<"shotVersions">[] = [];
    const resourceStateIds: Id<"resourceStates">[] = [];
    for (const [index, shot] of shots.slice(0, 2).entries()) {
      const takes = await ctx.db.query("shotVersions").withIndex("by_shot", (q) => q.eq("shotId", shot._id)).collect();
      let take = takes.find((candidate) => object(candidate.contextSnapshot).fixtureMarker === FIXTURE_MARKER);
      const asset = assetRefs[index % assetRefs.length];
      if (!take) {
        const now = timestamp();
        const takeId = await ctx.db.insert("shotVersions", {
          studioExternalId: member.studio.externalId,
          studioId: member.studio._id,
          projectId: project._id,
          productionId: production._id,
          productionVersionId: approvedVersion._id,
          shotId: shot._id,
          versionNumber: Math.max(0, ...takes.map((candidate) => candidate.versionNumber)) + 1,
          status: "COMPLETED",
          assetId: asset.assetId,
          promptSnapshot: `Deterministic fixture take ${index + 1}`,
          contextSnapshot: { fixtureMarker: FIXTURE_MARKER, reviewed: true, reviewStatus: "APPROVED", qualityGateStatus: "PASS" },
          model: "fixture/deterministic",
          provider: "finalframe-fixture",
          actualCost: 0,
          createdAt: now,
        });
        take = (await ctx.db.get(takeId)) ?? undefined;
      }
      if (!take) throw new Error("Unable to create fixture take.");
      takeIds.push(take._id);
      const existingState = await ctx.db.query("resourceStates").withIndex("by_project_resource", (q) => q.eq("projectId", project._id).eq("resourceType", "shotVersion").eq("resourceId", take!._id.toString())).unique();
      if (!existingState) {
        resourceStateIds.push(await ctx.db.insert("resourceStates", {
          projectId: project._id,
          productionId: production._id,
          resourceType: "shotVersion",
          resourceId: take._id.toString(),
          state: "DRAFT",
          createdAt: timestamp(),
          updatedAt: timestamp(),
        }));
      } else resourceStateIds.push(existingState._id);
    }

    let timeline = (await ctx.db.query("timelines").withIndex("by_production", (q) => q.eq("productionId", production._id)).collect()).find((candidate) => object(object(candidate.tracks).metadata).fixtureMarker === FIXTURE_MARKER);
    if (!timeline) {
      const now = timestamp();
      const timelineId = await ctx.db.insert("timelines", {
        studioExternalId: member.studio.externalId,
        studioId: member.studio._id,
        projectId: project._id,
        productionId: production._id,
        selectionScope: "FULL_PROJECT",
        versionNumber: 1,
        durationSeconds: 4,
        tracks: { productionVersionId: approvedVersion._id, metadata: { productionVersionId: approvedVersion._id, fixtureMarker: FIXTURE_MARKER, approvalStatus: "APPROVED", fps: 30 }, items: [] },
        outputPreset: "SOCIAL_VERTICAL",
        status: "APPROVED",
        createdByUserId: member.user._id,
        createdAt: now,
        updatedAt: now,
      });
      const trackId = await ctx.db.insert("timelineTracks", {
        studioExternalId: member.studio.externalId,
        studioId: member.studio._id,
        timelineId,
        kind: "VIDEO",
        name: "Fixture takes",
        orderIndex: 0,
        metadata: { fixtureMarker: FIXTURE_MARKER },
      });
      for (const [index, takeId] of takeIds.entries()) {
        await ctx.db.insert("timelineClips", {
          studioExternalId: member.studio.externalId,
          studioId: member.studio._id,
          timelineId,
          trackId,
          assetId: assetRefs[index % assetRefs.length].assetId,
          shotVersionId: takeId,
          startSeconds: index * 2,
          durationSeconds: 2,
          metadata: { fixtureMarker: FIXTURE_MARKER, orderIndex: index, sceneId: scene._id.toString() },
        });
      }
      timeline = (await ctx.db.get(timelineId)) ?? undefined;
    }
    if (!timeline) throw new Error("Unable to create the fixture timeline.");
    const timelineState = await ctx.db.query("resourceStates").withIndex("by_project_resource", (q) => q.eq("projectId", project._id).eq("resourceType", "timeline").eq("resourceId", timeline!._id.toString())).unique();
    if (!timelineState) await ctx.db.insert("resourceStates", { projectId: project._id, productionId: production._id, resourceType: "timeline", resourceId: timeline._id.toString(), state: "DRAFT", createdAt: timestamp(), updatedAt: timestamp() });

    return {
      fixtureMarker: FIXTURE_MARKER,
      projectId: project._id,
      productionId: production._id,
      planId: plan._id,
      draftVersionId: draftVersion._id,
      approvedVersionId: approvedVersion._id,
      sequenceId: sequence._id,
      sceneId: scene._id,
      shotIds: shots.slice(0, 2).map((shot) => shot._id),
      takeIds,
      timelineId: timeline._id,
      resourceStateIds,
    };
  },
});

export const queueRender = mutation({
  args: {
    fixtureKey: v.string(),
    manifestId: v.id("manifests"),
    timelineId: v.id("timelines"),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    assertFixtureEnabled(args.fixtureKey);
    const member = await owner(ctx);
    const manifest = await ctx.db.get(args.manifestId);
    if (!manifest || manifest.contractVersion !== 4 || object(manifest.manifest).version !== 4 || !manifest.projectId) throw new Error("Fixture render requires manifest v4.");
    const project = await ctx.db.get(manifest.projectId);
    if (!project || object(project.metadata).fixtureMarker !== FIXTURE_MARKER || project.studioExternalId !== member.studio.externalId) throw new Error("Manifest is not the deterministic fixture.");
    if (manifest.timelineId !== args.timelineId) throw new Error("Fixture timeline and manifest do not match.");
    const existing = await ctx.db.query("renderJobs").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey)).unique();
    if (existing) return { job: existing, export: await ctx.db.query("exports").withIndex("by_render_job", (q) => q.eq("renderJobId", existing._id)).first() };
    const now = timestamp();
    const jobId = await ctx.db.insert("renderJobs", {
      studioExternalId: member.studio.externalId,
      studioId: member.studio._id,
      projectId: manifest.projectId,
      productionId: manifest.productionId,
      timelineId: args.timelineId,
      manifestId: manifest._id,
      selectionScope: manifest.selectionScope,
      exportScope: manifest.exportScope,
      operation: "FIXTURE_RENDER",
      preset: "SOCIAL_VERTICAL",
      status: "QUEUED",
      idempotencyKey: args.idempotencyKey,
      requestHash: FIXTURE_MARKER,
      progress: 0,
      estimatedCost: 0,
      createdAt: now,
      updatedAt: now,
    });
    const exportId = await ctx.db.insert("exports", {
      studioExternalId: member.studio.externalId,
      studioId: member.studio._id,
      projectId: manifest.projectId,
      productionId: manifest.productionId,
      renderJobId: jobId,
      manifestId: manifest._id,
      selectionScope: manifest.selectionScope,
      exportScope: manifest.exportScope,
      preset: "SOCIAL_VERTICAL",
      status: "PROCESSING",
      progress: 0,
      createdAt: now,
    });
    return { job: await ctx.db.get(jobId), export: await ctx.db.get(exportId) };
  },
});

export const regenerateTake = mutation({
  args: { fixtureKey: v.string(), shotVersionId: v.id("shotVersions"), timelineId: v.id("timelines") },
  handler: async (ctx, args) => {
    assertFixtureEnabled(args.fixtureKey);
    const member = await owner(ctx);
    const previous = await ctx.db.get(args.shotVersionId);
    if (!previous || previous.provider !== "finalframe-fixture" || !previous.projectId || !previous.productionId) throw new Error("Only a fixture take may be regenerated by this helper.");
    const project = await ctx.db.get(previous.projectId);
    if (!project || object(project.metadata).fixtureMarker !== FIXTURE_MARKER || project.studioExternalId !== member.studio.externalId) throw new Error("Fixture take does not belong to the active fixture project.");
    const takes = await ctx.db.query("shotVersions").withIndex("by_shot", (q) => q.eq("shotId", previous.shotId)).collect();
    const existing = takes.find((candidate) => candidate.versionNumber > previous.versionNumber && object(candidate.contextSnapshot).fixtureMarker === FIXTURE_MARKER);
    if (existing) return { previousTakeId: previous._id, newTakeId: existing._id, replayed: true };
    const nextId = await ctx.db.insert("shotVersions", {
      studioExternalId: previous.studioExternalId,
      studioId: previous.studioId,
      projectId: previous.projectId,
      productionId: previous.productionId,
      productionVersionId: previous.productionVersionId,
      shotId: previous.shotId,
      versionNumber: Math.max(...takes.map((take) => take.versionNumber)) + 1,
      status: "COMPLETED",
      assetId: previous.assetId,
      promptSnapshot: `${previous.promptSnapshot ?? "Fixture take"} (regenerated)`,
      contextSnapshot: fixtureObject({ reviewed: true, reviewStatus: "APPROVED", qualityGateStatus: "PASS", regeneratedFrom: previous._id.toString() }),
      model: previous.model,
      provider: previous.provider,
      actualCost: 0,
      createdAt: timestamp(),
    });
    await ctx.db.insert("resourceStates", { projectId: previous.projectId, productionId: previous.productionId, resourceType: "shotVersion", resourceId: nextId.toString(), state: "DRAFT", createdAt: timestamp(), updatedAt: timestamp() });
    const clips = (await ctx.db.query("timelineClips").withIndex("by_timeline", (q) => q.eq("timelineId", args.timelineId)).collect()).sort((a, b) => a.startSeconds - b.startSeconds);
    for (const clip of clips) if (clip.shotVersionId === previous._id) await ctx.db.patch(clip._id, { shotVersionId: nextId });
    return { previousTakeId: previous._id, newTakeId: nextId, replayed: false };
  },
});

export const patchFixtureClipAsset = mutation({
  args: { fixtureKey: v.string(), timelineId: v.id("timelines"), assetId: v.id("assets") },
  handler: async (ctx, args) => {
    assertFixtureEnabled(args.fixtureKey);
    const member = await owner(ctx);
    const timeline = await ctx.db.get(args.timelineId);
    const asset = await ctx.db.get(args.assetId);
    if (!timeline || !asset || timeline.studioExternalId !== member.studio.externalId || object(object(timeline.tracks).metadata).fixtureMarker !== FIXTURE_MARKER) throw new Error("Fixture timeline not found.");
    const clip = (await ctx.db.query("timelineClips").withIndex("by_timeline", (q) => q.eq("timelineId", timeline._id)).collect()).sort((a, b) => a.startSeconds - b.startSeconds)[0];
    if (!clip) throw new Error("Fixture timeline has no clips.");
    const previousAssetId = clip.assetId;
    await ctx.db.patch(clip._id, { assetId: args.assetId });
    return { clipId: clip._id, previousAssetId, assetId: args.assetId };
  },
});

/** Compatibility reset is retention-only. Permanent deletion is unavailable. */
export const reset = mutation({
  args: { fixtureKey: v.string(), projectExternalId: v.optional(v.string()), confirm: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    assertFixtureEnabled(args.fixtureKey);
    if (!["DELETE_FINALFRAME_DEV_FIXTURES", "RETAIN_FINALFRAME_DEV_FIXTURES"].includes(args.confirm)) throw new Error("Explicit development fixture confirmation is required.");
    const { project } = await projectFor(ctx, args.projectExternalId?.trim() || DEFAULT_PROJECT_EXTERNAL_ID, true);
    if (!project) return { deleted: false, softDeleted: false, reason: "not-found" };
    if (object(project.metadata).fixtureMarker !== FIXTURE_MARKER) throw new Error("Refusing to reset a non-fixture project.");
    await softDeleteProject(ctx, project._id);
    return { deleted: false, softDeleted: true, projectId: project._id, dataRetained: true, authAccountRetained: true };
  },
});

// Isolated online worker transaction fixtures. Never enables provider work.
const WORKER_VERIFICATION_MARKER = 'finalframe-worker-online-verification-v1';
function assertWorkerVerificationEnabled(key: string) {
  assertFixtureEnabled(key);
  if (process.env.FINALFRAME_GENERATION_WORKER_ENABLED === 'true') throw new Error('Disable the live generation worker before running isolated verification.');
}
export const seedGenerationWorkerVerification = internalMutation({
  args: { fixtureKey: v.string(), runId: v.string() }, returns: v.any(),
  handler: async (ctx, args) => {
    assertWorkerVerificationEnabled(args.fixtureKey);
    if (!/^[A-Za-z0-9-]{8,64}$/.test(args.runId)) throw new Error('Use a unique verification run ID.');
    const externalId = `creator-worker-verification-${args.runId}`;
    if (await ctx.db.query('studios').withIndex('by_external_id', (q) => q.eq('externalId', externalId)).unique()) throw new Error('This verification run already exists. Inspect it or use a fresh run ID.');
    const now = Date.now();
    const userId = await ctx.db.insert('users', { email: `${externalId}@example.invalid`, externalId, authSubject: externalId, name: 'Internal worker verification', createdAt: now, updatedAt: now });
    const studioId = await ctx.db.insert('studios', { externalId, ownerExternalId: externalId, ownerUserId: userId, name: 'Isolated worker verification', credits: 950, metadata: { fixtureMarker: WORKER_VERIFICATION_MARKER }, createdAt: now, updatedAt: now });
    await ctx.db.insert('members', { studioId, userId, role: 'owner', status: 'active', createdAt: now, updatedAt: now });
    const outsiderSubject = `${externalId}-outsider`;
    const outsiderUserId = await ctx.db.insert('users', { email: `${outsiderSubject}@example.invalid`, externalId: outsiderSubject, authSubject: outsiderSubject, name: 'Same-studio outsider verification', createdAt: now, updatedAt: now });
    await ctx.db.insert('members', { studioId, userId: outsiderUserId, role: 'member', status: 'active', createdAt: now, updatedAt: now });

    const projectId = await ctx.db.insert('projects', { externalId, studioExternalId: externalId, studioId, ownerUserId: userId, createdByUserId: userId, name: 'Internal worker verification — no provider calls', projectType: 'FIXTURE', metadata: { fixtureMarker: WORKER_VERIFICATION_MARKER }, status: 'DRAFT', createdAt: now, updatedAt: now });
    await ctx.db.insert('projectMembers', { projectId, userId, role: 'OWNER', status: 'ACTIVE', invitedByUserId: userId, createdAt: now, updatedAt: now });
    const productionId = await ctx.db.insert('productions', { projectId, externalProjectId: externalId, studioExternalId: externalId, studioId, workflow: 'FIXTURE', inputMode: 'FOOTAGE', requestedDurationSeconds: 5, language: 'en', outputPreset: 'LANDSCAPE', status: 'READY', metadata: { fixtureMarker: WORKER_VERIFICATION_MARKER }, createdAt: now, updatedAt: now });
    const planId = await ctx.db.insert('directorPlans', { productionId, studioExternalId: externalId, studioId, input: { fixtureMarker: WORKER_VERIFICATION_MARKER }, plan: { fixtureMarker: WORKER_VERIFICATION_MARKER }, estimate: { totalCredits: 0 }, status: 'APPROVED', createdAt: now });
    const productionVersionId = await ctx.db.insert('productionVersions', { productionId, versionNumber: 1, sourcePlanId: planId, status: 'APPROVED', snapshot: { fixtureMarker: WORKER_VERIFICATION_MARKER }, approvedByUserId: userId, approvedAt: now, createdAt: now });
    await ctx.db.patch(productionId, { currentVersionId: productionVersionId, currentPlanId: planId });
    const sequenceId = await ctx.db.insert('sequences', { projectId, productionId, productionVersionId, studioExternalId: externalId, studioId, title: 'Fixture sequence', description: '', orderIndex: 0, status: 'DRAFT' });
    const sceneId = await ctx.db.insert('scenes', { projectId, productionId, productionVersionId, sequenceId, studioExternalId: externalId, studioId, title: 'Fixture scene', purpose: 'Verify durable transactions without a provider', visualDirection: '', orderIndex: 0, status: 'DRAFT' });
    const budgetId = await ctx.db.insert('providerBudgets', { key: externalId, limitMicros: 10_000, spentMicros: 0, reservedMicros: 5_000, status: 'ACTIVE', allowedStudioExternalIds: [externalId], createdAt: now, updatedAt: now });
    await ctx.db.insert('credits', { studioExternalId: externalId, studioId, balance: 950, reserved: 50, currency: 'credits', createdAt: now, updatedAt: now });
    await ctx.db.insert('ledger', { studioExternalId: externalId, studioId, entryType: 'TEST_GRANT', amount: 1000, sourceType: 'INTERNAL_VERIFICATION', sourceId: externalId, idempotencyKey: `${externalId}:test-grant`, metadata: { fixtureMarker: WORKER_VERIFICATION_MARKER, paymentCreated: false }, createdAt: now });
    const jobIds: Id<'generationJobs'>[] = [];
    for (let index = 0; index < 5; index += 1) {
      const shotId = await ctx.db.insert('shots', { projectId, productionId, productionVersionId, sequenceId, sceneId, studioExternalId: externalId, studioId, title: `Fixture shot ${index + 1}`, prompt: 'No provider execution', durationSeconds: 5, orderIndex: index, camera: {}, requiredAssetIds: [], status: 'DRAFT', metadata: { fixtureMarker: WORKER_VERIFICATION_MARKER } });
      const shotVersionId = await ctx.db.insert('shotVersions', { projectId, productionId, productionVersionId, shotId, versionNumber: 1, status: 'QUEUED', contextSnapshot: { fixtureMarker: WORKER_VERIFICATION_MARKER }, studioExternalId: externalId, studioId, model: 'fixture/no-network', provider: 'fixture', createdAt: now });
      const jobId = await ctx.db.insert('generationJobs', { projectId, productionId, productionVersionId, shotId, shotVersionId, createdByUserId: userId, studioExternalId: externalId, studioId, modality: 'VIDEO', provider: 'fixture', model: 'fixture/no-network', request: { fixtureMarker: WORKER_VERIFICATION_MARKER, prompt: 'No provider execution', duration: 5, ratio: '16:9', referenceAssetIds: [] }, status: 'QUEUED', executionStage: 'QUEUED', progress: 0, estimatedCost: 10, estimatedProviderCostUsd: 0.001, idempotencyKey: `${externalId}:job:${index}`, attemptCount: 0, createdAt: now, updatedAt: now });
      const reservationId = await ctx.db.insert('reservations', { studioExternalId: externalId, studioId, generationJobId: jobId, amount: 10, idempotencyKey: `${externalId}:credits:${index}`, reservedAt: now, expiresAt: now + 3_600_000, createdAt: now });
      await ctx.db.insert('ledger', { studioExternalId: externalId, studioId, entryType: 'RESERVE', amount: -10, sourceType: 'RESERVATION', sourceId: reservationId, reservationId, idempotencyKey: `reserve:${externalId}:${index}`, metadata: { fixtureMarker: WORKER_VERIFICATION_MARKER }, createdAt: now });
      const providerBudgetReservationId = await ctx.db.insert('providerBudgetReservations', { budgetId, jobId, studioExternalId: externalId, idempotencyKey: `${externalId}:budget:${index}`, estimatedMicros: 1000, status: 'RESERVED', createdAt: now, updatedAt: now });
      await ctx.db.patch(jobId, { canonicalReservationId: reservationId, providerBudgetReservationId });
      jobIds.push(jobId);
    }
    return { projectId, productionId, budgetId, studioExternalId: externalId, ownerSubject: externalId, outsiderSubject, outsiderUserId, jobIds };
  },
});


/** Isolated cloud-only render state-machine fixture. It never calls a renderer
 * and never stores or pretends to create a video artifact. */
export const seedRenderWorkerVerification = internalMutation({
  args: { fixtureKey: v.string(), runId: v.string() }, returns: v.any(),
  handler: async (ctx, args) => {
    assertFixtureEnabled(args.fixtureKey);
    if (process.env.FINALFRAME_RENDER_WORKER_ENABLED === 'true') throw new Error('Disable the renderer worker before isolated verification.');
    if (!/^[A-Za-z0-9-]{8,64}$/.test(args.runId)) throw new Error('Use a unique verification run ID.');
    const externalId = `render-worker-verification-${args.runId}`;
    if (await ctx.db.query('studios').withIndex('by_external_id', (q) => q.eq('externalId', externalId)).unique()) throw new Error('This verification run already exists.');
    const timestamp = Date.now();
    const marker = 'finalframe-render-worker-verification-v1';
    const userId = await ctx.db.insert('users', { email: `${externalId}@example.invalid`, externalId, authSubject: externalId, name: 'Internal renderer verification', createdAt: timestamp, updatedAt: timestamp });
    const studioId = await ctx.db.insert('studios', { externalId, ownerExternalId: externalId, ownerUserId: userId, name: 'Internal renderer verification', credits: 0, metadata: { fixtureMarker: marker }, createdAt: timestamp, updatedAt: timestamp });
    await ctx.db.insert('members', { studioId, userId, role: 'owner', status: 'active', createdAt: timestamp, updatedAt: timestamp });
    const projectId = await ctx.db.insert('projects', { externalId, studioExternalId: externalId, studioId, ownerUserId: userId, createdByUserId: userId, name: 'Renderer state verification — no render', projectType: 'FIXTURE', metadata: { fixtureMarker: marker }, status: 'DRAFT', createdAt: timestamp, updatedAt: timestamp });
    await ctx.db.insert('projectMembers', { projectId, userId, role: 'OWNER', status: 'ACTIVE', invitedByUserId: userId, createdAt: timestamp, updatedAt: timestamp });
    const productionId = await ctx.db.insert('productions', { projectId, externalProjectId: externalId, studioExternalId: externalId, studioId, workflow: 'FIXTURE', inputMode: 'IDEA', requestedDurationSeconds: 1, language: 'en', outputPreset: 'LANDSCAPE', status: 'READY', metadata: { fixtureMarker: marker }, createdAt: timestamp, updatedAt: timestamp });
    const timelineId = await ctx.db.insert('timelines', { projectId, productionId, studioExternalId: externalId, studioId, versionNumber: 1, durationSeconds: 1, tracks: {}, outputPreset: 'LANDSCAPE', status: 'APPROVED', createdByUserId: userId, createdAt: timestamp, updatedAt: timestamp });
    await ctx.db.insert('resourceStates', { projectId, productionId, resourceType: 'timeline', resourceId: timelineId, state: 'LOCKED', createdAt: timestamp, updatedAt: timestamp });
    const manifestId = await ctx.db.insert('manifests', { projectId, productionId, timelineId, studioExternalId: externalId, studioId, contractVersion: 4, selectionScope: 'TIMELINE', exportScope: 'TIMELINE', versionNumber: 1, manifest: {}, sourceHashes: [], createdAt: timestamp });
    await ctx.db.patch(manifestId, { manifest: { kind: 'finalframe.render-manifest', version: 4, manifestId, projectId, productionId, timelineId, rendererVersion: 'fixture-state-verification', selection: { scope: 'TIMELINE', ids: [timelineId] }, export: { scope: 'TIMELINE', format: 'MP4' }, output: { width: 640, height: 360, fps: 24, durationInFrames: 24, codec: 'h264' }, items: [{ id: 'title', kind: 'motion-graphics', templateId: 'kinetic-title', startFrame: 0, durationInFrames: 24, props: { title: 'State verification only' } }], sources: [], shots: [], audioTracks: [], metadata: { lockState: 'LOCKED', lockId: timelineId, lockedBy: userId, lockedAt: new Date(timestamp).toISOString(), fixtureMarker: marker } } });
    await ctx.db.patch(timelineId, { manifestId });
    const jobIds = [];
    for (let index = 0; index < 2; index += 1) jobIds.push(await ctx.db.insert('renderJobs', { projectId, productionId, timelineId, manifestId, studioExternalId: externalId, studioId, createdByUserId: userId, operation: 'RENDER', preset: 'LANDSCAPE', status: 'QUEUED', executionStage: 'QUEUED', idempotencyKey: `${externalId}:${index}`, progress: 0, createdAt: timestamp, updatedAt: timestamp }));
    return { projectId, productionId, timelineId, manifestId, jobIds };
  },
});
