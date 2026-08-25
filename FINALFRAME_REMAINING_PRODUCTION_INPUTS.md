# FinalFrame remaining production inputs

**Updated:** 25 August 2026

This is the handoff after the credit-accounting and Bachs payment implementation. It separates repository work that is complete from external setup and live verification that cannot be completed safely with code alone.

## Completed and verified in the repository

- Convex canonical wallet, reservations, append-only ledger, purchase records, and refund records are present.
- Credit reservation, commit, release, expiry, and reconciliation paths are idempotent.
- Bachs checkout, webhook verification, reconciliation, and refund provider adapter are present.
- Webhook fulfillment now requires the raw request body, timestamp freshness, HMAC verification, event deduplication, exact amount/currency matching, and canonical purchase correlation.
- Payment success credits the canonical wallet and ledger exactly once.
- Refund success reverses only safely available credits; refunds that would make the account negative are quarantined for operator review.
- Payment feature availability remains disabled until sandbox configuration is supplied.
- Typecheck, finance audit (11/11), Bachs contract tests, renderer contract tests, production audit, lint, and production build pass in the current workspace.
- Convex code generation completed successfully against the configured development deployment.

## Remaining before controlled paid production

### 1. Deploy the real renderer worker

The repository contains the renderer foundation and Convex render-job state machine, but it does not yet provide a publicly deployed worker with FFmpeg and FFprobe. The local machine also does not have those binaries.

The worker needs to:

1. Run the `renderer` package in a Linux container.
2. Install FFmpeg and FFprobe in that container.
3. Expose an HTTPS API for claiming/submitting render work.
4. Resolve authorized Convex media inputs, render with Remotion/FFmpeg, probe the output, upload the final file to Convex Storage, and send an authenticated idempotent callback.
5. Expose a health endpoint and enforce timeouts, file-size limits, cleanup, and request authentication.

Required owner/deployment inputs:

```text
RENDER_WORKER_URL=https://your-render-worker.example.com
RENDER_WORKER_SHARED_SECRET=<random secret stored in both services>
```

How to obtain them:

- Deploy a worker service on Render, Railway, Fly.io, Google Cloud Run, or an equivalent container host.
- The host gives you the HTTPS service URL; that becomes `RENDER_WORKER_URL`.
- Generate a long random secret locally, for example with `openssl rand -hex 32` or a password manager. Do not send it in chat. Set the same value in the worker and the Convex environment as `RENDER_WORKER_SHARED_SECRET`.
- Add a health check and run one real MP4 render before enabling export for users.

**Current status:** `UNKNOWN — REQUIRES DEPLOYMENT AND REAL MP4 VERIFICATION`.

### 2. Configure Bachs sandbox

Create or open the Bachs developer/sandbox account and provide configuration through environment variables, never source files or chat:

```text
BACHS_API_KEY=sk_sandbox_...
BACHS_API_BASE_URL=https://sandbox-api.bachs.io
BACHS_ENVIRONMENT=sandbox
BACHS_ALLOWED_CURRENCIES=NGN,USD
BACHS_WEBHOOK_TOLERANCE_SECONDS=300
BACHS_WEBHOOK_SECRET=...
NEXT_PUBLIC_FF_BACS_PAYMENTS=true
```

Create the webhook destination in the Bachs Developer Portal:

```text
https://<your-vercel-domain>/api/payments/bachs/webhook
```

Subscribe to `collection.succeeded`, `collection.failed`, `collection.underpaid`, `checkout.completed`, `checkout.expired`, `refund.created`, `refund.paid`, and `refund.failed`. Copy the endpoint signing secret into both the Vercel server environment and the Convex environment used by `paymentWebhook.receive`.

Run these sandbox checks before any live key is accepted:

- successful checkout credits once;
- duplicate webhook does not double-credit;
- underpayment is quarantined;
- failed/expired checkout does not credit;
- full refund reverses safely available credits;
- partial refund produces the expected proportional credit reversal;
- a refund after credits have been spent is quarantined for reconciliation;
- invalid signature and stale timestamp are rejected.

