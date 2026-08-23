# FinalFrame Production Readiness Audit

**Audit date:** 23 August 2026  
**Repository:** `ashu378/finalframe`  
**Purpose:** Establish exactly where FinalFrame is today, what prevents a safe production launch, which specialist AI and deterministic systems are required, and what the owner must provide.

---

## 1. Executive verdict

FinalFrame has the beginnings of the correct product architecture, but it is **not ready for paid production users**.

The repository now contains a useful Convex production-domain skeleton: productions, director plans, versions, creative guides, sequences, scenes, shots, shot versions, generation jobs, assembly jobs, credit reservations, purchases, and payment events. The redesigned public website also communicates the new creator-first direction much better than the older engineering-focused interface.

However, the current application is still a hybrid prototype:

- Supabase remains the real authentication system and still owns onboarding, legacy projects, scenes, assets, editor records, reviews, exports, users, and several server actions.
- Convex owns a newer production model, but its public functions trust caller-supplied user identifiers instead of verified Convex identity claims.
- Several legacy output paths still return sample, placeholder, or mock media URLs.
- Shot generation is initiated from a request-bound server action rather than a durable worker workflow.
- Assembly creates a manifest only; it does not render a real ordered video.
- The AI Director is a single prompt and JSON parse, not yet a multi-stage production planning and validation system.
- Motion graphics, voice, transcription, captions, sound design, music, dubbing, and automated quality control are not implemented as production capabilities.
- Credit estimates are fallback constants and are not reconciled against actual provider usage.
- Bachs integration is structurally started, but the webhook-to-purchase correlation does not match the currently documented event shape and has not been verified in sandbox.
- Automated tests, CI gates, observability, incident controls, and deployment runbooks are effectively absent.

**Recommended launch target:** do not attempt to launch every promised workflow at once. First deliver one reliable vertical slice for 15–60 second videos with three deliberately constrained modes:

1. Motion-graphic social ads and announcements.
2. Stylized 2D African comedy/folktale explainers.
3. UGC or talking-head videos using approved voices and user-provided media.

Nollywood-style cinematic generation should enter controlled beta after continuity, audio, assembly, cost reconciliation, and evaluation gates are proven on shorter work.

---

## 2. Evidence labels used in this document

- **VERIFIED — REPOSITORY:** observed directly in the checked-out codebase.
- **VERIFIED — RUNTIME:** observed from the configured local or deployed environment available during this audit.
- **VERIFIED — OFFICIAL DOCS:** checked against current first-party provider documentation on the audit date.
- **INFERENCE:** a conclusion drawn from verified evidence.
- **UNKNOWN — REQUIRES VERIFICATION:** cannot be safely claimed from the repository or public documentation; it must be tested with the owner's account, credentials, or production environment.

Provider capabilities, model IDs, pricing, limits, licenses, and payment behavior are time-sensitive. They must be rechecked immediately before implementation and again before production rollout.

---

## 3. Locked product direction

### Customer promise

> Describe it. Paste it. Upload it. Bring your own assets. Approve the cost. Get the video.

### Product category

FinalFrame is an **AI-assisted production studio**, not a one-prompt video generator. The user remains the producer and final approver. Models and deterministic services act as specialist workers.

### Internal production contract

```text
CreateIntent
→ AI Director
→ DirectorPlan
→ CostEstimate
→ User Approval
→ ProductionVersion
→ Creative Guide
→ Sequence
→ Scene
→ Shot
→ ShotVersion
→ GenerationJob
→ AssemblyManifest
→ Review
→ Export
```

### Financial contract

```text
Estimate
→ Credit Reservation
→ Generation
   ├─ success → Commit actual charge and release excess
   └─ failure/cancel/expiry → Release reservation
```

The current code reserves and either commits or releases a fixed amount. Production accounting must additionally reconcile estimated and actual provider cost.

### Cultural direction

“African,” “Nigerian,” “Nollywood,” and “folktale” must not be treated as one visual style. A production must capture a specific region, language, period, genre, audience, wardrobe tradition, architecture, music tradition, and representation intent. FinalFrame should help creators specify those choices and preserve them through the Creative Guide.

---

## 4. Current architecture, grounded in the repository

### Application stack

| Area | Current implementation | Status |
|---|---|---|
| Web application | Next.js 16 App Router, React 19 | KEEP |
| Styling and motion | Tailwind CSS, custom global tokens, Framer Motion | KEEP / MODIFY |
| Authentication | Supabase Auth through server clients, middleware, callbacks | TEMPORARILY KEEP or MIGRATE |
| Legacy application data | Supabase tables and storage | COMPATIBILITY LAYER |
| New production data | Convex schema and functions | KEEP / HARDEN |
| AI planning | OpenRouter through OpenAI-compatible SDK | KEEP / REFACTOR |
| Video generation | Runway adapter | KEEP / REFACTOR |
| Payments | Provider interface plus Bachs adapter and webhook route | KEEP / FIX |
| Media assembly | Manifest creation plus legacy mock export paths | REPLACE |
| Testing | One SQL seed file; no meaningful application test suite | NEW |
| Observability | Console logging and provider errors | NEW |

### Current data authority is hybrid

**VERIFIED — REPOSITORY:** the product has not completed a Supabase-to-Convex migration.

Supabase is still used for:

- Authentication and session identity.
- Onboarding and studio profile data.
- Legacy projects and scenes.
- Asset upload and storage paths.
- Render jobs and older render pipeline.
- Editor snapshots, layers, remix operations, exports, sharing, and reviews.
- Several admin and dashboard data reads.

Convex currently contains:

- Users, studios, and project compatibility records.
- Productions and Director Plans.
- Production versions and Creative Guides.
- Sequences, scenes, shots, and shot versions.
- Generated assets.
- Generation jobs and assembly jobs.
- Price rules, reservations, and credit transactions.
- Payment purchases and payment events.

**INFERENCE:** Convex is the intended future production authority, but the application still needs an explicit migration boundary. Calling the present system “fully transferred to Convex” would be inaccurate and unsafe.

