import { Password } from "@convex-dev/auth/providers/Password";
import { Email } from "@convex-dev/auth/providers/Email";
import { convexAuth, getAuthUserId, retrieveAccount } from "@convex-dev/auth/server";
import { query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { currentStudioForUser } from "./studioMemberships";
import { sendTransactionalEmail } from "../src/lib/auth/transactional-email";
import { hasActiveSession } from './authSession';

import { internal } from "./_generated/api";
import { EMAIL_CODE_TTL_SECONDS, normalizeAuthEmail, emailEnabledFor, sixDigitCode, authEmailMessage } from "../src/lib/auth/email-policy";

const emailDeliveryEnabled = process.env.CONVEX_AUTH_EMAIL_ENABLED === "true";
const makeEmailProvider = (purpose: 'verify' | 'reset') => Email({
  id: purpose === 'reset' ? 'password-reset' : 'email-verification',
  maxAge: EMAIL_CODE_TTL_SECONDS,
  generateVerificationToken: async () => sixDigitCode(),
  async sendVerificationRequest({ identifier, token }) {
    await sendTransactionalEmail(authEmailMessage(purpose, identifier, token, process.env.SITE_URL || ''));
  },
});
const profile = (params: Record<string, unknown>) => ({
  email: normalizeAuthEmail(params.email),
  ...(typeof params.name === 'string' && params.name.trim() ? { name: params.name.trim() } : {}),
});
const legacyPassword = Password({ profile });
const verifiedPassword = Password({ profile, reset: makeEmailProvider('reset'), verify: makeEmailProvider('verify') });
const passwordProvider = {
  ...verifiedPassword,
  authorize: async (params: Parameters<typeof verifiedPassword.authorize>[0], ctx: Parameters<typeof verifiedPassword.authorize>[1]) => {
    const email = normalizeAuthEmail(params.email);
    const normalized = { ...params, email };
    if (!emailEnabledFor(email, process.env)) return legacyPassword.authorize(normalized, ctx);
    const flow = params.flow;
    if (params.code !== undefined && (typeof params.code !== 'string' || !/^\d{6}$/.test(params.code))) throw new Error('Enter the six-digit code from your email.');
    let sends = flow === 'signUp' || flow === 'reset' || (flow === 'email-verification' && params.code === undefined);
    if (flow === 'signIn') {
      const found = await retrieveAccount(ctx, { provider: 'password', account: { id: email, secret: String(params.password || '') } });
      if (!found) throw new Error('Invalid credentials.');
      sends = !found.account.emailVerified;
    }
    try {
    if (sends) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
      const identifierHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
      await ctx.runMutation(internal.authEmailLimits.consume, { identifierHash });
    }
    return await verifiedPassword.authorize(normalized, ctx);
    } catch (error) {
      if (flow === 'reset') return null; // Avoid disclosing account existence.
      throw error;
    }
  },
};

export const emailAvailability = query({
  args: {}, returns: v.object({ enabled: v.boolean() }),
  handler: async () => ({ enabled: emailDeliveryEnabled }),
});

export const { auth, signIn, signOut, store } = convexAuth({
  providers: [passwordProvider],
  signIn: { maxFailedAttempsPerHour: 5 },
  callbacks: {
    // Keep the application user keyed to Convex Auth's verified user id. This
    // is metadata derived from the auth lifecycle, never from request args.
    afterUserCreatedOrUpdated: async (ctx, { userId, profile }) => {
      await ctx.db.patch(userId, {
        externalId: userId.toString(),
        authSubject: userId.toString(),
        ...(typeof profile.name === "string" ? { name: profile.name } : {}),
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

export const isAuthenticated = query({
  args: {}, returns: v.boolean(),
  handler: hasActiveSession,
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
  | "MEMBERSHIP_NOT_CONFIGURED"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_ACCESS_DENIED";

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
  returns: v.union(v.null(), v.object({ id: v.string(), email: v.string(), name: v.union(v.string(), v.null()), onboardingCompleted: v.boolean(), isAdmin: v.boolean(), role: v.union(v.null(), v.literal('owner'), v.literal('admin'), v.literal('member')), studioExternalId: v.union(v.string(), v.null()), createdAt: v.number() })),
  handler: async (ctx) => {
    if (!(await hasActiveSession(ctx))) return null;
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
    if (!user || user.status === 'disabled') return null;

    const selected = await currentStudioForUser(ctx, user, userId.toString());
    const studio = selected?.studio ?? null;
    const role = selected?.role ?? null;
    const metadata = studio?.metadata && typeof studio.metadata === "object"
      ? studio.metadata as Record<string, unknown>
      : {};

    return {
      id: userId.toString(),
      email: user.email ?? "",
      name: user.displayName ?? user.name ?? null,
      onboardingCompleted: metadata.onboardingCompleted === true,
      isAdmin: role === "owner" || role === "admin",
      role,
      studioExternalId: studio?.externalId ?? null,
      createdAt: user._creationTime,
    };
  },
});
