# FinalFrame Implementation Plan

## 1. Executive Summary

This final planning pass is based on the checked-out repository, the approved Master Implementation Specification, and the current AI video research workflow. FinalFrame is an existing Next.js application with Convex authentication/database/storage, a studio/project onboarding flow, AI blueprint generation, scene editing, OpenRouter-backed AI tasks, asset management, remixing, export, review links, templates, and studio teams.

The current system is a credible prototype for structured commercial/social video creation. It is not yet the target general-purpose AI production studio. The approved MVP customer loop is: **Describe it. Paste it. Upload it. Bring your own assets. Approve the cost. Get the video.** The largest gaps are:

- A project has scenes, but no durable `sequence -> scene -> shot -> shot version` production model.
- Assets belong to a studio library and store public URLs, but lack project ownership, semantic roles, provenance, versioning, and continuity entities.
- Rendering is a project/blueprint batch process rather than independently resumable shot jobs.
- Credits exist as a balance and ledger, but there is no Bachs-backed purchase flow, provider-neutral payment abstraction, reservation/commit/release accounting, or configurable cost engine.
- The model registry is centralized in one file but is capability/profile oriented and contains hard-coded assumptions; capability validation and provider fallback are incomplete.
- Voice, transcription, captions, music/SFX, timeline assembly, and long-form continuation are not yet complete as first-class workflows.

Recommended direction: evolve incrementally. Preserve the working Convex Auth foundation, project/scene editor, asset UI, review system, and renderer foundation. Add first-class performance, Bible, anchor-pack, shot/job, continuity, credit-reservation, and deterministic-assembly flows, then route the existing UI through them. Do not begin with a rewrite or a microservice split.

## 1.1 Corrected workflow framing

The flagship workflow is **2D animated comedy with optional idea, script, voice, footage, or mixed-media input**. It is not Nigerian-only, and it is not voice-upload-only. Nigerian/African comedy is one supported cultural/style preset and an important showcase direction, but users may come from any country and may create any supported style.

Voice is optional. Every workflow must support these entry paths:

1. **Idea-first:** the user describes the concept; FinalFrame creates the characters, voices, script treatment, visuals, and shot plan.
2. **Script-first:** the user pastes a script; FinalFrame identifies characters, dialogue, scenes, and required assets.
3. **Voice-first:** the user uploads a voice recording; FinalFrame transcribes it, segments speakers or dialogue turns, maps them to characters, and animates to the original performance.
4. **Mixed-media:** the user brings any combination of voice, script, characters, images, footage, products, logos, or references.

If one person performs multiple characters in a recording, FinalFrame may map the timed dialogue turns to different animated characters while preserving the uploaded audio. Voice cloning, voice transformation, dubbing, and lip-sync remain separate opt-in capabilities requiring consent and provider-quality verification. They are not required for the core 2D comedy workflow.

The implementation must never require a user to upload voice in order to create 2D comedy. AI-generated voices remain available when the user supplies only an idea or script, with explicit selection and cost approval.

## 2. Current FinalFrame Architecture

### Stack confirmed in repository

- Framework: Next.js 16 App Router, React 19, TypeScript 5.
- Styling/UI: Tailwind CSS, CSS modules, Framer Motion, Lucide, custom UI components.
- Package manager: npm (`package-lock.json`).
- Persistence/auth/storage: Convex Auth, Convex database, Convex Storage.
- AI: OpenRouter gateway for text, structured planning, image/video, speech, and transcription capabilities; any legacy direct-provider adapter is disabled from production paths.
- Server execution: Next.js server actions and route handlers. No external worker/queue runtime is confirmed.
- Media processing: Convex Storage and a renderer package foundation exist; a deployed authenticated FFmpeg/Remotion worker remains to be completed.
- Deployment/observability: UNKNOWN — REQUIRES VERIFICATION. No deployment manifest, CI workflow, logging/metrics service, or webhook provider is present in the inspected tree.

### Request/data flow today

```text
Browser
  -> Next App Router pages/components
  -> server actions / route handlers
  -> Convex Auth + Convex database/storage
  -> Director and capability gateway via OpenRouter
  -> durable generation jobs / shot versions
  -> authenticated Remotion/FFmpeg renderer worker
  -> editor, review, remix, export
```

Authentication is enforced with Convex Auth and server-side verified identity checks. Data isolation is enforced by Convex membership authorization and studio ownership checks. Caller-supplied external IDs are resource selectors only and never authorization sources.

## 3. Current Product Capabilities

Implemented or materially represented:

- Auth: login, signup, reset password, callback, protected dashboard routes.
- Onboarding: identity, creative DNA, goals, platform, studio, message blocks, uploaded identity/assets.
- Projects: create/list/update/archive-style states, project metadata, branding, platform/content type/outcome goal.
- Blueprint: AI-generated scenes, scene editing, reordering, deletion, camera/motion fields, validation monitor.
- Rendering: queued/processing/completed/failed/cancelled jobs, scene iteration, OpenRouter capability routing, and a Remotion/FFmpeg renderer foundation.
- Assets: studio image/video/audio library, upload, tags, folders, deletion, public templates/presets.
- Remix: intent parsing, layer model, remix jobs, diffs, snapshots.
- Export: export jobs, platform/resolution fields, pipeline/actions.
- Review: share links, token-based review page, timestamped comments, snapshots.
- Teams/templates/admin: studio members/RBAC-like roles, templates, admin pages/moderation.
- Credits: studio balance, ledger table, render/remix/export cost columns.

Not confirmed as complete: payment purchase flow, voice transcription, TTS/dubbing, captions generation, music/SFX generation, deployed timeline assembly, resumable long-form generation, provider webhooks, and a production renderer worker. These remain implementation gates.

## 4. Current AI Architecture

`src/lib/ai/model-registry.ts` and `src/lib/ai/capabilities.ts` are the central capability boundary. `src/lib/ai/engine.ts` and `src/lib/adapters/openrouter-adapter.ts` route planning, validation, image, video, speech, and transcription work through OpenRouter contracts. Legacy direct-provider code must remain disabled from production paths.

Strengths:

- Provider access is server-side.
- The application has a recognizable orchestration boundary.
- Video is treated as asynchronous at the render-job level.
- Model IDs are not scattered throughout UI files.

Risks/gaps:

- The registry hard-codes model IDs, context windows, and unsupported/uncertain descriptions.
- It does not describe validated input/output modalities, parameters, durations, aspect ratios, reference support, pricing, enablement, or fallback.
- Live OpenRouter capability, model, duration, reference, and pricing support still requires verification before enabling each workflow.
- Capability validation before requests is not a complete independent gate.
- Any legacy direct-provider adapter must not be reachable from production generation or billing paths.
- No provider webhook/callback or durable worker is confirmed; polling and/or server execution appears to own the flow.
- Cost estimation is not coupled to actual provider consumption.

## 5. Current Data Model

The current Convex schema establishes these major areas. Earlier Supabase migration references in the historical audit below are retained only as provenance and are not production authorities:

| Area | Current tables/fields observed | Assessment |
|---|---|---|
| Identity | Convex Auth users, studios, memberships, roles | Current authority; authorization derives from verified Convex identity. |
| Project | Convex projects and productions with preset, input, platform, stage, and quality metadata | Keep and extend through typed adapters. |
| Production | Convex versions, Bibles, sequences, scenes, shots, and shot versions | Canonical graph; add persistent entity and anchor-pack records. |
| Rendering | Convex render jobs, manifests, exports, plus renderer package | Complete authenticated worker deployment and callback lifecycle. |
| Remix | `remix_jobs`, `layer_diffs` | Keep for layer-level remix where applicable; connect to versions/shots. |
| Assets | `studio_assets` with type, URL, size, MIME type, tags, folder | Keep as library compatibility layer; add storage path/provenance/roles/project links. |
| Credits | `studios.credits`, `credit_ledger`, cost columns on jobs | Extend, do not replace blindly; add immutable entry types and reservations. |
| Export | `export_jobs` tied to project/snapshot/platform/resolution | Keep and add output presets/assembly artifacts. |
| Collaboration | `studio_members` | Keep; project authorization needs explicit membership checks. |
| Templates | `templates` with blueprint JSON | Keep as a seed for small workflow templates. |
| Review | `review_links`, `review_comments`, secure `get_review_data` RPC | Keep and attach to production versions/exports. |

No durable tables for production bible, characters, locations, products, sequences, shots, asset roles, generation requests, provider jobs, voice transcripts, captions, timeline tracks/clips, model catalog, price rules, payments, or credit reservations were found.

## 6. Current Media Pipeline

Uploads go to the `studio-assets` bucket, then a public URL is stored in `studio_assets`. The exact storage path is not stored; deletion parses it back from the URL. Render jobs fetch the project blueprint and all studio assets, generate scene segments through Runway, and store output metadata/snapshots/layers. Export/remix operate on render results.

Important technical debt:

- Public URLs are inappropriate for private production assets and make lifecycle control harder.
- There is no original/derived/generated/temp/final lifecycle field.
- Asset deletion is not reference-aware.
- No media metadata extraction, virus/content validation, transcoding, waveform, duration, dimensions, or checksum is confirmed.
- No assembly worker or durable artifact manifest is confirmed.

## 7. Current Credit/Billing System

The repository has `studios.credits`, a `credit_ledger`, and integer cost fields on render/remix/export jobs. This is an important start, but it is not yet a pay-as-you-go billing system.

Missing or unconfirmed:

- payment provider abstraction and purchase records;
- payment verification/webhooks/idempotency;
- promotional vs purchased vs refunded buckets;
- reservation, release, and commit states;
- configurable price rules by modality/model/duration/resolution/quality;
- immutable accounting constraints and transactional balance updates;
- user-visible estimate before generation;
- actual provider-cost reconciliation.

The existing `DEFAULT 100` credits and job costs must be treated as prototype defaults, not product pricing.

## 8. Current Frontend

The UI is a dark, technical studio experience with reusable buttons, cards, dialogs, badges, inputs, sidebar/header/footer, project cards, blueprint editor, scene cards, asset grid/upload, render progress, editor/remix chat, export modal, review player/comments, onboarding forms, templates, settings, and teams.

Reuse the design system and editor patterns. The target beginner flow should add a simpler Create entry point and progressive questions rather than replacing the current application shell.

Current UX is blueprint-first and form/onboarding-heavy. It exposes concepts such as scenes, execution, signals, and production states earlier than a beginner should need to understand them.

## 9. Current Backend

Backend logic is primarily colocated in `src/lib/*` server actions. Relevant modules include project/state-machine, scene actions, asset actions, AI engine/director, provider adapters, render pipeline/actions, export pipeline/actions, remix pipeline/actions, review actions, teams/templates/onboarding, and Supabase clients.

This is a reasonable modular-monolith starting point. Do not split it into services before job volume and operational boundaries justify it. The key backend change is to make orchestrators explicit and transactional, not to move files merely for appearance.

## 10. Current Infrastructure

Supabase is the only confirmed external infrastructure. `next.config.js` permits Supabase image hosts and raises server action body size to 50 MB. `OPENROUTER_API_KEY` and Runway credentials are implied by adapters but deployment secret configuration is UNKNOWN — REQUIRES VERIFICATION. There is no confirmed queue, object CDN, payment gateway, media worker, CI, or monitoring stack.

## 11. Target FinalFrame Product

The target is an AI Director-led production studio:

```text
Idea / script / audio / images / video / assets
          -> AI Director
          -> costed production plan + Production Bible
          -> sequences -> scenes -> shots
          -> assets + generation jobs + user media
          -> review/versioning/remix
          -> lightweight assembly + social export
          -> auditable credit ledger
```

The MVP should deeply support short-form social video, comedy/skit, and product/promotional video. Film, animation, documentary, series, music video, and long-form should be represented by the model but not deeply implemented initially.

## 12. Current vs Target Comparison

| Area | Current FinalFrame | Target | Gap | Recommended action |
|---|---|---|---|---|
| Architecture | Next/Supabase modular monolith | Same plus durable orchestration | Partial | Keep stack; add explicit domains/jobs. |
| Project | Marketing project with signals | Any input, language, duration, aspect, workflow | Medium | Extend fields; preserve legacy fields. |
| Production model | Scenes and one blueprint snapshot | Sequences, scenes, shots, timeline | High | Add sequence/shot tables and migrate scenes. |
| Assets | Studio library, URL/type/tags | First-class project assets with role/provenance/version | High | Add asset metadata and links. |
| Characters/continuity | Actor/identity fields only | Persistent characters, locations, products, references | High | Add production entities and context snapshots. |
| Bible | Implicit project/blueprint JSON | Persistent editable Production Bible | High | Add versioned structured bible. |
| AI Director | Blueprint generator | Conversational multi-input planner/cost coordinator | High | Expand director behind a plan approval boundary. |
| OpenRouter | Chat adapter | Primary gateway where capability exists | Partial | Keep adapter; validate capability and fallback. |
| Model registry | Four hard-coded capability entries | Configurable capability catalog | Medium | Move operational metadata to DB/config. |
| Jobs | Project render/remix/export jobs | Shot/media/assembly jobs, resumable | High | Add generation jobs and idempotency. |
| Voice/audio | Asset upload only | STT, timing, TTS/dubbing, music/SFX, captions | High | Add staged P1/P2 modalities. |
| Timeline | Layer/snapshot abstraction | Lightweight tracks/clips | High | Add manifest-based assembly model. |
| Credits | Balance/ledger/cost fields | Wallet, reservations, commit/release, pricing | High | Add credit service and payment abstraction. |
| Payments | Not confirmed | Bachs initial provider behind provider-neutral purchases/webhooks | High | P0 abstraction; verify Bachs live before implementation. |
| Long form | No sequence continuation | Incremental sequence generation | High | Add hierarchy now; defer rich editor. |
| Social exports | Export platform/resolution fields | Presets with safe areas/captions | Medium | Add preset registry. |
| Templates | Public/studio blueprint templates | Few beginner workflow templates | Low/medium | Keep; add template routing later. |
| Security | Auth/RLS present | Private assets, signed URLs, job/payment safeguards | Medium/high | Harden storage and authorization. |
| Testing | SQL seed; no broad suite found | Unit/integration/E2E/failure tests | High | Establish test harness before billing changes. |