### Current route surface

The repository includes public marketing, authentication, onboarding, creator dashboard, project, blueprint, editor, production, review, billing, and admin routes. Public pages load locally, but protected routes cannot be meaningfully exercised without a configured authentication environment and test accounts.

### Existing work worth preserving

- The current Next.js/Tailwind application shell.
- Creator-first public positioning and creation entry points.
- Convex production entities and ordered sequence/scene/shot model.
- Existing provider adapter boundary.
- Existing credit reservation concept and payment-provider interface.
- Existing project/editor/review records during migration.
- Existing status mapping and friendly terminology work where already adopted.

---

## 5. Production readiness scorecard

| Area | Current state | Launch status |
|---|---|---|
| Public marketing | Redesigned foundation exists; some legacy copy remains | PARTIAL |
| Authentication | Supabase-dependent; no production credentials in local environment | BLOCKED |
| Authorization | Convex functions trust caller-supplied external IDs | P0 BLOCKER |
| Onboarding | Multiple Supabase-backed routes with mixed old/new language | PARTIAL |
| Creator dashboard | Redesigned shell exists; data comes from mixed authorities | PARTIAL |
| AI Director | Single LLM call and permissive JSON parsing | PROTOTYPE |
| Creative Guide/continuity | Convex entities exist; enforcement and rich reference handling are incomplete | PROTOTYPE |
| Image generation | Registry/adapter concept exists; live capability is not proven | BLOCKED BY KEYS/TESTING |
| Video generation | Runway adapter exists; request-bound orchestration and model assumptions need replacement | PROTOTYPE |
| Motion graphics | Prompt category exists; deterministic renderer/template system does not | NOT IMPLEMENTED |
| Voice and dialogue | Capability labels only; no complete voice workflow | NOT IMPLEMENTED |
| Transcription/captions | Capability labels only; no timing/caption pipeline | NOT IMPLEMENTED |
| Sound design/music | No production pipeline | NOT IMPLEMENTED |
| Assembly/export | Manifest only; legacy export uses sample media | P0 BLOCKER |
| Credits | Reservation tables and mutations exist; lifecycle and reconciliation are incomplete | PROTOTYPE |
| Payments | Bachs adapter/webhook started; correlation and sandbox verification incomplete | P0 BEFORE PAID LAUNCH |
| Admin | UI routes exist; complete operational read models and audit controls do not | PARTIAL |
| Safety/rights | No complete policy or enforcement pipeline | P0 BLOCKER |
| Automated tests/CI | Essentially absent | P0 BLOCKER |
| Observability/operations | Console logs only | P0 BLOCKER |
| Deployment/rollback | No complete production runbook or verified pipeline | BLOCKED |

---

## 6. Critical repository findings

### [P0] Convex authorization trusts unverified caller identity

**Evidence — VERIFIED REPOSITORY:** Convex public functions accept `ownerExternalId` as an argument. `requireStudio` compares that supplied value with a stored owner ID, but does not obtain identity from `ctx.auth`. The Next.js server actions authenticate through Supabase before calling Convex, but the Convex endpoints themselves remain internet-accessible.

**Why it matters:** an attacker who learns or guesses an external user identifier could call public Convex functions directly and impersonate that owner. Payment webhook mutations are also public without a Convex-side service-secret boundary.

**Required change:** integrate a verified OIDC identity with Convex and derive user identity from `ctx.auth.getUserIdentity()`. Make provider callbacks internal or protect dedicated HTTP actions with verified signatures/service secrets. Never accept authorization identity as ordinary client input.

### [P0] Legacy pipelines can return fake media

**Evidence — VERIFIED REPOSITORY:** `src/lib/export/pipeline.ts` returns a Google sample video; `src/lib/render/pipeline.ts` contains `example.com` image/video fallbacks; `src/lib/remix/pipeline.ts` generates `mock-asset.com` URLs.

**Why it matters:** a paid user can be shown a successful state without receiving their actual output. This corrupts credits, reviews, exports, and trust.

**Required change:** remove all successful placeholder fallbacks. Missing provider output must produce a typed failed job, release reserved credits, preserve diagnostics, and offer retry.

### [P0] Generation is not a durable workflow

**Evidence — VERIFIED REPOSITORY:** shot generation runs provider work inside a server action. Job creation uses `Date.now()` in the idempotency key, which makes every click a new operation. Processing, provider polling, completion, and credit finalization are not a durable queue/workflow.

**Why it matters:** browser disconnects, serverless timeouts, deploys, and transient provider errors can leave jobs and reservations stuck. Duplicate clicks can create duplicate charges.

**Required change:** capture intent atomically in a Convex mutation, assign a stable operation key, then schedule an internal action or workflow. Implement leases, retry policy, cancellation, timeout, provider reconciliation, and an expiry sweeper. Convex documents that actions with side effects are not automatically retried, so retry and idempotency must be designed explicitly.

### [P0] Credit reservation is disconnected from the original job lifecycle

**Evidence — VERIFIED REPOSITORY:** creation reserves credits, but processing calls `reserveCredits` again to recover a reservation by idempotency key. The job does not store a required reservation ID. Reservation expiry has no observed sweeper. `COMMIT` records no separate commit transaction and no actual provider cost.

**Why it matters:** orphan reservations, double bookkeeping, inaccurate margin, and unreleased balances become likely under failures.

**Required change:** atomically create the job and reservation relationship; store both IDs; represent estimated, reserved, actual, committed, released, and refunded amounts; reconcile provider usage; sweep expired reservations; make every transition idempotent.

### [P0] Assembly does not assemble video

**Evidence — VERIFIED REPOSITORY:** Convex `assembly.createJob` builds an ordered manifest and writes a queued record. It does not render, mix audio, produce captions, or persist a completed file.

**Why it matters:** the core promise “Get the video” is not fulfilled by a JSON manifest.

**Required change:** add a deterministic rendering worker using Remotion and/or FFmpeg, with versioned manifests, validated inputs, frame/audio timing, output presets, storage persistence, progress, retries, and media probes.

