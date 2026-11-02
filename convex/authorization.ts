import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  ConvexAuthError,
  ConvexAuthorizationError,
} from "./auth";
import { getIdentity, requireIdentity, type FinalFrameIdentity } from "./identity";
import { currentStudioForUser, studioRoleForUser } from "./studioMemberships";

export type AuthorizationCtx = QueryCtx | MutationCtx;
export type User = Doc<"users">;
export type Studio = Doc<"studios">;
export type StudioRole = "owner" | "admin" | "member";

export type AuthorizedUser = {
  identity: FinalFrameIdentity;
  user: User;
};

export type AuthorizedMember = AuthorizedUser & {
  studio: Studio;
  role: StudioRole;
};

export type ProjectRole = "OWNER" | "EDITOR" | "REVIEWER" | "VIEWER";

export type AuthorizedProject = AuthorizedMember & {
  project: Doc<"projects">;
  projectRole: ProjectRole;
  /** True when access is granted through a migration fallback. */
  migrationFallback: boolean;
};

async function getStudioByExternalId(ctx: AuthorizationCtx, studioExternalId: string) {
  return await ctx.db
    .query("studios")
    .withIndex("by_external_id", (q) => q.eq("externalId", studioExternalId))
    .unique();
}

async function getStudioById(ctx: AuthorizationCtx, studioId: Doc<"studios">["_id"]) {
  return await ctx.db.get(studioId);
}

/** A canonical inactive membership is a durable denial before any fallback. */
async function resolveMembership(ctx: AuthorizationCtx, studio: Studio, authorizedUser: AuthorizedUser): Promise<StudioRole | null> {
  return studioRoleForUser(ctx, studio, authorizedUser.user, authorizedUser.identity.externalId);
}

/** Return the current application's user, if the verified identity is known. */
export async function getUser(ctx: AuthorizationCtx): Promise<AuthorizedUser | null> {
  const identity = await getIdentity(ctx);
  if (!identity) return null;

  const user = await ctx.db
    .query("users")
    .withIndex("by_auth_subject", (q) => q.eq("authSubject", identity.externalId))
    .unique()
    ?? await ctx.db
      .query("users")
      .withIndex("by_auth_subject", (q) => q.eq("authSubject", identity.subject))
      .unique()
    ?? await ctx.db
      .query("users")
      .withIndex("by_external_id", (q) => q.eq("externalId", identity.externalId))
      .unique();

  return user ? { identity, user } : null;
}

/** Require an authenticated identity that has been provisioned in Convex. */
export async function requireUser(ctx: AuthorizationCtx): Promise<AuthorizedUser> {
  const identity = await requireIdentity(ctx);
  const user = await ctx.db
    .query("users")
    .withIndex("by_auth_subject", (q) => q.eq("authSubject", identity.externalId))
    .unique()
    ?? await ctx.db
      .query("users")
      .withIndex("by_auth_subject", (q) => q.eq("authSubject", identity.subject))
      .unique()
    ?? await ctx.db
      .query("users")
      .withIndex("by_external_id", (q) => q.eq("externalId", identity.externalId))
      .unique();

  if (!user) {
    throw new ConvexAuthError(
      "USER_NOT_FOUND",
      "The authenticated user is not provisioned in Convex.",
    );
  }

  if (user.status === "disabled") {
    throw new ConvexAuthError(
      "USER_NOT_FOUND",
      "The authenticated user is disabled.",
    );
  }

  return { identity, user };
}

/**
 * Require access to an existing studio.
 *
 * The external ID is only a lookup key. Authorization comes from the
 * verified user and the canonical membership/ownership records.
 */
export async function requireStudio(
  ctx: AuthorizationCtx,
  studioExternalId: string,
): Promise<Studio> {
  const authorizedUser = await requireUser(ctx);
  const studio = await getStudioByExternalId(ctx, studioExternalId);

  if (!studio) {
    throw new ConvexAuthorizationError(
      "STUDIO_NOT_FOUND",
      "Studio not found.",
    );
  }

  if (!(await resolveMembership(ctx, studio, authorizedUser))) {
    throw new ConvexAuthorizationError(
      "STUDIO_ACCESS_DENIED",
      "You are not authorized to access this studio.",
    );
  }

  return studio;
}

/** Require access using the canonical Convex studio ID. */
export async function requireStudioById(
  ctx: AuthorizationCtx,
  studioId: Doc<"studios">["_id"],
): Promise<Studio> {
  const authorizedUser = await requireUser(ctx);
  const studio = await getStudioById(ctx, studioId);

  if (!studio) {
    throw new ConvexAuthorizationError("STUDIO_NOT_FOUND", "Studio not found.");
  }
  if (!(await resolveMembership(ctx, studio, authorizedUser))) {
    throw new ConvexAuthorizationError(
      "STUDIO_ACCESS_DENIED",
      "You are not authorized to access this studio.",
    );
  }
  return studio;
}

/**
 * Require an active canonical membership. The legacy membership and owner
 * fields are migration fallbacks only when no canonical membership exists.
 */
export async function requireMember(
  ctx: AuthorizationCtx,
  studioExternalId: string,
): Promise<AuthorizedMember> {
  const authorizedUser = await requireUser(ctx);
  const studio = await getStudioByExternalId(ctx, studioExternalId);

  if (!studio) {
    throw new ConvexAuthorizationError(
      "STUDIO_NOT_FOUND",
      "Studio not found.",
    );
  }

  const role = await resolveMembership(ctx, studio, authorizedUser);
  if (!role) {
    throw new ConvexAuthorizationError("NOT_A_MEMBER", "You are not a member of this studio.");
  }
  return { ...authorizedUser, studio, role };
}