## 13. KEEP / MODIFY / REFACTOR / REMOVE / NEW

### KEEP AS-IS where practical

- Next.js App Router and TypeScript.
- Supabase Auth, SSR client, middleware, and the existing RLS approach.
- Existing project shell, UI primitives, dashboard navigation, review links/comments, team membership, templates.
- Scene editing patterns and camera/motion fields.
- OpenRouter and Runway adapters as provider boundaries.
- Render snapshots/layers/remix concepts where they represent actual editor functionality.

### MODIFY

- Projects: add workflow/input/language/duration/aspect/quality fields while retaining legacy marketing fields.
- Assets: add project links, role tags, provenance, storage path, visibility, metadata, and reference semantics.
- Scenes: become migration-compatible scene nodes under sequences and contain shots.
- Render jobs: preserve legacy records but introduce shot-level generation jobs.
- Export: consume assembly manifests and output presets.
- Onboarding: add a simple idea/script/audio/image/video router.
- Model registry: capability metadata and validation.

### REFACTOR

- Render pipeline locking: current status check/update is not an atomic claim; use a DB claim/lease.
- Credit mutation: centralize in a transactional credit service.
- Provider-specific assumptions in adapters: normalize capabilities and errors.
- Storage deletion/path handling: store object keys rather than parsing public URLs.
- Blueprint regeneration: avoid deleting all scenes; use versions and stable IDs.
- Authorization: consistently verify project/studio membership in every action.

### REMOVE or retire gradually

- Hard-coded/default credit pricing after compatibility migration.
- Public-by-default private user media.
- “One giant blueprint snapshot” as the only source of production truth.
- Any unused phase scaffolding or emergency reset behavior after its operational purpose is verified. Do not delete before usage/data audit.

### NEW

Production Bible, sequences, shots, asset roles/links, continuity entities, asset analysis, AI Director plans, generation jobs, model capabilities, price rules, credit reservations/purchases, audio/transcript/caption records, timeline/assembly manifests, output presets, idempotency keys, provider callbacks, and automated test coverage.

## 14. Technical Debt and Priority

P0 debt: credit mutations are not demonstrably reservation-safe; render claim is race-prone; public asset URLs; missing payment verification; missing comprehensive authorization tests; hard-coded model/provider assumptions.

P1 debt: destructive blueprint replacement; no durable worker/lease strategy; missing media metadata and lifecycle; unclear export assembly; broad studio asset fetches for every render.

P2 debt: duplicated legacy field concepts, phase comments/scaffolding, advanced layer/remix abstraction before shot model, and any unneeded team/template complexity for the first paid cohort.

## 15. Target Architecture

```text
UI (Create, Workspace, Review, Export)
        |
Server application layer + authorization
        |
AI Director | Production Service | Asset Service | Credit Service
        |             |                  |            |
Plan jobs     sequences/scenes/shots   storage       ledger/reservations
        |
Generation Job Coordinator -> capability registry -> OpenRouter/Runway/other adapters
        |
Provider callbacks/polling -> generated assets -> shot versions
        |
Assembly manifest -> media worker/export -> final artifacts -> review/export
```

Keep the first implementation inside the Next/Supabase repository. A separate worker can be introduced when video/assembly jobs exceed reliable server-action execution. Supabase Edge Functions/cron or an external queue are options, but the choice is UNKNOWN — REQUIRES VERIFICATION.

## 16. Target Data Model

Add incrementally:

- `productions`: project-level target configuration and current production version.
- `production_versions`: immutable plan/bible revisions.
- `production_bibles`: structured project/story/style data, preferably JSONB with validated schemas initially.
- `sequences`, `scenes`, `shots`: ordered hierarchy, status, duration, plan/version IDs.
- `production_entities`: character/location/product/object/style; `entity_asset_links` for references.
- `asset_links` or `production_assets`: project/shot links, roles, source, lifecycle, metadata, storage key, checksum.
- `director_plans`: input summary, questions, plan JSON, estimate, status, approval/version.
- `generation_jobs`: modality, shot/asset/sequence IDs, provider/model, request/response, provider job ID, state, estimate/actual cost, idempotency key, lease/error timestamps.
- `model_capabilities` and `price_rules`: operational registry/configuration; sensitive provider credentials remain secrets.
- `credit_reservations`, `credit_transactions`, `purchases`, `payment_events`: immutable accounting and provider-independent payments.
- `audio_transcripts`, `caption_tracks`, `timeline_tracks`, `timeline_clips`, `assembly_jobs`, `output_presets`.

Use JSONB for provider request/response and evolving bible metadata, but keep ownership, status, ordering, costs, and foreign keys relational.

## 17. Target Production Model

The canonical unit of generation is a shot, not a whole project. A sequence groups scenes; a scene groups shots; a shot references a prompt/context snapshot and produces one or more versions. Each shot can be retried independently. Completed shots remain valid when a later shot fails. Project duration is the sum/assembly of clips, not a provider model limit.

## 18. Target Asset Model

Every upload and generated artifact becomes an asset with source (`USER_UPLOAD`, `AI_GENERATED`, `IMPORTED`, `RECORDED`, `EXTRACTED`), lifecycle, storage key, MIME/dimensions/duration/checksum, and one or more semantic roles. Assets are reusable across productions. Intent can come from the user, template, or AI analysis, with a simple clarification only when necessary.

## 19. Target AI Director

The director should produce a typed plan, not directly spend credits or mutate production blindly. It should:

1. Normalize idea/script/audio/image/video inputs.
2. Identify missing but material information.
3. Propose workflow, bible, entities, sequences/scenes/shots, asset reuse/generation needs, and estimates.
4. Validate against enabled model capabilities and balance.
5. Ask for approval before expensive work.
6. Dispatch jobs and update user-readable progress.

Prompt injection from user scripts/media descriptions must be treated as untrusted content; system instructions, authorization, and spending policy stay outside model-controlled JSON.

## 20. Target Generation Architecture

Use a durable job state machine: `QUEUED -> PROCESSING -> COMPLETED|FAILED|CANCELLED`, with retry count, lease owner/expiry, idempotency key, provider job ID, and structured error. A DB transaction should claim a job atomically. Provider callbacks are preferred; polling is a fallback. Every result is stored as an asset and attached to a shot version.

## 21. OpenRouter Strategy and Model Registry

Retain one server-side `OPENROUTER_API_KEY`. Use OpenRouter for supported reasoning, structured planning, transcription/translation where available, and image/audio capabilities where verified. Continue using Runway or another direct adapter for video if OpenRouter does not expose the required operation.

Replace the static registry with a validated capability registry. At request time, filter by modality, input type, output type, duration, aspect ratio, reference support, quality tier, enabled status, and price rule. Send only supported parameters. Model IDs and provider behavior must be configured and tested, not promised by comments.

## 22. Credit System and Payment Architecture

Implement one credit service with:

