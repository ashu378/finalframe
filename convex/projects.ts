import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  requireCurrentMember,
  requireMember,
  requireProjectAccess,
  requireProjectRole,
} from "./authorization";
import { ConvexAuthError, ConvexAuthorizationError } from "./auth";

const now = () => Date.now();

function normalized(value: string | undefined, label: string, maxLength: number) {
  if (value === undefined) return undefined;
  const result = value.trim();
  if (result.length > maxLength) throw new Error(`${label} is too long.`);
  return result || undefined;
}

function projectStatus(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : "DRAFT";
}

function activeProject(project: { status?: string; deletedAt?: number; archivedAt?: number }) {
  return project.status !== "DELETED" && project.status !== "ARCHIVED" && !project.deletedAt && !project.archivedAt;
}

function archivedProject(project: { status?: string; deletedAt?: number; archivedAt?: number }) {
  return project.status === "ARCHIVED" && !project.deletedAt;
}

function deletedProject(project: { status?: string; deletedAt?: number }) {
  return project.status === "DELETED" || project.deletedAt !== undefined;
}

function previousStatus(project: { metadata?: unknown }) {
  const metadata = project.metadata;
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return "DRAFT";
  const value = (metadata as Record<string, unknown>).statusBeforeDeletion;
  return typeof value === "string" && value !== "DELETED" && value !== "ARCHIVED" ? value : "DRAFT";
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    contentType: v.optional(v.string()),
    projectType: v.optional(v.string()),
    outcomeGoal: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const member = await requireCurrentMember(ctx);
    const name = args.name.trim();
    if (!name) throw new Error("Project name is required.");
    if (name.length > 200) throw new Error("Project name is too long.");

    const description = normalized(args.description, "Project description", 10_000);
    const type = normalized(args.projectType ?? args.contentType, "Project type", 100);
    const externalId = `project_${member.identity.subject}_${Date.now()}`;
    const timestamp = now();
    const projectId = await ctx.db.insert("projects", {
      externalId,
      studioExternalId: member.studio.externalId,
      studioId: member.studio._id,
      name,
      description,
      projectType: type,
      status: "DRAFT",
      metadata: {
        contentType: args.contentType ?? type,
        outcomeGoal: args.outcomeGoal?.trim() || undefined,
      },
      createdByExternalId: member.identity.externalId,
      createdByUserId: member.user._id,
      ownerUserId: member.user._id,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await ctx.db.insert("projectMembers", {
      projectId,
      userId: member.user._id,
      role: "OWNER",
      status: "ACTIVE",
      invitedByUserId: member.user._id,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    return {
      projectId,
      externalId,
      studioId: member.studio._id,
      studioExternalId: member.studio.externalId,
    };
  },
});

export const list = query({
  args: { studioExternalId: v.string() },
  handler: async (ctx, args) => {
    const member = await requireMember(ctx, args.studioExternalId);
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_studio", (q) => q.eq("studioExternalId", member.studio.externalId))
      .order("desc")
      .collect();

    const explicitMemberships = await ctx.db
      .query("projectMembers")
      .withIndex("by_user", (q) => q.eq("userId", member.user._id))
      .collect();
    const membershipIds = new Set(
      explicitMemberships.filter((row) => row.status === "ACTIVE").map((row) => row.projectId.toString()),
    );
    const migrationOwner = member.role === "owner" || member.role === "admin";

    return projects.filter((project) => {
      if (!activeProject(project)) return false;
      if (membershipIds.has(project._id.toString())) return true;
      if (project.createdByUserId === member.user._id || project.createdByExternalId === member.identity.externalId) return true;
      return migrationOwner;
    });
  },
});

export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const { project } = await requireProjectAccess(ctx, args.projectId);
    return project;
  },
});

export const getByExternalId = query({
  args: { externalId: v.string(), includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_external_id", (q) => q.eq("externalId", args.externalId))
      .unique();
    if (!project) return null;
    const { project: authorized } = args.includeInactive
      ? await requireProjectRole(ctx, project._id, ["OWNER", "EDITOR"], { includeInactive: true })
      : await requireProjectAccess(ctx, project._id);
    return authorized;
  },
});

export const update = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    projectType: v.optional(v.string()),
    contentType: v.optional(v.string()),
    outcomeGoal: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { project } = await requireProjectRole(ctx, args.projectId, ["OWNER", "EDITOR"]);
    if (deletedProject(project)) throw new Error("A deleted project must be restored before editing.");
    if (project.status === "ARCHIVED") throw new Error("An archived project must be restored before editing.");

    const patch: Record<string, unknown> = { updatedAt: now() };
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Project name is required.");
      if (name.length > 200) throw new Error("Project name is too long.");
      patch.name = name;
    }
    if (args.description !== undefined) patch.description = normalized(args.description, "Project description", 10_000);
    if (args.projectType !== undefined) patch.projectType = normalized(args.projectType, "Project type", 100);

    const metadata = metadataRecord(project.metadata);
    if (args.contentType !== undefined) metadata.contentType = normalized(args.contentType, "Content type", 100);
    if (args.outcomeGoal !== undefined) metadata.outcomeGoal = normalized(args.outcomeGoal, "Outcome goal", 200);
    if (args.contentType !== undefined || args.outcomeGoal !== undefined) patch.metadata = metadata;

    await ctx.db.patch(project._id, patch as never);
    return await ctx.db.get(project._id);
  },
});

