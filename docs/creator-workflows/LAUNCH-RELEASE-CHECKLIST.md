# Whole-product release checklist

Status: IN PROGRESS. Owner approved full implementation; email/auth-email recovery and payments are **last**, with their activation disabled until that checkpoint. No launch certification is implied by a passing mock, UI presence, or catalog entry.

Each row requires code revision, unit/contracts, online integration, browser evidence, paid receipt where applicable, saved output, and independent creative review. Record unavailable evidence as blocked, never passed. Preserve historic evidence and errors.

| ID | Required deliverable | Named acceptance | State |
|---|---|---|---|
| A01 | Shared contracts and complete route/action inventory | release-inventory | Implementing |
| B01 | All six entry modes retain selection; eight authored templates create independent projects; presets work | template-project-contract | Passed six browser entry selections, all eight ordinary template creation/default journeys and online canonical owner/explicit membership readback; preset persistence/restoration passed. This is project setup, not eight finished video recipes. |
| B02 | Paginated projects, search, lifecycle/archive/restore; no history loss | online-project-library | Online backend and browser fixture lifecycle passed (rename/search/archive/soft-delete/restore); broad pagination/mobile matrix pending |
| B03 | Profile, data export, recoverable deletion request, safe legacy routes | account-lifecycle | Actual online Auth lifecycle6 and33-part owner index browser downloads passed; remaining account browser matrix pending |
| B04 | Studio/team/project roles and complete invitation acceptance | online-team-permissions | Actual online Auth invitation/expiry/revoke/handoff/removal/cleanup passed; link-based browser journeys pending, invitation email delivery last |
| B05 | Separate platform admin, real moderation and audit/actions | online-platform-admin | Backend verified online; selected owner ADMIN granted in development; full browser matrix pending |
| B06 | Public/contact/policy/navigation, responsive and accessible states | all-routes-browser | Pending; policy publication owner approval |
| C01 | Streaming uploads, bounded requests, persistent callback outbox, lease heartbeat | renderer-transfer-recovery | Implemented/deployed; completed replay survived two container replacements; expired upload-capability renewal remains bounded |
| C02 | Lossless timeline/manifest roundtrip, compatible v4/v5 rollout | manifest-roundtrip | Audio/poster roundtrip and dispatch-actor regression suites passed; online new-edit acceptance pending |
| D01 | Caption authoring, burn-in, SRT/VTT, scope rebasing | caption-frame-acceptance | Actual local three-codec caption positions/cue boundaries and SRT/VTT timing/text passed; ordinary Preview caption/dissolve editing through approved locked timeline, asynchronous completed MP4 and exact SRT/VTT downloads passed; full scope matrix pending |
| D02 | Cut/dissolve/fade/wipe/slide with explicit duration and audio semantics | transition-frame-acceptance | Actual local five-transition pixel/audio atlas passed H264/AAC, VP9/Opus and ProRes/PCM; ordinary Preview half-second dissolve authoring-to-download passed; broader online transition/source matrix pending |
| D03 | Automatic beats, editable confidence-bound beat map, apply as new timeline | beat-analysis-acceptance | Real online worker/manual correction/new timeline/12s PCM render and ordinary browser download passed; full music/tempo corpus still pending |
| D04 | Native/recorded/dialogue/music/SFX audio mixing and source extraction | audio-content-acceptance | Mixing fixtures verified; actual online exact-window extraction and deployed Preview form/repeated-intent completion passed; generated SFX completed once through ordinary Preview controls with3.030s downloaded MP3 and$0.0075 receipt; full audio/listening corpus pending |
| D05 | Exact titles/logos/UI/CTA/charts/explainer templates | graphics-content-acceptance | Three new templates passed actual online authoring/edit/lock/export replay, downloaded frames and retained certificate/APPLIED receipt; seven-template full browser/format matrix pending |
| E01 | Correct lip-sync/extension/upscale public controls and canonical validation | operation-input-contract | Implementing |
| E02 | Human hairstyle, appearance, masked edit, car/object choreography | live-edit-capabilities | Partial; object edit tested, human/masks unverified |
| E03 | Performance transfer and supplied-audio lip sync | live-performance-lipsync | Supplied-audio Avatar completed/downloaded once, actual $0.196416, audio correlation/alignment checked; subjective lip-sync and performance transfer acceptance pending |
| E04 | Reusable consented voice/reference synthesis, revocation and lifecycle | live-personal-voice | Pending; consented source and certified route |
| E05 | Accepted-job continuation and actual upscale | live-extension-upscale | Upscale completed/downloaded once, actual $0.03234,854×480→1280×720; one extra video frame recorded, content review and continuation pending |
| F01 | Eight complete prompt-to-download recipes through ordinary UI | eight-recipes-browser | Partial; nineteen retained technical exports |
| F02 | Cross-session episodes, exact continuity and immutable approved scenes | episodic-story-acceptance | Partial; online contracts and two-scene character fixture |
| F03 | Movie versions, ordered scene/chapter exports, chunk recovery and 30-minute assembly | movie-fixture-acceptance | Real cloud30min/43,200frame repeated-fixture review+delivery completed; full download/SHA,60frame hashes,30audio windows/mappings and captions passed; live interruption not observed, creative movies pending |
| Q01 | Missing keys/models, throttling/timeouts/balance, duplicates/uncertain acceptance, spend limits | provider-failure-matrix | Existing contracts; new operations need coverage |
| Q02 | Every public/auth/creator/admin/API/legacy/error/loading route and displayed action | all-routes-browser | Desktop owner-session read-only review covered61 non-payment routes with no captured console warnings/errors; mutations/mobile/other-role matrix pending; misleading finishing-reset controls repaired with deliberate per-job retry |
| Q03 | Real outputs reviewed for identity/action/dialogue/lip sync/readability/audio/pacing >=4/5 each | creative-output-review | Pending; no inferred artistic approval |
| Z01 | Signup OTP, recovery, resend/attempt limits, real sending/inbox delivery | online-auth-email | LAST; provider credentials/domain required |
| Z02 | Payment pages accurately disabled; no live checkout/charge | billing-disabled-browser | LAST; remains disabled under current authorization |
| R01 | Backups, additive readers-before-writers, FinalFrame-only deployment, production safe smoke and rollback | production-release | Pending; all required gates above |

