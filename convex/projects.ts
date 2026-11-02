import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  requireCurrentMember,
  requireMember,
  requireProjectAccess,
  requireProjectRole,
} from "./authorization";
import { ConvexAuthError, ConvexAuthorizationError } from "./auth";
import { normalizeProjectSearch, projectMatchesLibrary, type ProjectLibraryMode, type ProjectLibraryPage } from "../src/lib/project/library";

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
  return project.status !== "DELETED" && project.status !== "ARCHIVED" && project.deletedAt === undefined && project.archivedAt === undefined;
}

function archivedProject(project: { status?: string; deletedAt?: number; archivedAt?: number }) {
  return (project.status === "ARCHIVED" || project.archivedAt !== undefined) && project.status !== "DELETED" && project.deletedAt === undefined;
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

type CreateProjectArgs = {
  name: string;
  description?: string;
  contentType?: string;
  projectType?: string;
  outcomeGoal?: string;
};

/** Canonical transactional project creation, including verified ownership. */
export async function createProjectForMember(ctx: MutationCtx, args: CreateProjectArgs, options?: {
  studioExternalId?: string;
  externalId?: string;
  metadata?: Record<string, unknown>;
}) {
    const member = options?.studioExternalId ? await requireMember(ctx, options.studioExternalId) : await requireCurrentMember(ctx);
    const name = args.name.trim();
    if (!name) throw new Error("Project name is required.");
    if (name.length > 200) throw new Error("Project name is too long.");

    const description = normalized(args.description, "Project description", 10_000);
    const type = normalized(args.projectType ?? args.contentType, "Project type", 100);
    const externalId = options?.externalId ?? `project_${member.identity.subject}_${Date.now()}`;
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
        ...options?.metadata,
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
}

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    contentType: v.optional(v.string()),
    projectType: v.optional(v.string()),
    outcomeGoal: v.optional(v.string()),
  },
  handler: async (ctx, args) => createProjectForMember(ctx, args),
});

type LibraryCursor = {
  version: 1;
  phase: 'members' | 'legacy';
  userId: string;
  studio: string;
  mode: ProjectLibraryMode;
  search: string;
  cursor: string | null;
};

