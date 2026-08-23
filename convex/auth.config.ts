import type { AuthConfig } from "convex/server";

// Convex Auth's Password provider is configured in auth.ts. This deployment
// config intentionally has no external JWT issuers: accepting an issuer here
// without its complete production configuration would widen the trust boundary.
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