### [P0] Bachs webhook correlation is not proven

**Evidence — VERIFIED REPOSITORY:** checkout metadata includes a FinalFrame reference. The webhook route searches `event.data.reference` or `event.data.metadata.reference`. Current official Bachs `collection.succeeded` examples contain `charge_id`, `checkout_id`, amount, currency, and status, but do not show arbitrary checkout metadata in that event. The purchase record stores `providerCheckoutId`, but webhook processing does not correlate by `checkout_id`.

**Why it matters:** a valid payment can arrive but fail to credit the account. Conversely, fulfillment must never trust only browser redirects or unverified metadata.

**Required change:** in sandbox, verify the exact event payload; correlate primarily by stored checkout ID, verify amount/currency/status, deduplicate by event ID, record every processing outcome, and reconcile ambiguous events through the provider API. The webhook must remain the fulfillment source of truth.

### [P1] AI Director output is weakly constrained

**Evidence — VERIFIED REPOSITORY:** the older blueprint flow requests JSON object mode, asks for a top-level array, manually parses text, inserts fallback phrases, and logs duplicate scenes without blocking or retrying. It does not use a strict JSON Schema, versioned planning contract, capability validation, or separate creative/QC stages.

**Why it matters:** plans can look complete while containing generic, culturally inaccurate, visually impossible, or provider-incompatible shots.

**Required change:** use strict structured outputs and a versioned DirectorPlan schema. Split brief analysis, story/script, visual development, shot planning, provider compilation, cost estimation, and critique into explicit stages with user approval.

### [P1] The model registry is stale and too coarse

**Evidence — VERIFIED REPOSITORY:** four broad capabilities are hard-coded to model identifiers and descriptions. Transcription and TTS use `auto` labels rather than implemented adapters. Current Runway model availability and deprecations are not represented dynamically.

**Why it matters:** model availability, modality support, duration, aspect ratio, cost, and quality vary and change over time. A single “video engine” choice cannot serve drafts, character performance, video transformation, and final cinematic work equally.

**Required change:** create a provider-neutral capability registry populated from verified metadata plus FinalFrame policy. Route by task requirements and quality tier, not branding claims. Pin tested model versions for each release and support controlled fallback.

### [P1] Generated media is stored as external bearer URLs

**Evidence — VERIFIED REPOSITORY:** completed generation creates a Convex asset with `storageUrl: args.assetUrl`; it does not fetch and persist provider output into FinalFrame-controlled storage.

**Why it matters:** provider links may expire, leak, change, or become unavailable. Access revocation and long-term export reproducibility are not controlled.

**Required change:** ingest every approved generated output into controlled storage, record checksum, MIME type, dimensions, duration, provider provenance, policy metadata, and access level. Do not use public URLs as permanent asset identity.

### [P1] Old technical language remains in active user surfaces

**Evidence — VERIFIED REPOSITORY:** onboarding, asset, editor, review, team, and render components still contain phrases such as “Signal Context,” “Filter Materials,” “Enter Directive,” “Registry,” and “Signal Failure.”

**Why it matters:** the customer promise is simple, but active product surfaces still expose internal terminology and make the product feel like an engineering console.

**Required change:** complete the terminology map across all active routes and preserve technical details only in an optional advanced/debug layer.

### [P1] No serious test or operational safety net

**Evidence — VERIFIED REPOSITORY:** no meaningful unit, integration, browser, provider-contract, or accessibility test suite was found. No CI workflow, error tracker, distributed tracing, or production incident runbook was established in the audited repository.

**Why it matters:** authorization, money, asynchronous generation, and media processing failures will reach users undetected.

**Required change:** establish CI and observability before paid launch, including provider sandbox contract tests and synthetic end-to-end jobs.

---

## 7. The specialist “production crew” FinalFrame needs

One model should not write, direct, generate, edit, mix, and judge the same production. The correct design is a routed crew with versioned handoffs.

| Production role | Required capability | Recommended implementation strategy | Needed for first launch |
|---|---|---|---|
| Executive producer / AI Director | Understand brief, constraints, audience, budget, and workflow | Frontier reasoning LLM with strict structured output through OpenRouter | YES |
| Researcher | Ground claims, products, references, and cultural context | Search/retrieval service plus citations and approved source pack | CONDITIONAL |
| Scriptwriter | Hooks, dialogue, narration, scene beats | Strong language model; configurable tone and reading level | YES |
| Story editor | Critique structure, pacing, repetition, payoff | Separate LLM pass with rubric; never self-approve silently | YES |
| Cultural context reviewer | Region/language/period-specific review | Curated retrieval corpus plus trained human reviewers for launch templates | YES for African workflows |
| Shot planner | Convert approved script into sequences/scenes/shots | Structured-output LLM constrained by provider capabilities | YES |
| Prompt compiler | Translate a shot spec into provider-specific request | Deterministic adapter plus model-assisted prompt transformation | YES |
| Continuity supervisor | Compare characters, wardrobe, props, palette, and locations | Multimodal vision model, embeddings, reference packs, deterministic checks | YES |
| Concept artist | Character sheets, backgrounds, props, keyframes | Reference-capable image generation model | YES |
| Storyboard artist | Low-cost shot thumbnails and animatic frames | Fast image model; stable character/location references | YES |
| Cinematographer | Generate final motion shots | Runway quality model selected by mode, duration, references, and budget | YES |
| Performance animator | Face/body performance and lip sync | Runway Act-Two or verified equivalent with consent controls | UGC/cinematic |
| Video transformation/VFX artist | Restyle, extend, remove/change elements | Runway Aleph2 or verified video-to-video/editor model | LATER BETA |
| Motion designer | Titles, kinetic type, lower thirds, charts, logos, calls to action | **Deterministic Remotion/Lottie/FFmpeg templates**, parameterized by a safe schema | YES |
| Transcription editor | Speech-to-text, diarization, word timing | Dedicated transcription model/API | YES for uploaded footage |
| Voice actor | Narration and character voices | Dedicated TTS/voice provider with licensed voices and consent records | YES |
| Dialogue editor | Forced alignment, timing, pauses, pronunciation | Forced-alignment API plus deterministic timeline logic | YES |
| Sound designer | Ambience, foley, transitions, effects | Prompt-to-SFX model/API with licensing metadata | YES |
| Composer | Music bed, themes, stems | Licensed music-generation or catalog provider | LATER / optional launch |
| Dubbing/localization producer | Translate and revoice while preserving timing | Dubbing provider plus language QA | LATER |
| Picture editor | Ordered cuts, trims, transitions, overlays | Deterministic timeline renderer; AI may propose edits but not own rendering | YES |
| Color/format finisher | Normalize color, loudness, codec, dimensions | FFmpeg/media worker, not an LLM | YES |
| QC reviewer | Detect visual glitches, bad anatomy, text corruption, silence, clipping, continuity breaks | Vision/audio models plus `ffprobe`, frame sampling, loudness and duration checks | YES |
| Safety reviewer | Text/image/video/audio policy checks | Moderation model plus transcript/frame scanning and human escalation | YES |
| Library assistant | Retrieve brand, character, product, location, and prior-shot references | Embeddings/vector search with studio-scoped access | YES |