Official references: [Bachs checkout](https://docs.bachs.io/guides/checkout/checkout-sessions), [Bachs webhooks](https://docs.bachs.io/guides/webhooks/overview), and [Bachs refunds](https://docs.bachs.io/guides/refunds).

**Current status:** `IMPLEMENTED — LIVE SANDBOX DELIVERY STILL REQUIRED`.

### 3. Configure live AI execution

The OpenRouter gateway and deterministic fixtures are in the repository, but real generation quality, model access, spend, rate limits, and provider output delivery have not been proven with the owner account.

Required:

```text
OPENROUTER_API_KEY=...
OPENROUTER_SPEND_LIMIT=<approved limit>
```

The owner must approve the first enabled model/capability set and a spend limit. Run real tests for planning, image/video generation, transcription, speech, moderation, usage reporting, and provider failure handling. Do not enable every advertised workflow until its quality gate passes.

**Current status:** `UNKNOWN — REQUIRES LIVE PROVIDER CONTRACT AND QUALITY TESTS`.

### 4. Finish authentication email delivery when the sender domain exists

Email/password signup and login can work while email delivery is disabled. Password reset and email verification are intentionally unavailable in that mode.

The current implementation uses Zoho ZeptoMail, not Resend. When a domain and sender address are available, configure:

```text
CONVEX_AUTH_EMAIL_ENABLED=true
CONVEX_AUTH_ZEPTOMAIL_TOKEN=...
CONVEX_AUTH_FROM_EMAIL=FinalFrame <noreply@your-domain.com>
```

Until then, keep `CONVEX_AUTH_EMAIL_ENABLED=false`. Users can create accounts and log in; the UI explains that recovery email is not connected yet.

**Current status:** `DEVELOPMENT MODE AVAILABLE; PRODUCTION EMAIL REQUIRES VERIFIED SENDER DOMAIN`.

### 5. Run authenticated browser E2E

Required test inputs:

- a development or preview Convex URL;
- one ordinary creator test account;
- one owner/admin account;
- `NEXT_PUBLIC_CONVEX_URL` configured in the browser environment;
- a test email inbox only when verification/reset is enabled.

The no-email development path can test signup, login, logout, onboarding, dashboard access, creator/admin separation, and protected-route redirects. Verification and password-reset delivery cannot be tested until ZeptoMail is enabled.

The E2E flow must cover:

```text
Public page → signup → account/studio → onboarding → dashboard → logout → login → admin authorization
```

**Current status:** `UNKNOWN — REQUIRES AUTHENTICATED BROWSER RUN`.

### 6. Configure deployment environments

Vercel needs the public/runtime values:

```text
NEXT_PUBLIC_CONVEX_URL=https://knowing-snail-785.convex.cloud
NEXT_PUBLIC_SITE_URL=https://<your-vercel-domain>
OPENROUTER_API_KEY=...
BACHS_API_KEY=...
BACHS_API_BASE_URL=https://sandbox-api.bachs.io
BACHS_ENVIRONMENT=sandbox
BACHS_ALLOWED_CURRENCIES=NGN,USD
BACHS_WEBHOOK_TOLERANCE_SECONDS=300
BACHS_WEBHOOK_SECRET=...
RENDER_WORKER_URL=...
RENDER_WORKER_SHARED_SECRET=...
ERROR_TRACKING_DSN=...
```

Convex environment variables must include the server-only values used by Convex functions, especially `BACHS_WEBHOOK_SECRET`, and the Convex Auth/ZeptoMail values when email delivery is enabled. `CONVEX_DEPLOY_KEY` belongs only in local/CI deployment secrets, never in browser-exposed variables.

The previously exposed Convex deployment token must remain rotated and must not be reused.

### 7. Owner decisions still required

- Approve NGN/USD credit-pack pricing and refund policy.
- Approve the first paid workflow and its quality threshold.
- Provide approved brand/logo/font assets if the current assets are not final.
- Approve legal, privacy, rights, voice-consent, acceptable-use, and refund copy.
- Choose the renderer hosting provider and approve its cost limits.
- Choose the launch domain when ready.
- Nominate the first production admin account.

## Repository follow-up work still open

These are code/integration tasks, not owner secrets:

- Add the deployed renderer worker HTTP entrypoint and connect it to `renderJobs.claim`, `renderJobs.callback`, and Convex Storage.
- Run real MP4 assembly and ffprobe verification through that worker.
- Complete live OpenRouter capability probes and quality evaluation datasets.
- Run authenticated browser E2E and accessibility/responsive checks.
- Remove or isolate the legacy direct Runway adapter and stale historical Supabase references from production-facing code/docs if OpenRouter remains the locked production gateway.
- Replace any remaining technical terminology in secondary legacy screens and finish the final UI copy pass.
- Add production error tracking, alerts, provider budget alarms, payment reconciliation alerts, and incident runbooks.
- Perform a final Vercel preview audit with the exact environment variables used for launch.

## Launch decision

FinalFrame is ready for continued development and sandbox testing. It is not yet ready for paid public production because the renderer worker, live provider tests, authenticated browser E2E, payment sandbox, and operational/legal approvals remain external gates.
