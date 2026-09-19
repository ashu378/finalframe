# FinalFrame Phase 1 controlled testing

This document records the production-readiness work completed for controlled testing. It deliberately excludes billing, email delivery, image generation, and paid generation. No paid provider request or real MP4 render was run while implementing this phase.

## Model routing

Feature code selects a logical capability from the registry in `src/lib/ai/model-registry.ts`. The registry resolves the capability to an OpenRouter model, fallback models, modality contract, context window, and cost tier. `auto`, `openrouter/auto`, and `openrouter/auto-beta` are rejected. Retired IDs are rejected when supplied through deployment variables. Structured planning and validation require the strict schema path.

The current defaults are:

| Capability | Preferred | Fallbacks |
| --- | --- | --- |
| planner | `openai/gpt-6-astra-pro` | `openai/gpt-6-astra`, `anthropic/claude-fable-5.1`, `google/gemini-3.8-flash` |
| writer | `openai/gpt-6-astra-pro` | `openai/gpt-6-astra`, `google/gemini-3.8-flash` |
| director | `openai/gpt-6-astra-pro` | planner fallbacks |
| orchestrator | `openai/gpt-6-astra-pro` | AI brain fallbacks |
| validator | `google/gemini-3.8-flash` | `openai/gpt-6-astra-pro` |
| vision QC | `google/gemini-3.8-flash` | none by default; configure `OPENROUTER_VALIDATION_FALLBACK_MODELS` when needed |
| video preview | `bytedance/seedance-2.0-mini` | `google/veo-3.1-lite`, `kwaivgi/kling-v3.0-std` |
| video final | `bytedance/seedance-2.5` | `google/veo-3.1`, `openai/sora-2-pro`, `kwaivgi/kling-v3.0-pro` |
| TTS | `google/gemini-3.1-flash-tts-preview` | `x-ai/grok-voice-tts-1.0`, `microsoft/mai-voice-2` |
| STT | `openai/gpt-transcribe` | `microsoft/mai-transcribe-2`, `x-ai/grok-stt-1.0`, `deepgram/nova-3` |
| image | `openai/gpt-image-2` | `google/gemini-3.1-flash-image` (deferred) |

The video engine maps `FAST_SOCIAL` to the preview capability and other execution profiles to the final capability. Provider request ID, provider cost, and latency are persisted on the generation job when OpenRouter returns them.

## Runway status

Runway is legacy compatibility code. No production source imports `runway-adapter.ts`, and the adapter throws unless `RUNWAY_LEGACY_ENABLED=true`. Keep it `false`; OpenRouter is the only production video gateway.

## Development test credits

The existing Convex ledger is used. A grant:

- requires an authenticated owner/admin for the target studio;
- requires both `FINALFRAME_TEST_CREDITS_ENABLED=true` and `FINALFRAME_TEST_CREDITS_ENV=development` in the **development Convex deployment**;
- creates a `TEST_CREDIT_GRANT` ledger entry and `TEST_CREDITS_GRANTED` audit entry;
- is idempotent by `test-credit:<idempotencyKey>`;
- cannot create a payment record; and
- is unavailable in production when either flag is absent or false.

To grant credits to the signed-in admin's studio:

1. In the development Convex deployment, set the two flags above. Do not set them on the production deployment.
2. Open `/admin/credits` while signed in as an owner/admin.
3. Use **Grant controlled test credits**, choose an integer amount from 1 to 10,000, enter a reason, and provide a unique idempotency key such as `qa-account-2026-09-20`.
4. Confirm the new balance and the audit entry. Reusing the same key returns the original grant instead of adding credits twice.

The form is only an admin surface; Convex repeats the authorization and development-flag checks server-side.

## Controlled tests

### TEST A — no AI cost

With OpenRouter media disabled or without an API key, verify signup, login, dashboard access, project creation, project persistence, blueprint, production workspace, editor, and media library. These routes should not call OpenRouter or create generation jobs.

### TEST B — LLM only

In a development deployment with `OPENROUTER_API_KEY` configured, create an idea, create a production plan, revise it, and approve it. Confirm the job records the model actually used and provider request/usage metadata when supplied. Do not invoke image, video, TTS, or STT actions.

### TEST C — prepare one media job, do not execute it here

Use one test account with a small development-credit grant. Confirm the video request is configured for one shot and a 4–5 second preview, and that the job stores capability, provider, model, provider job ID, request ID, estimated/actual cost, latency, errors, and retry count. The owner may run this one paid test separately; the implementer did not execute it.

### TEST D — asset to timeline

After an approved generation job has a canonical Convex Storage asset, confirm the completed shot version points to that asset. Create or refresh the timeline and confirm the timeline clip contains both `assetId` and `shotVersionId`. Assembly reads both relationships into its manifest.

### TEST E — renderer only

Use an existing uploaded fixture or safe local media. Build the timeline manifest, create a render job, let the existing VPS renderer process it, and verify the output is uploaded to Convex Storage and downloadable. This test does not call OpenRouter and is the owner's MP4 test.

## Required environment now

At minimum, the development app needs `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_SITE_URL`, `OPENROUTER_API_KEY` for TEST B, and the model override variables in `.env.local.example` when pinning models. The renderer needs `RENDER_WORKER_URL` and the same `RENDER_WORKER_SHARED_SECRET` in Coolify and Convex. Keep provider keys and Convex deploy keys server-side. Keep `CONVEX_AUTH_EMAIL_ENABLED=false`, `RUNWAY_LEGACY_ENABLED=false`, and `FINALFRAME_TEST_CREDITS_ENABLED=false` on production.

## Remaining blockers before paid generation

- Owner must configure and verify the development OpenRouter key and confirm the selected account has sufficient balance.
- Owner must perform TEST B and inspect the stored model/request metadata.
- Owner must perform one controlled TEST C media job and TEST D relationship check.
- Owner must perform TEST E with the existing renderer and confirm the downloaded MP4.
- Production billing, email delivery, and image generation remain intentionally disabled until their separate verification work is approved.
