import type { UserIdentity } from "convex/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ConvexAuthError } from "./auth";

export type IdentityCtx = Pick<QueryCtx | MutationCtx, "auth">;

/**
 * Identity normalized from a verified Convex JWT.
 *
 * `subject` is intentionally the only external user key used here. It is a
 * verified claim supplied by Convex, never a caller-provided function arg.
 */
export type FinalFrameIdentity = {
  tokenIdentifier: string;
  subject: string;
  issuer: string;
  externalId: string;
  email?: string;
  name?: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isUsableIdentity(identity: UserIdentity | null): identity is UserIdentity {
  return (
    identity !== null &&
    isNonEmptyString(identity.tokenIdentifier) &&
    isNonEmptyString(identity.subject) &&
    isNonEmptyString(identity.issuer)
  );
}

/**
 * Read the verified request identity, returning null for every unusable auth
 * state. In particular, this does not fall back to function arguments,
 * headers, or application-level user IDs.
 */
export async function getIdentity(ctx: IdentityCtx): Promise<FinalFrameIdentity | null> {
  let identity: UserIdentity | null;

  try {
    identity = await ctx.auth.getUserIdentity();
  } catch {
    // A provider/configuration failure must not become an authorization bypass.
    return null;
  }

  if (!isUsableIdentity(identity)) return null;

  return {
    tokenIdentifier: identity.tokenIdentifier,
    subject: identity.subject,
    issuer: identity.issuer,
    externalId: identity.subject,
    email: isNonEmptyString(identity.email) ? identity.email : undefined,
    name: isNonEmptyString(identity.name) ? identity.name : undefined,
  };
}

/** Require a verified Convex identity and fail closed when it is unavailable. */
export async function requireIdentity(ctx: IdentityCtx): Promise<FinalFrameIdentity> {
  const identity = await getIdentity(ctx);
  if (!identity) {
    throw new ConvexAuthError(
      "UNAUTHENTICATED",
      "A verified Convex identity is required for this operation.",
    );
  }
  return identity;
}

