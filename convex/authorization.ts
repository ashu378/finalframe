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

/** Return the current application's user, if the verified identity is known. */
export async function getUser(ctx: AuthorizationCtx): Promise<AuthorizedUser | null> {
  const identity = await getIdentity(ctx);
  if (!identity) return null;

  const user = await ctx.db
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
    .withIndex("by_external_id", (q) => q.eq("externalId", identity.externalId))
    .unique();

  if (!user) {
    throw new ConvexAuthError(
      "USER_NOT_FOUND",
      "The authenticated user is not provisioned in Convex.",
    );
  }

  return { identity, user };
}

/**
 * Require access to an existing studio.
 *
 * The current schema has an owner relation but no membership table, so this
 * helper deliberately authorizes only the provisioned owner. It does not
 * accept an owner/user ID from the caller.
 */
export async function requireStudio(
  ctx: AuthorizationCtx,
  studioExternalId: string,
): Promise<Studio> {
  const { identity } = await requireUser(ctx);
  const studio = await ctx.db
    .query("studios")
    .withIndex("by_external_id", (q) => q.eq("externalId", studioExternalId))
    .unique();

  if (!studio) {
    throw new ConvexAuthorizationError(
      "STUDIO_NOT_FOUND",
      "Studio not found.",
    );
  }

  if (studio.ownerExternalId !== identity.externalId) {
    throw new ConvexAuthorizationError(
      "STUDIO_ACCESS_DENIED",
      "You are not authorized to access this studio.",
    );
  }

  return studio;
}

/**
 * Require studio membership using the ownership model currently present in
 * schema.ts. A future studio-members table can extend this function while
 * preserving its fail-closed contract.
 */
export async function requireMember(
  ctx: AuthorizationCtx,
  studioExternalId: string,
): Promise<AuthorizedMember> {
  const authorizedUser = await requireUser(ctx);
  const studio = await ctx.db
    .query("studios")
    .withIndex("by_external_id", (q) => q.eq("externalId", studioExternalId))
    .unique();

  if (!studio) {
    throw new ConvexAuthorizationError(
      "STUDIO_NOT_FOUND",
      "Studio not found.",
    );
  }

  if (studio.ownerExternalId !== authorizedUser.identity.externalId) {
    throw new ConvexAuthorizationError(
      "NOT_A_MEMBER",
      "You are not a member of this studio.",
    );
  }

  return { ...authorizedUser, studio, role: "owner" };
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