### Current provider strategy

#### OpenRouter

**VERIFIED — OFFICIAL DOCS:** OpenRouter supports JSON-schema structured outputs on compatible models, multimodal model discovery, and model metadata/filtering. It should remain a routing layer for planning and evaluation, but FinalFrame must query capabilities and pin tested models rather than assume every model supports every parameter.

Recommended uses:

- Brief interpretation and DirectorPlan creation.
- Script and story editing.
- Provider-neutral shot specifications.
- Multimodal continuity review.
- Quality critique and failure explanation.
- Optional image/audio models only after capability and billing tests.

Do not use a language model to directly generate final customer-visible typography, logos, pricing numbers, or legal claims inside video frames.

#### Runway

**VERIFIED — OFFICIAL DOCS:** current Runway documentation exposes several video, image, audio, performance, editing, and upscaling models through asynchronous task APIs. Current model constraints and per-second pricing differ. The API exposes estimated cost, task IDs, polling, and account limits. Older model generations have sunset dates, so FinalFrame must not encode a static long-lived model list.

Recommended routing:

- Fast previews/story motion: a tested fast video model such as Gen-4 Turbo or current router equivalent.
- Final cinematic shots: a tested quality model such as Gen-4.5, subject to current account access and cost.
- Character performance: Act-Two or current supported performance model.
- Existing footage transformation: Aleph2 or current video-to-video editing model.
- Upscaling: dedicated image/video upscaler after quality gate, not on every draft.

**UNKNOWN — REQUIRES VERIFICATION:** exact model access, concurrency tier, organization limits, geographic availability, content policy, and real billing for the owner's Runway account.

#### Voice, transcription, effects, and music

ElevenLabs currently provides TTS, transcription, sound effects, voice design/cloning, dubbing, alignment, isolation, and music APIs. It is a strong candidate for a unified audio provider, but FinalFrame should keep provider-neutral interfaces. Advertising, film, television, games, and enterprise music may require additional licensing; the account terms must be verified for FinalFrame's intended use.

OpenAI currently offers dedicated transcription, TTS, image, embedding, and moderation models. These are alternatives or fallbacks, not a reason to route all media work through one vendor.

**Owner decision required:** choose a primary audio provider and a fallback. The decision must include Nigerian and other African accent/language evaluation using native speakers, not only vendor demo quality.

#### Deterministic render stack

Motion graphics and final assembly should not depend on a generative video model.

- Remotion is suitable for React-driven motion design systems, parameterized templates, browser previews, and MP4 rendering.
- FFmpeg is suitable for transcode, scale, overlays, filters, audio mixing, caption burn-in, probing, and final format normalization.
- A production deployment needs a licensed/scalable rendering environment and a queue separate from request-bound Next.js functions.

Recommended split:

```text
LLM produces validated MotionGraphicSpec JSON
→ template registry selects approved composition
→ Remotion renders designed frames/animation
→ FFmpeg normalizes, mixes, captions, and packages output
→ QC probes verify the actual file
```

---

## 8. Anti-slop production system

“AI slop” is mainly a workflow failure: vague briefs, one-shot generation, no references, no editorial separation, no continuity contract, no cultural grounding, and no rejection gate.

FinalFrame should require the following artifacts and gates.

### Gate 1 — Creative brief

Capture:

- Audience and publishing channel.
- Desired action and emotional effect.
- Country, region, language, and cultural context.
- Format, duration, budget, deadline, and aspect ratio.
- Brand restrictions, required claims, prohibited claims, and references.
- Whether real people, synthetic people, cloned voices, or public figures are allowed.

### Gate 2 — Creative Guide

Version and lock:

- Character identity sheets with front/profile/expressions and body proportions.
- Wardrobe, hair, skin tone, age, accessories, and prohibited drift.
- Location and architecture references.
- Palette, texture, lighting, lens, framing, and animation rules.
- Product/logo files and safe areas.
- Pronunciation guide, voice identity, language, accent, and consent record.
- Music and cultural reference notes.

### Gate 3 — Script and storyboard

- Separate script generation from script critique.
- Show the user the exact narration/dialogue.
- Generate cheap storyboard frames first.
- Build an animatic with approximate timing before expensive video generation.
- Reject repetitive, generic, physically impossible, or culturally ambiguous shots.

### Gate 4 — Shot capability and cost validation

Every shot must pass:

- Provider/model supports the requested input/output mode.
- Duration, aspect ratio, resolution, and reference count are valid.
- Required media is available and authorized.
- Estimated credits and worst-case retry budget are visible.
- Text, logos, UI, and charts are assigned to deterministic graphics where possible.

### Gate 5 — Generation and editorial review

- Generate draft takes at lower cost where appropriate.
- Keep every take and its prompt/reference/provenance snapshot.
- Score technical quality and continuity automatically.
- Let the user compare, approve, or regenerate individual takes.
- Never silently replace an approved take.