export const archive = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const { project } = await requireProjectRole(ctx, args.projectId, ["OWNER", "EDITOR"]);
    if (deletedProject(project)) throw new Error("A deleted project cannot be archived.");
    if (archivedProject(project)) return project;
    const timestamp = now();
    await ctx.db.patch(project._id, { status: "ARCHIVED", archivedAt: timestamp, updatedAt: timestamp });
    return await ctx.db.get(project._id);
  },
});

export const restore = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    // Restore must resolve a soft-deleted project so that deletion remains
    // reversible. Normal reads/lists still hide deleted projects.
    const { project } = await requireProjectRole(ctx, args.projectId, ["OWNER", "EDITOR"], { includeInactive: true });
    if (!archivedProject(project) && !deletedProject(project)) return project;
    const timestamp = now();
    const metadata = metadataRecord(project.metadata);
    const restoredStatus = previousStatus(project);
    delete metadata.statusBeforeDeletion;
    await ctx.db.patch(project._id, {
      status: restoredStatus as never,
      archivedAt: undefined,
      deletedAt: undefined,
      metadata,
      updatedAt: timestamp,
    });
    return await ctx.db.get(project._id);
  },
});

/** Shared lifecycle authority. Even fixture utilities retain all descendants. */
export async function softDeleteProject(ctx: MutationCtx, projectId: Id<"projects">) {
  const { project } = await requireProjectRole(ctx, projectId, ["OWNER"], { includeInactive: true });
  if (deletedProject(project)) return project;
  const timestamp = now();
  const metadata = { ...metadataRecord(project.metadata), statusBeforeDeletion: projectStatus(project.status) };
  await ctx.db.patch(project._id, { status: "DELETED", deletedAt: timestamp, archivedAt: undefined, metadata, updatedAt: timestamp });
  return await ctx.db.get(project._id);
}

/** Soft delete only. Project descendants and audit records are retained. */
export const softDelete = mutation({
  args: { projectId: v.id("projects") }, returns: v.any(),
  handler: async (ctx, args) => softDeleteProject(ctx, args.projectId),
});

export const listMembers = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const members = await ctx.db
      .query("projectMembers")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    return await Promise.all(members.map(async (member) => ({
      ...member,
      user: await ctx.db.get(member.userId),
    })));
  },
});

export const setMember = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
    role: v.union(v.literal("OWNER"), v.literal("EDITOR"), v.literal("REVIEWER"), v.literal("VIEWER")),
  },
  handler: async (ctx, args) => {
    const actor = await requireProjectRole(ctx, args.projectId, ["OWNER"]);
    const user = await ctx.db.get(args.userId);
    if (!user || user.status === "disabled") throw new ConvexAuthError("USER_NOT_FOUND", "User not found.");
    const existing = await ctx.db
      .query("projectMembers")
      .withIndex("by_project_user", (q) => q.eq("projectId", args.projectId).eq("userId", args.userId))
      .unique();
    const timestamp = now();
    if (existing) {
      await ctx.db.patch(existing._id, { role: args.role, status: "ACTIVE", updatedAt: timestamp });
      return await ctx.db.get(existing._id);
    }
    const memberId = await ctx.db.insert("projectMembers", {
      projectId: args.projectId,
      userId: args.userId,
      role: args.role,
      status: "ACTIVE",
      invitedByUserId: actor.user._id,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return await ctx.db.get(memberId);
  },
});

export const removeMember = mutation({
  args: { projectId: v.id("projects"), userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireProjectRole(ctx, args.projectId, ["OWNER"]);
    const existing = await ctx.db
      .query("projectMembers")
      .withIndex("by_project_user", (q) => q.eq("projectId", args.projectId).eq("userId", args.userId))
      .unique();
    if (!existing) return { ok: true };
    if (existing.role === "OWNER") {
      const activeMembers = await ctx.db
        .query("projectMembers")
        .withIndex("by_project_status", (q) => q.eq("projectId", args.projectId).eq("status", "ACTIVE"))
        .collect();
      if (activeMembers.filter((member) => member.role === "OWNER").length <= 1) {
        throw new Error("A project must retain at least one owner.");
      }
    }
    await ctx.db.patch(existing._id, { status: "REMOVED", updatedAt: now() });
    return { ok: true };
  },
});
