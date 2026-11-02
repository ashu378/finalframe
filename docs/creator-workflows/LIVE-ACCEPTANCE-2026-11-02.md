# FinalFrame small live acceptance — 2 November 2026

Seven real, short video-generation jobs completed against **online development Convex `knowing-snail-785`**, using the new owner-provided OpenRouter key. No local database was started. These were paid planning and generation calls, not mock outputs. Each request produced one scene, one shot and one new take. Technical completion is separate from the owner’s creative approval and a renderer export.

## Spending

- Working application budget: **US$10**, shared across both allowed test studios and all capabilities/retries.
- Absolute deployment and provider-key ceiling: **US$15**; this replaces the old US$40 allowance.
- Actual planning plus video receipts: **US$1.08202446** (about **$1.08**).
- Backend rounded ledger: **US$1.082028 spent, US$0 reserved**.
- Unused working budget: about **US$8.918**. This is an application-budget calculation, not a claim about the account’s cash balance.
- The provider key’s aggregate usage counter lagged the final $0.1188 receipt at reconciliation. The higher settled receipt/ledger figure is used here. No uncertain reservations were released to manufacture headroom.
- No automatic paid retry or fallback purchase was sent. Each video job has one attempt and an actual provider job ID. Duplicate creation returned the existing job in every case.

## Actual samples

All planners used **`openai/gpt-6-sol`**, configured through the central registry’s environment settings and verified against the live catalog. Video models were chosen through refreshed, reviewed studio route policies. All clips are silent; silence was explicitly requested to bound this first pass.

| Sample | Video model | Duration / dimensions | Planning USD | Video USD | Result |
| --- | --- | --- | ---: | ---: | --- |
| Cinematic short | `google/veo-3.1-lite` | 4.000s / 1280×720 | 0.00876744 | 0.11880000 | COMPLETED / REVIEW_READY |
| 2D comedy animation | `bytedance/seedance-2.0-mini` | 4.042s / 1280×720 | 0.01116126 | 0.30249450 | COMPLETED / REVIEW_READY |
| UGC-style supporting footage | `google/veo-3.1-lite` | 4.000s / 1280×720 | 0.00935748 | 0.11880000 | COMPLETED / REVIEW_READY |
| Product launch supporting footage | `google/veo-3.1-lite` | 4.000s / 1280×720 | 0.00833184 | 0.11880000 | COMPLETED / REVIEW_READY |
| Explainer visual (no narration) | `google/veo-3.1-lite` | 4.000s / 1280×720 | 0.01012374 | 0.11880000 | COMPLETED / REVIEW_READY |
| Music-video visual (no soundtrack) | `google/veo-3.1-lite` | 4.000s / 1280×720 | 0.00898722 | 0.11880000 | COMPLETED / REVIEW_READY |
| Portrait social footage (not source repurposing) | `google/veo-3.1-lite` | 4.000s / 720×1280 | 0.01000098 | 0.11880000 | COMPLETED / REVIEW_READY |

The first cinematic test belongs to the isolated internal test account. The other six clips and the graphics project belong to the owner’s existing account (`peterboris2020@gmail.com`) and appear as **Live acceptance · …** projects. Projects and assets are retained for review. Completed takes are still drafts awaiting deliberate creative review; no human approval was fabricated.

## Motion graphics: separate deterministic path

A manually authored four-second `brand-card` production was created through canonical `productions.ts`, approved, composed into a timeline, approved/locked, and assembled into manifest v4. Exact title **Make ideas move** and brand name **FinalFrame** survived the contract unchanged. Composition replay returned the same timeline. Provider calls: **0**. Renderer submissions: **0**. This verifies the real template/timeline/manifest contract, not a completed rendered graphics video.

## Errors found and fixes

1. **Project cards opened a 404.** The dynamic route parameter retained `%7C`, while the canonical external ID contained `|`. Added one shared route-boundary decoder to detail, blueprint, production, editor and workspace routes, retaining Convex authorization. Eleven regression checks cover escaped/plain IDs, malformed input and single decoding. Local and deployed browser checks passed afterward.
2. **Legacy detail view displayed a stale project approval state.** Project lifecycle correctly remains separate from production approval. Projects with a canonical production now open its actual workspace rather than showing the legacy approval prompt.
3. **Old budget authority still allowed $40.** Lowered the aggregate configuration ceiling to $15, configured the single active budget to $10, and verified online that $15.01 is rejected before a write/provider call.
4. **Seedance’s actual charge slightly exceeded the catalog-only estimate.** Added a five-percent plus one-cent video reservation margin. Settlement still uses the exact receipt and releases unused held funds. Added a regression using the observed live discrepancy.
5. **Intermittent workstation-to-cloud connection timeouts interrupted setup/download operations.** The driver stopped and resumed only the affected no-cost operations. Accepted generations were retained and not repurchased. No customer data or unrelated server configuration was changed.

