import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password()],
});

export const AUTH_INTEGRATION = {
  identitySource: "ctx.auth.getUserIdentity",
  externalIdSource: "identity.subject",
  providerConfigured: false,
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