/** Require an active member using a canonical studio ID. */
export async function requireMemberById(
  ctx: AuthorizationCtx,
  studioId: Doc<"studios">["_id"],
): Promise<AuthorizedMember> {
  const authorizedUser = await requireUser(ctx);
  const studio = await getStudioById(ctx, studioId);
  if (!studio) {
    throw new ConvexAuthorizationError("STUDIO_NOT_FOUND", "Studio not found.");
  }

  const role = await resolveMembership(ctx, studio, authorizedUser);
  if (!role) {
    throw new ConvexAuthorizationError("NOT_A_MEMBER", "You are not a member of this studio.");
  }
  return { ...authorizedUser, studio, role };
}

/**
 * Resolve the user's current workspace using the same precedence as the
 * account query. This keeps project creation available to canonical members,
 * legacy members, and owner records while membership migration is in flight.
 */
export async function requireCurrentMember(ctx: AuthorizationCtx): Promise<AuthorizedMember> {
  const authorizedUser = await requireUser(ctx);
  const selected = await currentStudioForUser(ctx, authorizedUser.user, authorizedUser.identity.externalId);
  if (!selected) throw new ConvexAuthorizationError("NOT_A_MEMBER", "No authorized workspace is available. Ask its owner to restore access or create a personal workspace.");
  return { ...authorizedUser, ...selected };
}

function hasProjectRole(role: ProjectRole, allowedRoles?: readonly ProjectRole[]) {
  return !allowedRoles || allowedRoles.includes(role);
}

/**
 * Resolve project access before any project mutation or descendant query.
 * Existing projects may not have a projectMembers row yet, so the creator and
 * recorded creator/owner receive a temporary migration fallback. New projects
 * always create an explicit OWNER membership.
 */
export async function requireProjectAccess(
  ctx: AuthorizationCtx,
  projectId: Doc<"projects">["_id"],
  allowedRoles?: readonly ProjectRole[],
  options?: { includeInactive?: boolean; allowRestrictedRead?: boolean },
): Promise<AuthorizedProject> {
  const project = await ctx.db.get(projectId);
  if (!project || (!options?.includeInactive && (project.deletedAt || project.status === "DELETED"))) {
    throw new ConvexAuthorizationError("PROJECT_NOT_FOUND", "Project not found.");
  }
  if (project.moderationStatus === 'RESTRICTED' && !options?.allowRestrictedRead) {
    throw new ConvexAuthorizationError('PROJECT_ACCESS_DENIED', 'This project is restricted. Contact support.');
  }

  const member = await requireMember(ctx, project.studioExternalId);
  const explicitMembership = await ctx.db
    .query("projectMembers")
    .withIndex("by_project_user", (q) => q.eq("projectId", project._id).eq("userId", member.user._id))
    .unique();

  // An explicit suspension/removal must never fall through to a legacy
  // creator or studio-owner shortcut.
  if (explicitMembership && explicitMembership.status !== "ACTIVE") {
    throw new ConvexAuthorizationError("PROJECT_ACCESS_DENIED", "You are not authorized to access this project.");
  }

  let projectRole: ProjectRole | null = explicitMembership?.status === "ACTIVE" ? explicitMembership.role : null;
  let migrationFallback = false;

  if (!projectRole && (project.ownerUserId === member.user._id || project.createdByUserId === member.user._id)) {
    projectRole = "OWNER";
    migrationFallback = true;
  } else if (!projectRole && project.createdByExternalId === member.identity.externalId) {
    projectRole = "OWNER";
    migrationFallback = true;
  }

  if (!projectRole || !hasProjectRole(projectRole, allowedRoles)) {
    throw new ConvexAuthorizationError("PROJECT_ACCESS_DENIED", "You are not authorized to access this project.");
  }

  return { ...member, project, projectRole, migrationFallback };
}

export async function requireProjectRole(
  ctx: AuthorizationCtx,
  projectId: Doc<"projects">["_id"],
  allowedRoles: readonly ProjectRole[],
  options?: { includeInactive?: boolean },
) {
  return await requireProjectAccess(ctx, projectId, allowedRoles, { includeInactive: options?.includeInactive });
}

/** Require an owner/admin role; the current schema only defines the owner role. */
export async function requireAdmin(
  ctx: AuthorizationCtx,
  studioExternalId: string,
): Promise<AuthorizedMember> {
  const member = await requireMember(ctx, studioExternalId);
  if (member.role !== "owner" && member.role !== "admin") {
    throw new ConvexAuthorizationError(
      "ADMIN_REQUIRED",
      "Studio administrator access is required.",
    );
  }
  return member;
}

/** Require an owner/admin role using a canonical studio ID. */
export async function requireAdminById(
  ctx: AuthorizationCtx,
  studioId: Doc<"studios">["_id"],
): Promise<AuthorizedMember> {
  const member = await requireMemberById(ctx, studioId);
  if (member.role !== "owner" && member.role !== "admin") {
    throw new ConvexAuthorizationError(
      "ADMIN_REQUIRED",
      "Studio administrator access is required.",
    );
  }
  return member;
}