```text
estimate -> reserve -> execute -> commit on success
                         \-> release on failure/cancel
```

Reservations must be idempotent and tied to a generation/assembly job. Ledger entries are append-only; balance is derived or updated transactionally. Track promotional, purchased, charged, released, refunded, and expired categories if product policy requires them.

Payment flow:

```text
Payment provider adapter -> verified webhook -> purchase record -> credit transaction
```

The provider is a decision required before implementation. The core wallet must not depend on Stripe, Mobile Money, or any single provider.

## 23. Cost-Control Strategy

Estimate by model/provider/modality/duration/resolution/quality and show balance before spending. Add per-job and per-project limits, confirmation for large estimates, concurrency limits, cancellation, retries that do not double-charge, reference reuse, cached transcription/analysis, and shot-level regeneration. Reconcile actual cost where provider data exists; otherwise mark actual cost unknown rather than inventing it.

## 24. Short-Form, Long-Form, Voice, and User-Asset Workflows

### Short form

Idea/script -> director plan -> estimate/approval -> bible/entities -> 3–10 shots -> generation -> lightweight assembly -> review -> shot regeneration -> social export.

### Long form

Create project and bible once; generate sequences incrementally. Store completion per shot and resume from the first incomplete/failed unit. Do not build a one-hour provider request or a full NLE in MVP.

### Voice-driven

Upload/record audio -> persistent audio asset -> transcription and timing -> dialogue/character extraction -> director plan -> shot durations aligned to audio -> visuals -> captions/mix -> assembly. Provider lip sync and language support are capability-dependent and must be labeled accordingly.

### User assets

Upload -> storage/object validation -> intent classification/clarification -> persistent asset + role link -> bible/entity reference -> generation context. Existing footage can be a source clip in an assembly or video-to-video shot, depending on supported provider capability.

## 25. Character Continuity

Create stable character IDs with appearance, clothing, personality, voice reference, reference assets, and continuity notes. Include a compact, versioned context snapshot in relevant shot jobs. This improves consistency but must not promise perfect model-level identity preservation.

## 26. Versioning and Regeneration

Do not delete all scenes when regenerating a blueprint. Create a plan/version and preserve stable entity/scene/shot IDs where semantic identity is retained. Each shot has versions with prompt/context/model/cost/result. “Regenerate” creates a new version and only charges the new work. “Remix” should reference an existing version and preserve a diff.

## 27. Media, Storage, Timeline, and Social Export

Use private buckets/object keys and short-lived signed URLs for user/generated media. Store originals once; derived assets reference parents. Add cleanup for temporary artifacts only after retention policy is defined.

MVP timeline: ordered tracks for video, voice, music, SFX, captions, and overlays; clips point to assets and shot versions with start/duration/trim/volume metadata. Assembly should generate a manifest and an export job, not a browser-side editor. Output presets should map TikTok/Reels/Shorts/WhatsApp-like targets to aspect, resolution, safe areas, caption policy, and duration constraints.

## 28. Security

- Never expose OpenRouter/Runway/payment secrets in the browser.
- Replace public asset URLs with signed access where practical.
- Enforce project/studio membership server-side and in RLS.
- Treat all provider callbacks as authenticated and idempotent.
- Make credit mutations server-only and transactional.
- Validate file size, MIME, extension, duration, and ideally malware/content policy.
- Avoid allowing model output to select arbitrary tables, URLs, providers, or spending amounts.
- Rate-limit plan/generation/upload endpoints and audit expensive actions.
- Review the public review-token RPC and comment spam/abuse controls before launch.

## 29. Testing Strategy

Unit tests: price calculation, reservations, ledger invariants, capability filtering, director schema validation, asset roles, state transitions, shot duration/assembly calculations.

Integration tests: Supabase RLS, storage upload/delete, provider adapters with mocked responses, job claim/retry/idempotency, payment webhook verification, credit commit/release.

End-to-end: create account/project, idea flow, asset flow, blueprint approval, estimate, generation completion, review, shot regeneration, export. Failure cases must include provider timeout/failure, duplicate webhook, duplicate request, insufficient balance, cancellation, missing asset, unsupported model, and storage failure.

The repository currently shows a SQL seed file but no broad automated test suite; establishing the harness is a prerequisite for credit/payment changes.

## 30. Migration Strategy

1. Inventory production data and deployed migration history; do not rely only on filenames.
2. Add nullable production/bible/sequence/shot fields/tables.
3. Backfill one production per project, one default sequence per project, one scene per existing scene, and one compatibility shot per scene only where render semantics permit.
4. Preserve existing `render_jobs`, snapshots, remix jobs, export jobs, and asset IDs.
5. Add `storage_path` by parsing existing URLs once, then stop parsing URLs.
6. Migrate `studios.credits` into the new wallet/balance representation with an auditable opening-balance transaction.
7. Keep legacy render path behind an adapter until new shot path passes acceptance tests.
8. Add dual-read/dual-write only where rollback requires it; remove compatibility code after observed stability.

Existing users and projects should remain usable. No destructive migration or table replacement is justified by this audit.

## 31. Phased Implementation Plan

### Phase 0 — Baseline and decisions

Objective: make the current system measurable and safe.

Likely files/modules: `src/lib/*` service boundaries, provider adapters, render actions/pipeline, asset actions, package scripts.

Database: verify deployed schema/RLS/storage buckets; add no product tables yet except audit instrumentation if required.

Backend/frontend/AI: add test harness, structured logging, feature flags, provider capability probes, and documented environment variables.

Testing: baseline build/lint/type checks and smoke tests.

Risks: undocumented production schema or provider behavior. Acceptance: a verified environment matrix and rollback plan.

### Phase 1 — Production foundation and asset hardening (P0)

Objective: add production/bible/sequence/shot and first-class asset links without breaking current projects.

Database: new production/version/bible/sequence/shot/entity/asset-link tables; storage path/lifecycle columns; RLS and indexes.

Backend: migration/backfill services, typed validation, project membership guards, asset intent metadata.

Frontend: simple Create router, production overview, asset role selection, Bible/entity views, preserve existing blueprint editor.

AI: director plan schema and plan approval; no expensive dispatch before approval.

Testing: migration/backfill, RLS, asset reuse, stable IDs.

Acceptance: existing project opens; uploaded character/product/voice/video can be stored, role-linked, and reused.

### Phase 2 — Shot jobs and cost-aware generation (P0)

Objective: make generation resumable and financially safe.

Database: generation jobs, model capabilities, price rules, reservations/transactions.

Backend: atomic job claim/lease, adapter normalization, capability validation, estimate/reserve/commit/release, retries/idempotency.

Frontend: estimate/balance/quality choices, job progress by shot, cancel/retry/regenerate.

AI: route plan outputs to shot context and production-bible snapshots.

Testing: ledger invariants, concurrent claims, provider failure and duplicate request tests.

Acceptance: one failed shot does not regenerate successful shots; failed work releases reserved credits.

### Phase 3 — Assembly, review, and short-form export (P0)

Objective: turn shot assets into a coherent short video.

Database: timeline tracks/clips, assembly jobs, output presets, artifact lifecycle.

