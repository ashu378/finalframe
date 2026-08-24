import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  ConvexAuthError,
  ConvexAuthorizationError,
} from "./auth";
import { getIdentity, requireIdentity, type FinalFrameIdentity } from "./identity";

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

async function getStudioByExternalId(ctx: AuthorizationCtx, studioExternalId: string) {
  return await ctx.db
    .query("studios")
    .withIndex("by_external_id", (q) => q.eq("externalId", studioExternalId))
    .unique();
}

async function getStudioById(ctx: AuthorizationCtx, studioId: Doc<"studios">["_id"]) {
  return await ctx.db.get(studioId);
}

/** Resolve a canonical membership, then the temporary legacy membership. */
async function resolveMembership(
  ctx: AuthorizationCtx,
  studio: Studio,
  authorizedUser: AuthorizedUser,
): Promise<StudioRole | null> {
  const canonicalMembership = await ctx.db
    .query("members")
    .withIndex("by_studio_user", (q) =>
      q.eq("studioId", studio._id).eq("userId", authorizedUser.user._id),
    )
    .unique();
  if (canonicalMembership?.status === "active") return canonicalMembership.role;

  const legacyMembership = await ctx.db
    .query("studioMembers")
    .withIndex("by_studio_user", (q) =>
      q.eq("studioExternalId", studio.externalId).eq("userExternalId", authorizedUser.identity.externalId),
    )
    .unique();
  if (legacyMembership?.status === "active") return legacyMembership.role;

  // Existing owner records predate canonical membership backfill. Owner
  // access is still safe because both values are compared with the verified
  // Convex user, never with a caller-supplied identity string.
  const ownerId = studio.ownerUserId ?? studio.ownerId;
  if (ownerId === authorizedUser.user._id) return "owner";
  if (!ownerId && studio.ownerExternalId === authorizedUser.identity.externalId) return "owner";

  return null;
}

/** Return the current application's user, if the verified identity is known. */
export async function getUser(ctx: AuthorizationCtx): Promise<AuthorizedUser | null> {
  const identity = await getIdentity(ctx);
  if (!identity) return null;

  const user = await ctx.db
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