### Gate 6 — Assembly and audio finish

- Assemble in exact sequence/scene/shot order.
- Respect word timings, captions, beat markers, and dialogue pauses.
- Mix narration, dialogue, ambience, effects, and music separately.
- Normalize loudness and prevent clipping.
- Render titles, logos, prices, and calls to action deterministically.

### Gate 7 — Final QC

Automated checks:

- File decodes; expected codec/container exists.
- Duration and dimensions match preset.
- No missing, frozen, black, or corrupt sections.
- Audio exists where required; no clipping or long unintended silence.
- Captions fit safe areas and match transcript timing.
- Sampled frames pass moderation and visual-quality rubrics.
- Character, wardrobe, product, and location continuity scores meet thresholds.
- Claims and URLs match approved project data.

Human/user checks:

- Cultural authenticity and tone.
- Consent and likeness approval.
- Story clarity and emotional impact.
- Final approval before download or publishing.

---

## 9. Workflow requirements by product mode

### Motion graphics

Required system:

1. Convert brief/script/data into a validated `MotionGraphicSpec`.
2. Select an approved design family, not a random visual style.
3. Apply brand fonts, colors, logo rules, spacing, and transitions.
4. Render typography, icons, charts, UI demos, captions, and calls to action with deterministic code.
5. Use generative image/video only for background plates, textures, or illustrative inserts.
6. Preview in-browser, then queue high-quality render.

This is the safest high-quality launch workflow because typography and timing can be controlled exactly.

### Stylized Nigerian/African 2D comedy and folktales

Required system:

1. Ask for specific cultural setting, not “African style.”
2. Record folklore source/provenance and adaptation rights where relevant.
3. Build a character and world bible before any moving shot.
4. Create coherent turnaround sheets and expression packs.
5. Use storyboard/animatic approval.
6. Generate short motion shots from approved keyframes or use layered 2D puppeting for repeatable characters.
7. Record or synthesize voices only with approved language/accent and identity rights.
8. Use culturally appropriate ambience/music reviewed by knowledgeable people.
9. Run continuity and stereotype checks before export.

For recurring comedy characters, a reusable rig/layered asset workflow will be more consistent than regenerating every frame from text.

### Nollywood-style cinematic scenes

Required system:

1. Screenplay and scene breakdown.
2. Cast, wardrobe, location, prop, and lighting bible.
3. Shot list with coverage: establishing, masters, mediums, close-ups, inserts, reaction shots.
4. Dialogue/voice plan before final picture generation.
5. Keyframe and continuity approval for every setup.
6. Short generated takes with handles for editing.
7. Dedicated dialogue edit, room tone, foley, score, and color finish.
8. Human review for performance, cultural authenticity, and narrative coherence.

Long continuous scenes should not be the first launch target. Build them from approved short takes and controlled edits.

### UGC and talking-head work

- Enforce likeness and voice consent.
- Support user footage and approved synthetic presenters.
- Transcribe first, then edit against word timing.
- Use performance/lip-sync models only where allowed.
- Keep natural pauses and controlled imperfection; do not over-polish into uncanny output.
- Render subtitles and product overlays deterministically.

### Existing-footage enhancement

- Upload and virus-scan original footage.
- Generate transcript, shots, faces/objects, and technical media metadata.
- Allow silence removal, reframing, captions, B-roll suggestions, motion graphics, cleanup, and sound enhancement.
- Preserve original media and make edits non-destructive.
- Show exactly which sections AI changed.

---

## 10. Data and backend changes required before production

### Identity and authorization

Choose one authority and document it:

**Recommended:** use a production-grade OIDC provider with first-class Next.js and Convex support, then derive all Convex authorization from verified identity claims. Convex's own Auth library remains beta and its official documentation describes Next.js server support as still developing; it should not be selected merely to avoid a migration decision.

Required records:

- Auth subject to FinalFrame user mapping.
- Studio membership and role table.
- Invite lifecycle.
- Admin roles separated from creator roles.
- Service identities for renderer/provider webhooks.
- Audit log for privileged actions.

### Canonical media model

Every asset should include:

- Internal immutable ID and storage ID.
- Studio/project/production scope.
- Role(s): character, logo, product, background, footage, voice, music, SFX, generated take, final export, and so on.
- Source and provenance: upload, generated, imported, licensed catalog.
- Provider/model/version/job and prompt/reference snapshot for generated work.
- Rights, consent, license, retention, and moderation state.
- MIME type, bytes, checksum, dimensions, duration, frame rate, channels, and sample rate.
- Parent/derived relationships.
- Access level and deletion state.

### Storage decision

Convex File Storage can store arbitrary media and generated outputs. Its standard file URLs are bearer URLs and do not expire; official documentation recommends application checks or an alternative such as R2 when expiring URLs are needed. Large private video delivery should therefore use a storage/CDN design with signed expiring URLs, lifecycle policies, and controlled egress.

**Owner decision required:** Convex storage for metadata/small assets plus R2/S3-compatible storage for large private media is the recommended production pattern, but cost and deployment region must be approved.

### Durable job model

Add or complete:

- Job operation type, capability, requested model policy, selected provider/model/version.
- Stable idempotency key and request hash.
- Reservation ID and estimate version.
- State machine with queued, leased, processing, polling, succeeded, failed, canceled, timed out, and reconciliation-required states.
- Attempt records rather than only a counter.
- Provider task ID, timestamps, next poll, deadline, lease owner/expiry.
- Sanitized error code, internal error detail, retryability, and correlation ID.
- Actual usage/cost and provider invoice reconciliation.
- Output storage IDs and checksums.
- Cancellation and cleanup behavior.

### Assembly model

Version an `AssemblyManifest` containing:

- Ordered visual clips and selected shot versions.
- Exact in/out points and transition definitions.
- Audio tracks, gain automation, fades, ducking, and loudness target.
- Caption track and style.
- Motion-graphic compositions and parameters.
- Output frame rate, dimensions, codec, bitrate, and safe areas.
- Source hashes so a render is reproducible.
- Renderer version and template versions.