Backend: manifest assembly, provider/media worker integration, export status and signed URLs.

Frontend: lightweight timeline/review, preset-based export, captions/audio visibility.

Testing: ordering, trims, missing assets, export failure/retry, review attachment.

Acceptance: beginner idea flow produces a reviewable 15–60 second output and a social preset export.

### Phase 4 — Payment abstraction and commercial launch controls (P0)

Objective: enable pay-as-you-go credits safely.

Database: purchases, payment events, provider references, promotional credits, opening balances.

Backend: provider adapter, signed webhook verification, idempotent crediting, receipts/history.

Frontend: buy credits, wallet history, insufficient balance and estimate UX.

Testing: duplicate/out-of-order webhooks, failed payments, refund/reversal policy.

Dependency: verify the live Bachs API/checkout/webhook contract and confirm launch merchant, currency, tax, and refund policy before coding. Bachs is the selected initial provider, not an invitation to hard-wire unverified API behavior.

Acceptance: verified payment credits wallet once and only once; generation accounting is auditable.

### Phase 5 — Optional voice/performance and multilingual short-form (P1)

Objective: support uploaded voice as an optional timing backbone while keeping idea-first and script-first creation equally complete.

Database: transcript segments, speaker/character mapping, caption tracks, language metadata.

Backend/AI: STT, timing analysis, optional translation/TTS/dubbing adapters, audio normalization.

Frontend: optional audio upload first, transcript review, speaker/character mapping, language/caption controls. Browser recording is a later capability and must not block idea/script creation.

Testing: noisy audio, multilingual text, duration alignment, provider failure.

Acceptance: an uploaded voice can drive a short production with synchronized captions where providers support it; an idea-only or script-only project can create the same workflow with explicitly selected AI voices or no voice.

### Phase 6 — Long-form continuation and stronger continuity (P1)

Objective: support incremental multi-sequence projects.

Database: sequence progress, entity/version context, dependency links.

Backend/frontend: resume incomplete shots, sequence-level review, continuity warnings, cost forecast.

Testing: partial failure/resume, changed bible version, no duplicate completed work.

Acceptance: Scene 27 can fail without regenerating Scenes 1–26.

### Phase 7 — Templates, advanced controls, and workflow expansion (P2/FUTURE)

Objective: validate demand before broadening deeply.

Add a small set of comedy, product ad, and UGC templates; advanced model controls behind settings; more providers/modalities only when a concrete workflow requires them. Full NLE, enterprise workflow suite, social network, and giant model marketplace remain FUTURE.

## 32. Priorities

### P0

Production hierarchy, first-class assets, director plan/approval, shot jobs, capability validation, credit reservations, configurable pricing, basic payment abstraction, short-form assembly/export, security hardening, and tests.

### P1

Voice/transcription/captions, multilingual production, long-form incremental continuation, stronger continuity, payment-provider expansion, media metadata/transcoding.

### P2

Advanced model controls, richer templates, more editing/remix operations, team billing, improved analytics, more output presets.

### FUTURE

Deep film/series workflows, full NLE, enterprise production management, broad provider marketplace, automatic perfect character consistency, and large-scale social/community features.

## 33. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Provider capabilities change | Registry probes, capability validation, fallbacks, contract tests. |
| Video cost overruns | Estimates, reservations, limits, confirmation, concurrency controls. |
| Duplicate generation charges | Idempotency key plus transactional reservation ownership. |
| Job execution in Next runtime is unreliable | Durable lease/worker path; introduce external worker only when verified necessary. |
| Asset privacy leakage | Private buckets, signed URLs, RLS, no public default. |
| Bible/continuity promises exceed models | Context snapshots and explicit quality caveats. |
| Migration breaks existing projects | Nullable additive schema, backfill, compatibility adapter, rollback. |
| Payment fraud/webhook replay | Signature verification, event uniqueness, immutable audit records. |
| Scope explosion | Ship only three MVP workflows and shot-level assembly. |
| Existing RLS inconsistencies | Automated authorization tests and centralized membership checks. |

## 34. MVP Definition

The MVP is complete when a signed-in user can create a short project from an idea, script, audio, image, or asset; the AI Director creates an editable plan and Bible; the system stores/reuses references; the user sees a configurable estimate and balance; approved shot jobs generate asynchronously; failures do not repeat completed work; a lightweight assembly produces a reviewable short video; the user can regenerate a shot and export a basic social preset; and all credit movements are auditable.

It is not a full editor, full long-form studio, universal provider layer, or all-workflow platform.

## 35. Acceptance Criteria

- Beginner flow: “Make a 30-second funny video…” results in plan, estimate, entities/scenes/shots, generation, review, regeneration, and export.
- Voice flow: uploaded voice is stored, transcribed where supported, used for timing, and captioned/assembled.
- Character flow: uploaded reference persists, is role-linked, and is available in later shots without re-upload.
- Long-form flow: sequences continue incrementally and completed shots remain untouched.
- Credit flow: purchase/crediting is idempotent; estimate is visible; reservation commits on success and releases on failure/cancel; history is auditable.
- Security flow: unauthorized users cannot read/mutate another studio’s projects/assets/jobs or alter balances.
- Operational flow: every job has traceable provider/model/request/status/cost/error data.

## 36. Recommended Implementation Order

1. Verify deployed Supabase schema, buckets, secrets, providers, and deployment runtime.
2. Establish tests, logging, feature flags, and authorization checks.
3. Add production/bible/sequence/shot and asset-link schema with compatibility backfill.
4. Harden asset storage and semantic intent.
5. Build the director plan/approval contract.
6. Implement shot jobs, capability validation, and credit reservation accounting.
7. Add lightweight assembly/review/social export.
8. Add payment adapter after provider/currency/refund decisions.
9. Add voice/multilingual support.
10. Add long-form continuation and continuity improvements.

## 37. Decisions Required Before Implementation

The following are genuine product/infrastructure decisions, not blockers for this audit:

1. Finalize Bachs merchant onboarding, launch currencies (XAF/XOF/NGN), promotional-credit policy, refunds, tax, and receipt requirements after live account verification.
2. Confirm whether Runway remains the initial video provider and which exact supported endpoints/models are enabled.
3. Choose the first production runtime for durable jobs: Supabase/cron, a hosted queue/worker, or an existing deployment worker.
4. Define initial supported audio languages and whether user voice is used only for timing or also for dubbing/lip sync.
5. Define private-media retention, export retention, and maximum upload/project limits.
6. Confirm whether the first paid cohort is individual studios only or includes teams.

## 38. Audit Conclusion

FinalFrame should evolve from its current structured commercial-video prototype rather than be rewritten. The repository already contains several valuable primitives: authenticated studio ownership, RLS, project/scene editing, AI blueprint generation, asynchronous render records, assets, snapshots, remixing, exports, reviews, teams, and templates. The target gap is primarily a missing durable production domain and financial/job-safety layer, plus input modalities and assembly capabilities—not a reason to replace the stack.

No production application code, database migration, or deletion was performed as part of this audit. This document is the requested implementation roadmap.

---

# Final Repository-Specific Planning Pass