function libraryCursor(value: string | undefined, context: Omit<LibraryCursor, 'version' | 'phase' | 'cursor'>): LibraryCursor {
  if (!value) return { version: 1, phase: 'members', cursor: null, ...context };
  if (value.length > 20_000) throw new Error('Invalid project library cursor.');
  let parsed: LibraryCursor;
  try { parsed = JSON.parse(value) as LibraryCursor; } catch { throw new Error('Invalid project library cursor.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.version !== 1 || !['members', 'legacy'].includes(parsed.phase) || (parsed.cursor !== null && typeof parsed.cursor !== 'string') || parsed.userId !== context.userId || parsed.studio !== context.studio || parsed.mode !== context.mode || parsed.search !== context.search) throw new Error('Project search changed. Start from the first page.');
  return parsed;
}

async function visibleLibraryProject(ctx: QueryCtx, projectId: Id<'projects'>, mode: ProjectLibraryMode, metadataOnly = false) {
  try {
    return await requireProjectAccess(ctx, projectId, mode === 'deleted' ? ['OWNER', 'EDITOR'] : undefined, { includeInactive: mode === 'deleted', ...(metadataOnly ? { allowRestrictedRead: true } : {}) });
  } catch (error) {
    if (error instanceof ConvexAuthorizationError && ['PROJECT_NOT_FOUND', 'PROJECT_ACCESS_DENIED', 'NOT_A_MEMBER'].includes(error.code)) return null;
    throw error;
  }
}

/** One bounded indexed page. Explicit membership always overrides migration
 * fallback, even when suspended or removed. No studio-role shortcut exists. */
export async function listLibraryPage(ctx: QueryCtx, args: { studioExternalId: string; mode: ProjectLibraryMode; search?: string; cursor?: string; limit?: number }): Promise<ProjectLibraryPage> {
  const member = await requireMember(ctx, args.studioExternalId);
  const search = normalizeProjectSearch(args.search);
  const limit = args.limit ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('Choose a page size between 1 and 50.');
  const cursor = libraryCursor(args.cursor, { userId: String(member.user._id), studio: member.studio.externalId, mode: args.mode, search });
  const candidates = cursor.phase === 'members'
    ? await ctx.db.query('projectMembers').withIndex('by_user', (q) => q.eq('userId', member.user._id)).order('desc').paginate({ cursor: cursor.cursor, numItems: limit, maximumRowsRead: 50 })
    : await ctx.db.query('projects').withIndex('by_studio', (q) => q.eq('studioExternalId', member.studio.externalId)).order('desc').paginate({ cursor: cursor.cursor, numItems: limit, maximumRowsRead: 50 });
  const page: ProjectLibraryPage['page'] = [];
  for (const candidate of candidates.page) {
    if (cursor.phase === 'members' && 'projectId' in candidate && candidate.status !== 'ACTIVE') continue;
    const project = cursor.phase === 'members' && 'projectId' in candidate ? await ctx.db.get(candidate.projectId) : candidate;
    if (!project || !('studioExternalId' in project) || project.studioExternalId !== member.studio.externalId || !projectMatchesLibrary(project, args.mode, search)) continue;
    if (cursor.phase === 'legacy') {
      const explicit = await ctx.db.query('projectMembers').withIndex('by_project_user', (q) => q.eq('projectId', project._id as Id<'projects'>).eq('userId', member.user._id)).unique();
      if (explicit) continue;
      // Same recorded owner/creator policy as requireProjectAccess. Ambiguous
      // rows remain unavailable until the additive ownership backfill maps them.
      if (project.ownerUserId !== member.user._id && project.createdByUserId !== member.user._id && project.createdByExternalId !== member.identity.externalId) continue;
    }
    const access = await visibleLibraryProject(ctx, project._id as Id<'projects'>, args.mode, true);
    if (!access) continue;
    page.push({ id: access.project._id, externalId: access.project.externalId, name: access.project.name, description: access.project.description ?? null, status: args.mode === 'archived' ? 'ARCHIVED' : args.mode === 'deleted' ? 'DELETED' : access.project.status ?? 'DRAFT', createdAt: access.project.createdAt, updatedAt: access.project.updatedAt, role: access.projectRole, moderationStatus: access.project.moderationStatus ?? 'CLEAR' });
  }
  const isDone = cursor.phase === 'legacy' && candidates.isDone;
  const next: LibraryCursor = cursor.phase === 'members' && candidates.isDone ? { ...cursor, phase: 'legacy', cursor: null } : { ...cursor, cursor: candidates.continueCursor };
  return { page, isDone, continueCursor: isDone ? null : JSON.stringify(next), scanned: candidates.page.length };
}

export const library = query({
  args: { studioExternalId: v.string(), mode: v.union(v.literal('active'), v.literal('archived'), v.literal('deleted')), search: v.optional(v.string()), cursor: v.optional(v.string()), limit: v.optional(v.number()) },
  returns: v.object({ page: v.array(v.object({ id: v.id('projects'), externalId: v.string(), name: v.string(), description: v.union(v.string(), v.null()), status: v.string(), createdAt: v.number(), updatedAt: v.number(), role: v.union(v.literal('OWNER'), v.literal('EDITOR'), v.literal('REVIEWER'), v.literal('VIEWER')), moderationStatus: v.union(v.literal('CLEAR'), v.literal('RESTRICTED')) })), continueCursor: v.union(v.string(), v.null()), isDone: v.boolean(), scanned: v.number() }),
  handler: listLibraryPage,
});

/** Compatibility listing for older callers. Large workspaces must use the
 * cursor API; an explicit scan-limit error never masquerades as a full list. */
export const list = query({
  args: { studioExternalId: v.string() },
  handler: async (ctx, args) => {
    await requireMember(ctx, args.studioExternalId);
    const projects = await ctx.db.query('projects').withIndex('by_studio', (q) => q.eq('studioExternalId', args.studioExternalId)).order('desc').take(501);
    if (projects.length > 500) throw new Error('Project listing exceeds the compatibility limit. Use the paginated project library.');
    const visible = [];
    for (const project of projects) {
      if (!activeProject(project)) continue;
      const access = await visibleLibraryProject(ctx, project._id, 'active');
      if (access) visible.push(access.project);
    }
    return visible;
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
    if (archivedProject(project)) throw new Error("An archived project must be restored before editing.");

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
    await ctx.db.patch(project._id, { status: "ARCHIVED", archivedAt: timestamp, metadata: { ...metadataRecord(project.metadata), statusBeforeArchive: projectStatus(project.status) }, updatedAt: timestamp });
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
    const restoringDeletedArchive = deletedProject(project) && metadata.statusBeforeDeletion === 'ARCHIVED';
    const restoredStatus = restoringDeletedArchive ? 'ARCHIVED' : archivedProject(project)
      ? previousStatus({ metadata: { statusBeforeDeletion: metadata.statusBeforeArchive } })
      : previousStatus(project);
    const restoredArchiveTime = restoringDeletedArchive && typeof metadata.archivedAtBeforeDeletion === 'number' ? metadata.archivedAtBeforeDeletion : timestamp;
    delete metadata.statusBeforeDeletion;
    delete metadata.archivedAtBeforeDeletion;
    if (!restoringDeletedArchive) delete metadata.statusBeforeArchive;
    await ctx.db.patch(project._id, {
      status: restoredStatus as never,
      archivedAt: restoringDeletedArchive ? restoredArchiveTime : undefined,
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
  const metadata = { ...metadataRecord(project.metadata), statusBeforeDeletion: archivedProject(project) ? "ARCHIVED" : projectStatus(project.status), ...(project.archivedAt !== undefined ? { archivedAtBeforeDeletion: project.archivedAt } : {}) };
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

function isRecordedProjectOwner(project: { ownerUserId?: Id<'users'>; createdByUserId?: Id<'users'>; createdByExternalId?: string }, user: { _id: Id<'users'>; externalId?: string; authSubject?: string }) {
  return project.ownerUserId === user._id || project.createdByUserId === user._id || Boolean(project.createdByExternalId && (project.createdByExternalId === user.externalId || project.createdByExternalId === user.authSubject));
}

/** Membership changes and removals share the same indexed invariant. */
async function requireAnotherActiveOwner(ctx: MutationCtx, projectId: Id<'projects'>, targetUserId: Id<'users'>) {
  const owners = await ctx.db.query('projectMembers').withIndex('by_project_role_status', q => q.eq('projectId', projectId).eq('role', 'OWNER').eq('status', 'ACTIVE')).take(2);
  if (!owners.some(member => member.userId !== targetUserId)) throw new Error('A project must retain at least one owner.');
}

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
    const demotesOwner = existing ? existing.role === "OWNER" && existing.status === "ACTIVE" : isRecordedProjectOwner(actor.project, user);
    if (demotesOwner && args.role !== "OWNER") await requireAnotherActiveOwner(ctx, args.projectId, args.userId);
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
    const actor = await requireProjectRole(ctx, args.projectId, ["OWNER"]);
    const existing = await ctx.db
      .query("projectMembers")
      .withIndex("by_project_user", (q) => q.eq("projectId", args.projectId).eq("userId", args.userId))
      .unique();
    if (!existing) {
      const target = await ctx.db.get(args.userId);
      if (!target || !isRecordedProjectOwner(actor.project, target)) return { ok: true };
      await requireAnotherActiveOwner(ctx, args.projectId, args.userId);
      const timestamp = now();
      // A durable explicit denial overrides recorded-creator migration access.
      await ctx.db.insert('projectMembers', { projectId: args.projectId, userId: args.userId, role: 'OWNER', status: 'REMOVED', invitedByUserId: actor.user._id, createdAt: timestamp, updatedAt: timestamp });
      return { ok: true };
    }
    if (existing.role === "OWNER" && existing.status === "ACTIVE") await requireAnotherActiveOwner(ctx, args.projectId, args.userId);
    await ctx.db.patch(existing._id, { status: "REMOVED", updatedAt: now() });
    return { ok: true };
  },
});