---

## 11. Public website, creator app, and admin gap

### Public website

The current redesign is directionally correct, but production claims must be tied to actually available workflows. Generated showcase material must be labelled as FinalFrame demonstrations, not fabricated customer work.

Before launch:

- Remove or rewrite any claim for unavailable modes.
- Add real product screenshots/video demonstrations.
- Add clear ownership, privacy, consent, acceptable-use, and refund explanations.
- Explain credit estimates and failed-job releases in plain language.
- Complete metadata, social cards, sitemap, robots rules, analytics consent, legal review, and performance optimization.
- Verify 375, 768, 1024, and 1440 pixel layouts.
- Meet Core Web Vitals targets: LCP at or below 2.5 seconds, CLS at or below 0.1, and INP at or below 200 ms at the 75th percentile.

### Onboarding and dashboard

Before launch:

- Replace remaining “signal/registry/directive” terminology.
- Resolve hybrid user/studio IDs so every dashboard query has one canonical identity mapping.
- Add useful empty, loading, offline, unauthorized, provider-unavailable, and retry states.
- Make optional media genuinely skippable.
- End onboarding in an executable first project, not an empty dashboard.
- Show pending jobs across navigation and after refresh.
- Never require a tab to remain open for generation.

### Project production workspace

Before launch:

- Preserve the user's context while background jobs run.
- Show `Idea → Plan → Approve cost → Make → Review → Download` with real state.
- Provide rationale, reference inputs, and editable fields for AI suggestions.
- Separate approval of plan, cost, individual takes, and final export.
- Show estimated versus actual credits.
- Support retry/cancel/regenerate without duplicate charges.
- Keep advanced camera/provider controls optional.

### Admin and operations

Admin must read real records only and include:

- User/studio search and role-safe account detail.
- Active/stuck/failed jobs and provider task identifiers.
- Reservation, commit, release, purchase, refund, and reconciliation events.
- Payment webhook delivery state and deduplication.
- Moderation and rights review queue.
- Storage usage and orphan cleanup.
- Provider health, rate limits, spend, and queue depth.
- Safe replay/retry controls with confirmation and audit trail.
- Correlation IDs linking user action, job, provider task, credit transaction, payment event, and export.

---

## 12. Payments and credit accounting

### Verified Bachs behavior on the audit date

Current official documentation describes:

- Bearer API keys with separate sandbox and production keys/URLs.
- Sandbox at `https://sandbox-api.bachs.io` and production at `https://api.bachs.io`.
- Hosted checkout sessions using either a catalog `product_cart` or raw `pricing` object.
- `checkout_url` and `checkout_id` responses.
- Redirects for user experience, but webhook confirmation as the fulfillment source of truth.
- `X-Bachs-Timestamp` and `X-Bachs-Signature`, with HMAC-SHA256 over `timestamp.raw_body` and a five-minute example tolerance.
- At-least-once webhook delivery and event-ID deduplication.
- Payment events including `collection.succeeded`, `collection.failed`, and `collection.underpaid`.
- Collection currencies and methods that differ from balance and withdrawal currencies.

### Required payment lifecycle

```text
Create purchase intent in Convex
→ call provider adapter with immutable reference
→ store provider checkout ID and expected amount/currency/credits
→ redirect to hosted checkout
→ receive and verify raw-body webhook
→ deduplicate event ID
→ correlate by checkout ID/reference verified from provider
→ verify event type, status, amount, currency, environment, and merchant
→ atomically credit account and close purchase
→ record audit/reconciliation data
```

### Required failure handling

- `collection.failed`: mark failed without crediting.
- `collection.underpaid`: hold for reconciliation; never automatically grant full credits.
- Duplicate event: return success without a second credit.
- Unknown checkout ID: store event as unmatched and alert operations.
- Amount/currency mismatch: quarantine and alert.
- Webhook processing failure: retain event and support idempotent replay.
- Refund/chargeback: define whether credits are removed, balance can go negative, or account is frozen.
- Redirect without webhook: show “confirming payment,” not “paid.”

**UNKNOWN — REQUIRES VERIFICATION:** the exact metadata propagation, API scopes for checkout creation, live merchant approval, settlement configuration, production fees, refund/dispute behavior, and sandbox test fixtures for the owner's Bachs account.

---

## 13. Security, safety, rights, and compliance

Production launch requires written policies and enforcement for:

- Authentication, MFA/admin security, session revocation, and password/reset abuse.
- Studio membership authorization on every query/mutation/action.
- Rate limiting and bot/spam controls.
- Upload scanning, MIME validation, size/duration limits, and decompression protection.
- SSRF protection when importing remote media.
- Secret management and key rotation.
- Private media access and signed URLs.
- Prompt and metadata redaction in logs.
- User data deletion, export, retention, and backup.
- Model provider data-use terms and opt-outs.
- Copyright and trademark complaints.
- Voice cloning and likeness consent.
- Minors and sensitive-person policies.
- Public-figure/deceptive media restrictions.
- Music, stock media, template, font, and generated-content licensing.
- Moderation of text, uploads, sampled video frames, audio transcripts, and final exports.
- Human escalation and appeals.

The Convex deployment token previously shared in chat should be rotated before production. It must never appear in source control, documentation, logs, screenshots, or client code.

---

## 14. Testing required before production

### Unit and schema tests

- DirectorPlan and MotionGraphicSpec schema validation.
- Status-to-friendly-language mapping.
- Capability/model selection and parameter validation.
- Cost calculations, rounding, expiry, and reconciliation.
- HMAC signature verification including stale and malformed inputs.
- Assembly ordering and duration calculations.
- Rights/consent state transitions.

### Integration tests

- Auth identity propagation into Convex.
- Cross-studio access denial for every public function.
- Upload, storage persistence, derived asset lineage, and deletion.
- Job creation, stable idempotency, retries, cancellation, timeout, and recovery.
- Reservation, commit, partial release, full release, and expiry sweeper.
- Provider sandbox contract tests with recorded sanitized fixtures.
- Bachs checkout/webhook event correlation, duplicates, underpayment, and mismatch.
- Remotion/FFmpeg render and media probe validation.

