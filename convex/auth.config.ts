import type { AuthConfig } from "convex/server";

// Password authentication is self-contained. OAuth/email delivery can be
// added later through Convex environment configuration without changing the
// identity helpers used by production functions.
export default {
  providers: [],
} satisfies AuthConfig;