## Verification

- Seven live planning requests, canonical approvals and real generation jobs passed.
- Seven duplicate-submission assertions passed; all video attempt counts remain one.
- Durable jobs survived the browser/driver boundaries and stored their real results in Convex Storage.
- Deployed Contabo FFprobe validated generated video dimensions, aspect ratio and duration before jobs became review-ready.
- Downloaded all seven real provider clips; independent FFprobe confirms H.264, six landscape 1280×720 outputs and one portrait 720×1280 output. Seedance’s requested four-second clip is 4.041667 seconds; the others are four seconds.
- Opened the saved comedy take in the owner’s deployed workspace. Its completed status, provider/model, actual cost and download link were visible. Browser playback reached the end with readyState 4 and no media error; no console errors were recorded on that tested view.
- Production build passed (44 static pages), TypeScript passed, changed-file lint passed, 11 project-route checks passed, eight worker-policy checks passed, eight text-budget checks passed, financial contracts passed, and the eight-type routing/provider contract suites passed. Pure contracts used mocks, not a database or paid inference.

## Deployment and configuration

Fix commit **`7266ad6`** is deployed to Vercel **Preview**, deployment `7Sso5gLDXK6Qwvu6neAnUvhndu4g` (Ready). Backend changes were pushed to online development Convex. Preview-only `NEXT_PUBLIC_FF_VIDEO_TYPE_ROUTING=true` was saved; provider credentials remain in Convex and were not copied into browser configuration or Git. Additional harness/report changes are recorded in the following source checkpoint.

- Preview: https://finalframe-git-codex-finalframe-ready-check-ashu378s-projects.vercel.app
- Local frontend: http://127.0.0.1:3000, started with `NEXT_PUBLIC_FF_VIDEO_TYPE_ROUTING=true`.
- `FINALFRAME_PAID_TEST_RUN=live-acceptance-20261102` and video worker enabled only behind the allowed-studio budget.
- Preparation worker and render-dispatch worker remain disabled. Billing and email remain disabled.
- Development-only auditable internal credit grants were used; no real payment or purchase record was created.
- Yafpay, other Vercel/Convex projects, production Convex and the main production frontend were not changed.

## Not established by this pass

This is a successful initial planning-to-generated-take acceptance pass, not a claim that every advertised workflow is production-ready. Still required: the owner-run genuine renderer/export/callback/download test; creative review of complete clips; narration/TTS, transcription, voice consent/cloning/lip sync; licensed music synchronization; reference and first/last-frame control; instructed editing, appearance/object/performance operations and extensions; real source-video repurposing; exact logo/product-UI compositing output; selected-scene/full-project assembly and long-form continuity; and valid completed-export client review. Seven text-to-video style samples do not prove those distinct capabilities.

Known pre-launch follow-up: the legacy dashboard overview still derives summary counters/recent activity from studio-level records and can include retained inactive project records. Its project-permission filtering and counters need a dedicated regression pass before a public launch; project cards themselves use the project access list. No new production-readiness claim is made for that older summary path.

## Reproduction and rollback

The opt-in driver is `scripts/controlled-tests/run-small-video-tests.mjs`, with explicit `prepare`, `plan`, `queue`, `status` and `download` phases. It requires online development, an authenticated test owner, a server-configured reviewed model policy and active capped budget. Paid phases additionally require `FINALFRAME_ALLOW_PAID_TESTS=true`. It never submits a renderer export. Model IDs and aspect ratio are test configuration, not hardcoded feature routing. `scripts/controlled-tests/run-motion-graphics-contract.mjs` verifies the separate manually authored path without a paid provider.

To pause further spending, pause the existing budget or disable `FINALFRAME_GENERATION_WORKER_ENABLED`; retain accepted provider IDs, reservations, immutable approved versions and audit receipts. Never create a new budget key to reset spent funds. No projects, assets or audit records were purged.