### End-to-end tests

- New account → onboarding → create → approve plan/cost → generate → review → export.
- Existing user/project compatibility path.
- Refresh/close browser during generation and return later.
- Provider outage and retry.
- Insufficient credits and payment recovery.
- Failed take regeneration without double charge.
- Public review comment, revision request, approval, and download.
- Admin-only access and audited replay.

### Quality evaluation set

Build a permanent, versioned set of briefs covering:

- Nigerian 2D comedy with recurring characters.
- Yoruba, Igbo, Hausa, Nigerian English, and Pidgin examples reviewed by native speakers.
- Region-specific folktales with source and cultural review notes.
- Nollywood dialogue scenes with continuity coverage.
- Motion-graphic ads with exact brand text and numbers.
- UGC, product demo, existing-footage enhancement, and mixed-language captions.
- Dark skin exposure/lighting, hair texture, clothing, architecture, and diverse body/face representation.

Track plan validity, continuity, text accuracy, audio intelligibility, caption timing, cultural review, regeneration rate, completion rate, time to first preview, final cost, and user approval.

### Accessibility and frontend quality

- Full keyboard operation and visible focus.
- Screen-reader labels and status announcements.
- Captions/transcripts for product demos.
- Reduced-motion behavior.
- Color contrast at WCAG AA.
- Responsive behavior at agreed breakpoints.
- Real empty/loading/error/permission/provider-offline states.

---

## 15. Observability and operational readiness

Required telemetry:

- Structured logs with correlation IDs and redaction.
- Error tracking for browser, Next.js server, Convex, worker, and webhook paths.
- Traces from user intent through provider and render completion.
- Metrics: queue depth, age, success rate, retry rate, stuck jobs, provider latency, cost, estimate variance, reservation age, webhook failures, render failures, storage growth, and export download errors.
- Provider health and circuit breakers.
- Alerts for authorization anomalies, spend spikes, unmatched payments, orphan reservations, and job backlog.
- Synthetic daily production and payment-sandbox checks.

Required runbooks:

- Provider outage or degraded quality.
- Stuck/duplicate generation.
- Credit imbalance.
- Payment webhook outage.
- Storage/CDN outage.
- Key compromise and rotation.
- Harmful/unauthorized likeness report.
- Rollback and data restoration.

---

## 16. What the owner must provide

Do not paste production secrets into chat or commit them to Git. Use the deployment platform and Convex environment-secret controls.

| Item | Why it is needed | When |
|---|---|---|
| Final authentication decision | Establish one trusted user identity across Next.js and Convex | IMMEDIATELY |
| Auth provider project and test accounts | Login, email verification, reset, roles, and identity claims | IMMEDIATELY |
| Convex production project access/deploy key | Deploy schema/functions and configure secrets | AVAILABLE, ROTATE BEFORE PROD |
| OpenRouter API key | Planning, scripting, structured outputs, multimodal QC | P0/P1 |
| Approved OpenRouter model allowlist and spend ceiling | Prevent uncontrolled routing/cost | P0/P1 |
| Runway API key and funded organization | Video/image/performance generation | P1 |
| Runway account tier/limits | Concurrency and cost planning | P1 |
| Audio provider choice and API key | TTS, transcription, alignment, SFX, optional music/dubbing | P1 |
| Bachs sandbox key, webhook secret, and merchant sandbox access | Verify purchase flow | BEFORE BILLING WORK |
| Bachs production approval/key | Accept real payments | FINAL LAUNCH GATE |
| Storage/CDN decision and credentials | Private source/generated media and final exports | P0 |
| Renderer infrastructure decision | Remotion/FFmpeg workers and scalable rendering | P0 |
| Email provider key and verified sending domain | Verification, resets, invites, job/payment notifications | P0 |
| Error tracking/observability project | Logs, traces, alerts, release health | P0 |
| Hosting project, domain, and DNS access | Preview/staging/production deployment | P0 |
| Legal entity, support email, privacy contact | Terms, privacy, payments, disputes, takedowns | BEFORE PUBLIC LAUNCH |
| Content and likeness policy decisions | Safety enforcement and creator expectations | P0 |
| Refund/credit policy | Payment and failed-generation handling | BEFORE BILLING |
| Launch markets and currencies | Bachs pricing, tax/legal review, localization | P0 |
| Cultural reviewers/native speakers | Evaluation of priority African languages and workflows | P1 |
| Reference productions and quality bar | Define what “good enough” means for launch | IMMEDIATELY |

### Owner decisions that cannot be safely guessed

1. Which auth provider will be the long-term authority?
2. Will large media live in R2/S3-compatible storage, Convex storage, or a hybrid?
3. Which three workflows are in the first paid release?
4. What maximum generation cost, wait time, and retry budget are acceptable per tier?
5. Which providers are primary and which are fallbacks for image, video, speech, music, and transcription?
6. Which countries, currencies, and payment methods launch first?
7. What voice cloning, likeness, public-figure, and synthetic-person policies apply?
8. What data retention and model-training opt-out promises are made?
9. Which export presets are guaranteed at launch?
10. What human review is mandatory for cultural templates and safety escalations?

---

## 17. Recommended path to production

### P0 — Make the foundation truthful and safe

**Objective:** eliminate architectural ambiguity and prevent data/money corruption.

- Decide authentication and data authority.
- Replace caller-supplied Convex identity with verified auth claims.
- Protect service/webhook paths.
- Remove all mock/sample success outputs.
- Define canonical media storage and provenance.
- Add feature flags, structured logs, error tracking, CI, and baseline tests.
- Fix build/lint scripts and Next.js configuration warnings.
- Define safety, consent, refund, and retention policies.

**Acceptance:** no cross-studio access; no fake success output; production/staging secrets are isolated; CI blocks regressions; every operation has a correlation ID.

### P1 — Reliable short-form vertical slice

