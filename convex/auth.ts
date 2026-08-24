import { Password } from "@convex-dev/auth/providers/Password";
import { Email } from "@convex-dev/auth/providers/Email";
import { convexAuth, getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import { ConvexError } from "convex/values";

const emailDeliveryEnabled = process.env.CONVEX_AUTH_EMAIL_ENABLED === "true";

function parseSender(value: string) {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return match
    ? { name: match[1] || "FinalFrame", address: match[2] }
    : { name: "FinalFrame", address: value.trim() };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

const emailProvider = Email({
  id: "email",
  maxAge: 60 * 60,
  async sendVerificationRequest({ identifier, url, expires, token }) {
    const apiKey = process.env.CONVEX_AUTH_ZEPTOMAIL_TOKEN;
    const from = process.env.CONVEX_AUTH_FROM_EMAIL;
    if (!apiKey || !from) {
      throw new Error("Email delivery is enabled but ZeptoMail is not configured.");
    }

    const sender = parseSender(from);
    const safeUrl = escapeHtml(url);
    const safeToken = escapeHtml(token);

    const response = await fetch("https://api.zeptomail.com/v1.1/email", {
      method: "POST",
      headers: {
        Authorization: `Zoho-enczapikey ${apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: sender,
        to: [{ email_address: { address: identifier } }],
        subject: "Your FinalFrame verification link",
        htmlbody: `<p>Continue to FinalFrame:</p><p><a href="${safeUrl}">Verify your email</a></p><p>Or enter this verification code: <strong>${safeToken}</strong></p><p>This code expires at ${escapeHtml(expires.toISOString())}.</p>`,
      }),
    });
    if (!response.ok) throw new Error("We couldn't send the authentication email. Please try again.");
  },
});

const passwordProvider = Password({
  profile: (params) => {
    const email = typeof params.email === "string" ? params.email.trim().toLowerCase() : "";
    if (!email) throw new Error("A valid email address is required.");

    const name = typeof params.name === "string" ? params.name.trim() : "";
    return { email, name };
  },
  ...(emailDeliveryEnabled ? { reset: emailProvider, verify: emailProvider } : {}),
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
    beforeSessionCreation: async (ctx, { userId }) => {
      const user = await ctx.db.get(userId);
      if (user?.status === "disabled") {
        throw new Error("This account is disabled. Contact FinalFrame support.");
      }
    },
  },
});

export const AUTH_INTEGRATION = {
  identitySource: "ctx.auth.getUserIdentity",
  externalIdSource: "getAuthUserId(ctx)",
  providerConfigured: emailDeliveryEnabled,
  passwordProvider: true,
  passwordResetProvider: emailDeliveryEnabled,
  emailVerificationProvider: emailDeliveryEnabled,
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

    const canonicalMembership = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
    const legacyMembership = !canonicalMembership
      ? await ctx.db.query("studioMembers")
        .withIndex("by_user", (q) => q.eq("userExternalId", userId.toString()))
        .filter((q) => q.eq(q.field("status"), "active"))
        .first()
      : null;
    const studio = canonicalMembership
      ? await ctx.db.get(canonicalMembership.studioId)
      : legacyMembership?.studioExternalId
        ? await ctx.db.query("studios").withIndex("by_external_id", (q) => q.eq("externalId", legacyMembership.studioExternalId)).first()
      : await ctx.db
        .query("studios")
        .withIndex("by_owner", (q) => q.eq("ownerExternalId", userId.toString()))
        .first();
    const role = canonicalMembership?.role ?? legacyMembership?.role ?? (studio ? "owner" : null);
    const metadata = studio?.metadata && typeof studio.metadata === "object"
      ? studio.metadata as Record<string, unknown>
      : {};

    return {
      id: userId.toString(),
      email: user.email ?? "",
      name: user.name ?? null,
      onboardingCompleted: metadata.onboardingCompleted === true,
      isAdmin: role === "owner" || role === "admin",
      role,
      studioExternalId: studio?.externalId ?? null,
      createdAt: user._creationTime,
    };
  },
});