The sections below are the final planning-pass addendum. Where this addendum conflicts with an earlier preliminary statement in this document, the addendum is authoritative.

## A. Locked Product Contract

### Customer experience

The primary experience is not a production-management interface. The customer sees:

```text
Describe it / Paste it / Upload it / Bring assets
                 -> AI Director
                 -> simple plan preview
                 -> estimated credits
                 -> user approval
                 -> automatic video creation
                 -> review, reorder, replace, regenerate
                 -> export
```

The internal contract is:

```text
CreateIntent
  -> AI Director
  -> DirectorPlan
  -> CostEstimate
  -> User Approval
  -> ProductionVersion
  -> ProductionBible
  -> Sequence
  -> Scene
  -> Shot
  -> ShotVersion
  -> GenerationJob
  -> AssemblyManifest
  -> Review
  -> Export
```

### V1 decisions

- Audience: individual creators and small businesses.
- Fully supported input modes: idea, script, optional uploaded voice, characters/images, existing footage, business-ad briefs, and mixed media.
- Finished production duration: 15–60 seconds in V1.
- Default output: 9:16 vertical social video; secondary 1:1 and 16:9 presets may be implemented after the default path is stable.
- User control: approve the plan and make light edits; no full scene/shot/prompt editor in the beginner flow.
- Assembly: automatically concatenate approved shots in order and apply the selected voice, captions, music/SFX, and output preset.
- V1 editing: reorder, replace, regenerate, change captions/audio, and export. No Premiere-like timeline.
- Voice: optional uploaded voice is used for transcription, timing, speaker/character mapping, and captions. A user may create the same workflow from an idea or script using an explicitly selected AI voice or no voice. Voice cloning, lip sync, and dubbing are not V1 requirements.
- AI voice: optional and explicitly selected; never silently added to a user’s bill.
- Existing footage: upload, trim/reformat, transcribe/caption, and augment with supported AI B-roll/opening/ending.
- Ads: generic business ads for product, restaurant, service, real-estate, and similar requests.
- Credits: pay-as-you-go, with configurable packs and costs. Never promise a fixed number of videos per pack.
- Launch currencies: XAF, XOF, and NGN, subject to merchant-account and provider verification.
- Payment: Bachs is the initial provider behind a provider-neutral payment interface. The implementation must verify the current official Bachs API, checkout, currency, and webhook behavior before coding against it.
- AI providers: hidden internal registry; OpenRouter where the required capability is supported and Runway/direct adapters where video capability requires them. No advanced model picker in V1.
- Long-form: the data model must support it, but V1 creation and UX stop at 60 seconds.

## B. Verification Boundary: Repository, Provider, Deployment

### Verified from the repository

- Next.js 16 App Router, React 19, TypeScript, Tailwind, Framer Motion, Lucide, and npm.
- Supabase SSR/client helpers, auth callback, middleware route protection, Postgres migrations, Storage calls, and RLS migrations.
- Server actions under `src/lib/*` for projects, scenes, assets, rendering, export, remix, review, templates, teams, onboarding, and dashboard data.
- OpenRouter adapter using `OPENROUTER_API_KEY` and Runway adapter using `RUNWAY_API_KEY`.
- Project/scene/render/snapshot/layer/remix/export/review/template/team/asset/credit tables in migration files.
- Runway render strategies in the application: text-to-video, image-to-video, multi-image-to-video, avatar-video, and video-to-video types.
- Asset upload support for image, video, and audio, with a `studio-assets` bucket and public URL storage.

### Verified from live provider documentation