**Objective:** make one complete, paid-quality production path work.

- Strict DirectorPlan schema and approval.
- Storyboard and Creative Guide artifacts.
- Provider capability registry and model pinning.
- Durable shot jobs with stable idempotency.
- Credit reservation linked atomically to jobs.
- Controlled storage ingestion.
- Deterministic motion graphics and assembly renderer.
- Review, regenerate, final QC, and export.
- Initial audio/transcription/caption capability.

**Acceptance:** a user can create, approve cost, close the browser, return, review takes, regenerate safely, and download the exact paid output; provider failure releases the correct credits.

### P2 — Quality, continuity, and African creative workflows

**Objective:** make outputs distinctive, repeatable, and culturally grounded.

- Rich character/location/wardrobe/voice guides.
- Reference packs and continuity scoring.
- Reusable 2D character rigs or layered assets.
- Nigerian comedy and culture-specific folktale template packs.
- Native-speaker/cultural review pipeline.
- Sound effects, music licensing, pronunciation, and dubbing foundations.
- Quality evaluation dashboard and release thresholds.

**Acceptance:** recurring characters and branded elements survive multiple shots; priority-language audio passes native review; evaluation scores and rejection reasons are recorded.

### P3 — Paid launch and operations

**Objective:** safely serve real customers and real money.

- Bachs sandbox contract suite and production merchant approval.
- Checkout-ID-based webhook reconciliation.
- Refund/dispute/underpayment policies.
- Real admin operations, audit logs, alerts, and runbooks.
- Load, security, accessibility, and recovery testing.
- Staged rollout with spend and queue limits.

**Acceptance:** every payment is reconciled once; every credit movement is auditable; on-call staff can diagnose and safely replay failures; rollback does not alter completed credit/payment records.

### P4 — Cinematic and long-form beta

**Objective:** expand beyond short-form without sacrificing control.

- Dialogue and performance pipelines.
- Coverage planning and longer story structures.
- Continuation across sequences and episodes.
- Video-to-video/VFX, advanced sound mix, and color finish.
- Human editorial checkpoints and long-running workflow orchestration.

**Acceptance:** a multi-scene cinematic production can be resumed, versioned, costed, reviewed, and exported without continuity or accounting loss.

---

## 18. Production launch gate

FinalFrame is ready for a controlled paid launch only when all of the following are true:

- One verified identity authority protects every user and admin operation.
- No production path contains mock/sample/placeholder success media.
- Generated media is ingested into controlled storage with provenance and checksums.
- Jobs survive browser closure, server restart, deploy, timeout, and transient provider failure.
- Idempotency prevents duplicate generation and duplicate charging.
- Estimates, reservations, actual costs, commits, releases, purchases, and refunds reconcile.
- A real video is assembled, mixed, probed, stored, reviewed, and downloadable.
- Bachs sandbox contract tests pass, then production merchant behavior is verified.
- Safety, voice/likeness consent, copyright, privacy, refund, and retention policies are published and enforced.
- Admin can find and recover stuck jobs and unmatched payments without direct database editing.
- Automated tests cover authorization, money, provider failure, assembly ordering, and review/export.
- Staging and production have alerts, spend limits, rollback, backup, and incident runbooks.
- The launch evaluation set meets approved quality thresholds for the three initial workflows.

Until those conditions are met, the accurate product status is **private alpha / production-system build**, not production-ready.

---

## 19. Official sources verified during this audit

### OpenRouter

- [Structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs)
- [Multimodal overview](https://openrouter.ai/docs/guides/overview/multimodal/overview)
- [Models and model metadata](https://openrouter.ai/docs/guides/overview/models)

### Runway

- [Available models](https://docs.dev.runwayml.com/guides/models/)
- [Using the API](https://docs.dev.runwayml.com/guides/using-the-api/)
- [API reference](https://docs.dev.runwayml.com/api/)
- [Pricing](https://docs.dev.runwayml.com/guides/pricing/)
- [Usage tiers and limits](https://docs.dev.runwayml.com/usage/tiers/)
- [API changelog](https://docs.dev.runwayml.com/api-details/api_changelog/)
- [Asset input requirements](https://docs.dev.runwayml.com/assets/inputs/)

### Convex

- [Authentication overview](https://docs.convex.dev/auth/overview)
- [Convex Auth status](https://docs.convex.dev/auth/convex-auth)
- [Actions](https://docs.convex.dev/functions/actions)
- [Scheduled functions](https://docs.convex.dev/scheduling/scheduled-functions)
- [File storage security model](https://docs.convex.dev/file-storage/overview)
- [Storing generated files](https://docs.convex.dev/file-storage/store-files)

### Bachs

- [Bachs introduction and quickstart](https://docs.bachs.io/introduction)
- [Authentication](https://docs.bachs.io/authentication)
- [Sandbox environment](https://docs.bachs.io/integrate/sandbox)
- [Checkout sessions](https://docs.bachs.io/guides/checkout/checkout-sessions)
- [Webhook signatures and events](https://docs.bachs.io/guides/webhooks/overview)
- [Local currency pricing](https://docs.bachs.io/guides/products/local-pricing)
- [Supported currencies](https://docs.bachs.io/for-you/supported-currencies)

### Audio and deterministic rendering

- [ElevenLabs API capabilities](https://elevenlabs.io/api)
- [ElevenLabs text to speech](https://elevenlabs.io/docs/overview/capabilities/text-to-speech)
- [ElevenLabs sound effects](https://elevenlabs.io/docs/overview/capabilities/sound-effects)
- [Remotion](https://www.remotion.dev/)
- [FFmpeg documentation](https://www.ffmpeg.org/documentation.html)

---

## 20. Immediate next planning prompt

After the owner answers the ten decisions in Section 16, the next implementation-planning pass should be limited to **P0 and P1**. It should produce file-level tasks, Convex schema/function changes, identity migration steps, provider contracts, renderer deployment, tests, rollout, and rollback. It should not combine cinematic long-form, every provider, payments, and the entire redesign into one implementation pass.