## Runtime limits and proof

- Use online Convex only for database-backed verification. Pure tests use no database.
- Spend authority: minimum of live application allowance, provider allowance and $15 cumulative ceiling; application working cap remains $10. Keep unknown holds. No accepted purchase retry or budget reset.
- Renderer/analysis jobs initially serial; retain server limits and never touch Yafpay resources.
- All route capability claims require current controls, billing units and pricing bounds. An unavailable required OpenRouter route blocks its release entry.
- Retained fixture results are in `/home/ashuboris/.codex/artifacts/finalframe/launch-verification-2026-11-02/RESULTS.md`; latest historical verification is `LAUNCH-VERIFICATION-2026-11-02.md`.

## Current checkpoint

Detailed implementation and verified limits: [2 November checkpoint](LAUNCH-COMPLETION-CHECKPOINT-2026-11-02.md). Personal voice/performance fixtures are absent; use synthetic fixtures without claiming personal likeness acceptance.

Second integration checkpoint: [account, operation certificates, beat analysis and precise finishing](LAUNCH-COMPLETION-CHECKPOINT-2-2026-11-02.md). Development v5 reader-to-browser fixture passed; the measured AAC overrun was repaired locally and requires the new worker rollout.

Third integration checkpoint: [team, precise PCM finishing and immutable movie review/delivery](LAUNCH-COMPLETION-CHECKPOINT-3-2026-11-02.md). Small cloud movie proof is `movie-small/TECHNICAL-ACCEPTANCE.json`:24s/720frames, two explicitly repeated retained components,46 measured audio attacks below0.2ms, exact-version review and ordinary Preview delivery/download. No creative-story or whole-product certification is implied. Current development provider spend remains $4.697460633 plus retained uncertainty; no paid calls in these fixture checks.

Sixth checkpoint: [recovery, project media and actual finishing proofs](LAUNCH-COMPLETION-CHECKPOINT-6-2026-11-03.md). Source-only recipe and three exact graphics completed online without AI spending; original paid portrait recovered without repurchase. These technical proofs do not certify eight creative launch recipes.

Seventh checkpoint: [deliberate finishing recovery and model-version reviews](LAUNCH-COMPLETION-CHECKPOINT-7-2026-11-03.md). Exact job/production retry controls and BFL version fingerprints have focused regressions. New FLUX source, supplied-audio Avatar and upscale completed once with verified receipts; cumulative provider usage measured $5.958215632, with unknown holds retained. Source extraction also completed through the deployed Preview form. Current/historical production association and the broader launch gates remain open.

Eighth checkpoint: [exact-version finishing and production selection](LAUNCH-COMPLETION-CHECKPOINT-8-2026-11-03.md). Current production progress no longer inherits old-version completion; historical downloads remain deliberate and read-only. Three-codec caption/transition/audio fixtures passed unchanged media oracles. Continuation was rejected before an accepted job ID, with unchanged provider usage and released reservation; diagnosis remains open, without a blind repurchase.

Ninth checkpoint: [controlled SFX and mobile dashboard](LAUNCH-COMPLETION-CHECKPOINT-9-2026-11-03.md). Sound effects now have a reviewed opt-in request/ceiling, private checkpoint and bounded decoded QC; initial live SFX proof remains open. Real continuation transport tests do not establish the prior live rejection cause. The390px dashboard overflow is locally repaired; broad mobile mutation/role coverage remains open.

Tenth checkpoint: [current-version editor and private diagnostics](LAUNCH-COMPLETION-CHECKPOINT-10-2026-11-03.md). Frozen integration and independent review passed. Sound effects completed through the deployed ordinary Preview controls with a verified receipt and saved MP3; listening review remains open. New current-edit and diagnostic deployment/online checks follow.

Eleventh checkpoint: [editing feedback and operation limits](LAUNCH-COMPLETION-CHECKPOINT-11-2026-11-03.md). Actual current-version ordinary browser caption/dissolve authoring reached a verified asynchronous export and matching SRT/VTT downloads. The approval-list refresh and explicit control labels are repaired in source; post-deployment verification is recorded separately. Continuation-specific duration bounds narrow the generic catalog, but the five-second HTTP400 remains unexplained; no blind third purchase. Latest aggregate provider usage$5.965715632, with unknown holds retained.

Twelfth checkpoint: [truthful project cards and reviewed recipe evidence](LAUNCH-COMPLETION-CHECKPOINT-12-2026-11-03.md). Dashboard/library project lifecycle is no longer presented as episode production progress. Actual checkpoint11 editor refresh, mobile clip interaction, logout/protected redirect/re-login and six entry selections passed. Independent visual review found three failed historical sample outcomes; those failures remain recorded, and short technical fixtures do not certify the eight finished recipes.

Thirteenth checkpoint: [approved-plan recipe authoring and deliberate project-media reuse](LAUNCH-COMPLETION-CHECKPOINT-13-2026-11-03.md). Existing approved projects can add separately versioned execution instructions without rewriting approved shots. Explicit approved-media selection uses the existing scoped SOURCE_RANGE contract; no automatic generation fallback. Independent contracts and TypeScript passed; deployed online/browser acceptance follows. Corrected SaaS Assembly v2 now shows a verified completed download in the ordinary Preview Review page.