- OpenRouter documents a Models API with input/output modalities, supported parameters, pricing, context, provider endpoints, and filters. It documents structured outputs for compatible models, multimodal input, image generation, STT, and TTS. See [OpenRouter model metadata](https://openrouter.ai/docs/guides/overview/models), [structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs), and [multimodal capabilities](https://openrouter.ai/docs/guides/overview/multimodal/overview).
- Runway documents asynchronous generation tasks for image-to-video, text-to-video, and video-to-video, plus task retrieval/cancellation, image/audio/video-related APIs, model routing, and multi-shot/product-video recipes. Exact model/parameter availability must be checked at implementation time against the selected account/API version. See the [Runway API reference](https://docs.dev.runwayml.com/api/).
- Bachs documents hosted checkout sessions, raw dynamic pricing or catalog products, local-currency pricing, success/cancel redirects, signed webhook delivery, event IDs for deduplication, and payment events including `collection.succeeded`. See [Bachs checkout](https://docs.bachs.io/guides/checkout/checkout-sessions), [Bachs webhooks](https://docs.bachs.io/guides/webhooks/overview), and [Bachs local pricing](https://docs.bachs.io/guides/products/local-pricing).

### Not verified and must not be invented

- Deployed Supabase project URL, active schema, migration history, bucket privacy/configuration, deployed RLS policies, and production data shape. No `.env.local`, `supabase/config.toml`, deployment manifest, or CI configuration exists in the checkout.
- Whether the deployed Supabase schema matches every migration currently in the repository.
- Runway account entitlements, exact enabled models, current model pricing, and whether every application strategy maps to a currently valid API endpoint.
- OpenRouter account limits, selected model availability, per-provider data-retention settings, and the exact models that will be used for production planning.
- Bachs merchant onboarding status, supported merchant currencies for this account, minimum amounts, settlement currency, tax behavior, refund policy, and production webhook credentials.
- Any production worker, queue, CDN, ffmpeg service, monitoring, alerting, or deployment runtime outside the repository.

Before Phase 0 implementation, an operator with access to the deployed environment must run a read-only schema/storage/RLS verification and record the result. If that access is unavailable, implementation must be limited to local/test infrastructure until it is provided.

## C. Repository Capability Map

| Capability | Existing repository evidence | Classification | Implementation direction |
|---|---|---|---|
| Auth and sessions | `src/middleware.ts`, `src/lib/supabase/*`, `src/lib/auth/actions.ts`, auth routes | KEEP | Preserve Supabase Auth and add authorization tests. |
| Studio ownership | `studios`, studio RLS, onboarding actions | KEEP/MODIFY | Keep studio as billing/ownership boundary; add consistent membership guards. |
| Project creation | `src/lib/project/actions.ts`, project creation components | MODIFY | Add CreateIntent and target configuration while retaining legacy fields. |
| Onboarding | `src/lib/onboarding/*`, onboarding route group | MODIFY | Keep existing onboarding; add a shorter creation router for returning users. |
| Blueprint planning | `src/lib/ai/blueprint-director.ts`, blueprint editor | MODIFY | Evolve to typed DirectorPlan and versioned ProductionBible. |
| Scene persistence | `scenes` migration and `src/lib/scene/actions.ts` | KEEP/MODIFY | Preserve existing scenes as compatibility records; add sequence/shot children. |
| Video generation | `src/lib/render/pipeline.ts`, `render/actions.ts`, Runway adapter | REFACTOR | Introduce shot jobs and atomic job claims; retain legacy render adapter during migration. |
| AI routing | `src/lib/ai/engine.ts`, `model-registry.ts`, provider adapters | MODIFY | Add runtime capability validation, pricing metadata, and normalized errors. |
| User assets | `src/lib/assets/actions.ts`, asset components, `studio_assets` | MODIFY | Add storage key, lifecycle, role links, project links, metadata, and signed access. |
| Render snapshots/layers | `render_snapshots`, `render_layers` | KEEP/MODIFY | Reuse for review/remix compatibility; attach to shot/assembly versions. |
| Remix | `src/lib/remix/*`, `remix_jobs`, `layer_diffs` | KEEP/MODIFY | Preserve layer remix; add shot-version regeneration path. |
| Export | `src/lib/export/*`, `export_jobs`, export UI | MODIFY | Consume AssemblyManifest and output presets; centralize credit accounting. |
| Review | `src/lib/review/*`, review components, review RPC | KEEP/MODIFY | Attach review links to assembly/export versions. |
| Templates | `src/lib/templates/*`, templates UI/migrations | KEEP/MODIFY | Use for a small number of input/workflow templates; avoid template explosion. |
| Teams | `src/lib/teams/*`, team UI/migrations | KEEP/LIMIT | Preserve schema, but do not expand team billing in V1. |
| Credits | `studios.credits`, `credit_ledger`, export/render/remix costs | REFACTOR | Centralize estimate/reserve/commit/release and migrate legacy balance safely. |
| Payments | No payment adapter/table found | NEW | Add Bachs adapter behind a neutral interface after live verification. |
| Voice | Audio asset upload only | NEW | Add transcription/timing/caption path; use provider capability checks. |
| Assembly | No confirmed manifest/worker | NEW | Add ordered shot manifest and a durable assembly job. |
| Tests | `tests/seed_phase4.sql` only; no test runner in `package.json` | NEW | Establish unit/integration/E2E harness before billing changes. |

## D. Target Interfaces and State Rules

### `CreateIntent`

```ts
type CreateIntent = {
  projectId?: string;
  mode: 'IDEA' | 'SCRIPT' | 'VOICE' | 'IMAGES' | 'FOOTAGE' | 'AD';
  prompt?: string;
  script?: string;
  inputAssetIds: string[];
  requestedDurationSeconds: number;
  outputPreset: 'SOCIAL_VERTICAL' | 'SQUARE' | 'LANDSCAPE';
  language?: string;
  workflow?: 'SOCIAL' | 'COMEDY' | 'BUSINESS_AD' | 'FOOTAGE_TRANSFORM';
};
```

`DirectorPlan` must contain a user-readable summary, assumptions, material questions, ProductionBible draft, sequences/scenes/shots, required operations, reused/generated asset decisions, and estimate inputs. Model output must not directly select arbitrary providers, spend credits, write unrelated tables, or bypass authorization.

`CostEstimate` must expose total credits, operation/shot line items, quality tier, currency-independent credit amount, estimate version/expiry, and whether any provider cost is unknown. It must consider shot count, duration, resolution, quality, model/provider, supplied assets, transcription, optional AI voice, captions, and assembly—not duration alone.

Credit state:

```text
ESTIMATE -> RESERVE -> EXECUTE
                         ├── success -> COMMIT
                         ├── retryable failure -> RETRY or RELEASE
                         └── cancel/permanent failure -> RELEASE
```

Job state:

```text
QUEUED -> PROCESSING -> COMPLETED
                    \-> FAILED
                    \-> CANCELLED
```

Each job needs an idempotency key, retry count, lease/claim metadata, provider task ID, request/response snapshots, estimated/actual costs, and structured failure category.

## E. Required Repository Changes by Phase

### Phase 0 — Verification, safety, and test baseline (P0)

Objective: establish facts and protect existing functionality before schema work.

Likely areas: `package.json`, `src/lib/guards/*`, `src/middleware.ts`, Supabase clients, `src/lib/render/*`, `src/lib/export/*`, and `src/lib/assets/*`.

Database/deployment: read-only compare deployed tables, columns, indexes, RLS, functions, triggers, and storage buckets against migrations; record bucket privacy, MIME/size policy, and schema drift without exporting user data.

Backend: add correlation IDs and structured events, centralize membership checks, and add feature flags for the new production/shot path and legacy fallback.

AI/provider: add read-only capability probes for OpenRouter and Runway; do not hard-code live model promises.

Testing: establish a test runner and baseline auth, ownership, scene editing, render submission, ledger, and review-link tests.

Acceptance: build/type checks pass, existing flows remain executable, and every unavailable deployment fact is explicitly labeled `UNKNOWN — REQUIRES VERIFICATION`.

Risk: requires read-only Supabase and provider sandbox access for complete verification.

### Phase 1 — Production hierarchy and Bible (P0)

Database: add production versions, ProductionBible, sequences, shots, shot versions, typed entities, compatibility references, indexes, and RLS.

Backend: create default production/version/sequence records without duplicating visible work; replace destructive blueprint regeneration with versioned planning; keep scene actions compatible.

Frontend: add the beginner creation shell and plan preview while preserving the current advanced blueprint editor.

AI: refactor `blueprint-director.ts` to typed DirectorPlan output with server-side validation and OpenRouter structured output only when supported.

Tests/acceptance: existing projects open with mapped production records; existing scenes remain readable; regenerated plans preserve prior versions.

### Phase 2 — First-class assets, roles, storage, and continuity (P0)

Database: add object key, lifecycle, source, role, project/production links, checksum, dimensions, duration, analysis metadata, many-to-many role links, and character/location/product/object/style entities.

Backend: store object keys rather than only public URLs; add intent-first asset classification, media validation, and reference-aware archive/delete behavior.

Frontend: upload with simple labels such as main character, product, voice, style, source video, or other.

AI: analyze assets through explicit jobs, not on every page load.

Tests/acceptance: authorized reuse works; active references cannot be silently deleted; cross-studio access fails.

### Phase 3 — AI Director, cost preview, and approval (P0)

Add server operations equivalent to `createDirectorPlan`, `getDirectorPlan`, `answerDirectorQuestion`, `estimateDirectorPlan`, `approveDirectorPlan`, and `reviseDirectorPlan`.

The frontend exposes all six entry modes but asks only material questions. The estimate shows duration, output, asset use, quality, estimated credits, and current balance before approval. The server owns every spending and database mutation.

Acceptance: all six inputs produce typed plans; invalid plans are rejected without charging; light edits work before approval.

### Phase 4 — Shot jobs, capability validation, and idempotency (P0)

Database: add `generation_jobs` with shot/version/provider/model/task/status/lease/idempotency/cost/error fields while preserving legacy `render_jobs`.

Backend: add atomic claim/lease, response normalization, capability filtering, provider task storage, polling/callback reconciliation, and retry policy.

Frontend: show per-shot progress and allow eligible cancel/retry/regenerate actions.

Provider direction: OpenRouter is appropriate for planning and multimodal analysis where the selected model supports it; Runway remains the initial video adapter. Exact models and parameters must be probed against active accounts/API versions before implementation.

Acceptance: duplicate idempotency returns the original job; workers cannot double-claim; failed Shot 3 does not regenerate Shots 1–2; unsupported parameters never reach a provider.

### Phase 5 — Credit engine and reservation accounting (P0)

Database: add immutable credit transactions, reservations, pricing rules, purchase references, and job links; migrate the current balance as an opening transaction.

Backend: implement estimate/reserve/commit/release/refund/history operations; make all mutations transactional; calculate by operation and shot.

Frontend: show estimate and balance, explain variable-cost policy, and block dispatch without a successful reservation.

Acceptance: success commits once; provider failure/cancel/validation failure releases according to policy; retries create explicit new operations; insufficient balance prevents dispatch.

### Phase 6 — Automatic assembly, review, and social export (P0)

Database: add assembly jobs, AssemblyManifest, ordered clips, audio/caption tracks, output presets, and links to review/export versions.

Backend: assemble approved ShotVersions in order through a verified media runtime. If no ffmpeg/media worker exists, record the runtime as a Phase 0 infrastructure decision; do not assume a long server action can safely process arbitrary media.

Frontend: show a shot strip, not a full timeline; support reorder, replace, regenerate, captions/audio, review, and export.

Acceptance: deterministic order, actionable missing-shot errors, one-shot replacement, and 9:16 export for 15–60 seconds.

### Phase 7 — Bachs payment integration (P0)

Precondition: verify the live Bachs API base URL, auth scopes, checkout contract, launch currencies, minimum amounts, webhook secret, refunds, settlement, and merchant account.

Database: add provider, checkout, purchase, payment-event, and refund records with uniqueness constraints.

Backend: implement a neutral `PaymentProvider` interface and Bachs adapter; use hosted checkout; fulfill only from verified webhook events. Verify `X-Bachs-Timestamp` and `X-Bachs-Signature` against the raw body, reject stale signatures, deduplicate by event ID, and handle at-least-once delivery.

Frontend: show configurable localized packs for supported XAF/XOF/NGN currencies and pending/success/cancel states.

Acceptance: duplicate webhook credits once; forged/stale signatures are rejected; browser redirect alone never credits; refunds follow policy.

### Phase 8 — Voice, captions, and footage augmentation (P1)

Add transcript segments, timing, speaker/character mapping, captions, language, and source relationships. Use verified OpenRouter STT or another adapter, cache by asset checksum/configuration, align uploaded audio to the production, preserve caption edits, and estimate optional AI voice separately.

For footage, support trim/reformat/caption and supported AI B-roll/opening/ending operations. Do not add voice cloning or lip sync to V1.

### Phase 9 — Long-form-compatible continuation and advanced workflows (P1/P2)

Preserve sequences, dependencies, Bible versions, and incremental progress independent of the 60-second V1 cap. Resume from incomplete shots, retain completed versions, and defer long-form UI/model controls until short-form economics are validated.

## F. Migration and Compatibility Rules

- Do not replace `projects` or delete legacy fields.
- Create default production/version/sequence records lazily or through a controlled backfill.
- Map existing scenes under a default sequence; create compatibility shots only when semantics are known.
- Replace destructive `createScenesFromBlueprint` behavior with versioned regeneration after compatibility testing.
- Keep `render_jobs`, `render_layers`, `render_snapshots`, `remix_jobs`, `layer_diffs`, and `export_jobs` readable.
- Add object keys to existing assets by parsing URLs once where safe; preserve IDs and URLs during transition.
- Treat the current credit balance as a legacy opening balance and preserve existing ledger rows.
- Preserve user IDs, studios, memberships, project URLs, and old dashboard routes.

## G. Security and Operations

- Keep OpenRouter, Runway, Bachs, and Supabase service credentials server-side.
- Enforce studio/project membership for every new action and callback.
- Use private object storage and signed URLs for new private media after auditing existing consumers.
- Validate upload type, size, duration, and content policy where available.
- Rate-limit uploads, planning, generation, and retries.
- Treat model-produced JSON as untrusted until schema and policy validation.
- Audit plan approvals, reservations, provider submissions, commits/releases, payment events, exports, and asset deletion/archive.
- Alert on stuck jobs, reservation leaks, webhook signature failures, provider failures, and assembly failures.

## H. Final Testing Matrix

### Unit

DirectorPlan validation, asset-intent precedence, hierarchy ordering, capability filtering, cost line items, credit invariants, Bachs signature/timestamp validation, event deduplication, and assembly duration/order.

### Integration

RLS for new tables, legacy backfill, storage/signed URLs, OpenRouter structured-output fallback, Runway task/error mapping, and Bachs sandbox checkout/webhooks.

### End-to-end

New user -> 30-second idea -> plan -> estimate -> approval -> reservation -> independent shot jobs -> one failure -> targeted regeneration -> automatic 9:16 assembly -> caption/audio edit -> export -> Bachs purchase -> verified wallet credit.

Repeat for script, voice, image/character, footage, and ad modes.

## I. Rollout and Rollback

Roll out additive schema behind feature flags, backfill a staging/internal cohort, shadow new planning where cost-free, enable new generation for a small paid cohort, validate Bachs in sandbox, then enable production checkout. Monitor job success, cost variance, reservation leaks, webhook failures, assembly completion, and export completion.

Rollback disables new flags and routes existing projects to the legacy render path. Never delete ledger rows or new production data to roll back; use superseding records or compensating transactions. If Bachs is unavailable, disable purchases without fabricating payment success and keep existing funded balances governed by policy.

## J. Final Priorities

### P0

Verification/test baseline; production hierarchy; asset roles/provenance; DirectorPlan approval; cost estimate/reservations; shot jobs/idempotency; automatic assembly; 9:16 export; Bachs adapter/webhooks; all six entry modes at defined scope.

### P1

Voice transcription/timing/captions; footage augmentation; secondary output presets; long-form continuation; stronger continuity; additional payment methods.

### P2

Advanced model controls, richer templates, team billing, richer remix, analytics, and provider-cost reconciliation.

### FUTURE

Full NLE, one-hour single-generation requests, default voice cloning/lip sync, model marketplace, subscription-first monetization, enterprise production management, and social/community features.

## K. Owner Decisions Still Required

1. Confirm Bachs merchant account and sandbox/production access.
2. Confirm XAF, XOF, and NGN availability and settlement currency for that account.
3. Set credit-pack prices, promotional credits, minimum purchase, refund policy, tax, and receipts. Do not define packs as a fixed number of videos.
4. Confirm the durable job/media runtime.
5. Confirm active Runway models and supported quality/duration/resolution combinations.
6. Select initial OpenRouter planning/STT/TTS models only after live catalog and cost validation.
7. Confirm upload/media retention, maximum size/duration, and privacy policy for existing deployments.

## L. Final Deliverable Status

- Repository audit: complete.
- Preliminary roadmap: upgraded with this final planning-pass addendum.
- Application code changes: none.
- Database migrations: none.
- Infrastructure or production-data changes: none.
- Live provider documentation checked: Bachs, OpenRouter, Runway.
- Deployed Supabase schema/storage/RLS: not accessible from this checkout; explicitly marked `UNKNOWN — REQUIRES VERIFICATION`.
- Next safe implementation step: approve the P0 decisions and implement Phase 0 only.
