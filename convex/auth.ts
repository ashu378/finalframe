import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth, getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import { ConvexError } from "convex/values";

const passwordProvider = Password({
  profile: (params) => {
    const email = typeof params.email === "string" ? params.email.trim().toLowerCase() : "";
    if (!email) throw new Error("A valid email address is required.");

    const name = typeof params.name === "string" ? params.name.trim() : "";
    return { email, name };
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [passwordProvider],
  callbacks: {
    // Keep the application user keyed to Convex Auth's verified user id. This
    // is metadata derived from the auth lifecycle, never from request args.
    afterUserCreatedOrUpdated: async (ctx, { userId, profile }) => {
      await ctx.db.patch(userId, {
        externalId: userId.toString(),
        authSubject: userId.toString(),
        name: typeof profile.name === "string" ? profile.name : undefined,
        email: typeof profile.email === "string" ? profile.email : undefined,
        updatedAt: Date.now(),
      });
    },
  },
});

export const AUTH_INTEGRATION = {
  identitySource: "ctx.auth.getUserIdentity",
  externalIdSource: "getAuthUserId(ctx)",
  providerConfigured: true,
  passwordProvider: true,
  passwordResetProvider: false,
} as const;

export type AuthErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_IDENTITY"
  | "USER_NOT_FOUND";

export type AuthorizationErrorCode =
  | "STUDIO_NOT_FOUND"
  | "STUDIO_ACCESS_DENIED"
  | "NOT_A_MEMBER"
  | "ADMIN_REQUIRED"
  | "MEMBERSHIP_NOT_CONFIGURED";

export type AuthErrorData = {
  code: AuthErrorCode;
  message: string;
};

export type AuthorizationErrorData = {
  code: AuthorizationErrorCode;
  message: string;
};

/** A typed, stable error for missing or unusable authenticated identity. */
export class ConvexAuthError extends ConvexError<AuthErrorData> {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super({ code, message });
    this.name = "ConvexAuthError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** A typed, stable error for resource and role authorization failures. */
export class ConvexAuthorizationError extends ConvexError<AuthorizationErrorData> {
  readonly code: AuthorizationErrorCode;

  constructor(code: AuthorizationErrorCode, message: string) {
    super({ code, message });
    this.name = "ConvexAuthorizationError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Server-readable auth state for Next.js guards. The user id comes from the
 * verified Convex Auth session, not from a caller-supplied identity value.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
    if (!user) return null;

    const studio = await ctx.db
      .query("studios")
      .withIndex("by_owner", (q) => q.eq("ownerExternalId", userId.toString()))
      .unique();

    return {
      id: userId.toString(),
      email: user.email ?? "",
      name: user.name ?? null,
      onboardingCompleted: Boolean(studio),
      isAdmin: false,
      studioExternalId: studio?.externalId ?? null,
      createdAt: user._creationTime,
    };
  },
});
