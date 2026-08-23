import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

export type ReadCtx = QueryCtx | MutationCtx;
export type StudioId = Id<"studios">;
export type UserId = Id<"users">;

/** Return the canonical studio record for a legacy external studio key. */
export async function getStudio(ctx: ReadCtx, studioExternalId: string) {
  return await ctx.db
    .query("studios")
    .withIndex("by_external_id", (q) => q.eq("externalId", studioExternalId))
    .unique();
}

/** Require that the caller owns the studio identified by the legacy key. */
export async function requireStudio(ctx: ReadCtx, studioExternalId: string, ownerExternalId?: string) {
  const studio = await getStudio(ctx, studioExternalId);
  if (!studio || (ownerExternalId !== undefined && studio.ownerExternalId !== ownerExternalId)) {
    throw new Error("Studio not found");
  }
  return studio;
}

/** Resolve a studio by its internal Convex ID. */
export async function requireStudioById(ctx: ReadCtx, studioId: StudioId) {
  const studio = await ctx.db.get(studioId);
  if (!studio) {
    throw new Error("Studio not found");
  }
  return studio;
}

/** Require an active member, allowing the owner before membership backfill. */
export async function requireStudioMember(ctx: ReadCtx, studioExternalId: string, userExternalId: string) {
  const studio = await getStudio(ctx, studioExternalId);
  if (!studio) {
    throw new Error("Studio not found");
  }
  if (studio.ownerExternalId === userExternalId) {
    return { studio, membership: null };
  }

  const membership = await ctx.db
    .query("studioMembers")
    .withIndex("by_studio_user", (q) => q.eq("studioExternalId", studioExternalId).eq("userExternalId", userExternalId))
    .unique();
  if (!membership || membership.status !== "active") {
    throw new Error("Studio access denied");
  }
  return { studio, membership };
}

/** Require a member by canonical IDs once identity backfill is complete. */
export async function requireStudioMemberById(ctx: ReadCtx, studioId: StudioId, userId: UserId) {
  const studio = await requireStudioById(ctx, studioId);
  if (studio.ownerId === userId) {
    return { studio, membership: null };
  }

  const membership = await ctx.db
    .query("studioMembers")
    .withIndex("by_studio_user_id", (q) => q.eq("studioId", studioId).eq("userId", userId))
    .unique();
  if (!membership || membership.status !== "active") {
    throw new Error("Studio access denied");
  }
  return { studio, membership };
}

/** Fetch a production only after enforcing its studio ownership boundary. */
export async function getProduction(ctx: ReadCtx, productionId: string, ownerExternalId?: string) {
  const production = await ctx.db.get(productionId as Id<"productions">);
  if (!production) {
    throw new Error("Production not found");
  }
  await requireStudio(ctx, production.studioExternalId, ownerExternalId);
  return production;
}

/** Type guard for records carrying normalized studio ownership keys. */
export function hasStudioOwnership(record: { studioExternalId?: string; studioId?: StudioId }): record is { studioExternalId: string; studioId?: StudioId } {
  return typeof record.studioExternalId === "string" || record.studioId !== undefined;
}

/** Keep timestamps consistent across mutations and append-only events. */
export function now() {
  return Date.now();
}

export type StudioOwnedRecord = Pick<Doc<"assets">, "studioExternalId" | "studioId">;
