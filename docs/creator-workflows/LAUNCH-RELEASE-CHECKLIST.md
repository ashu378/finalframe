# Whole-product release checklist

Status: IN PROGRESS. Owner approved full implementation; email/auth-email recovery and payments are **last**, with their activation disabled until that checkpoint. No launch certification is implied by a passing mock, UI presence, or catalog entry.

Each row requires code revision, unit/contracts, online integration, browser evidence, paid receipt where applicable, saved output, and independent creative review. Record unavailable evidence as blocked, never passed. Preserve historic evidence and errors.

| ID | Required deliverable | Named acceptance | State |
|---|---|---|---|
| A01 | Shared contracts and complete route/action inventory | release-inventory | Implementing |
| B01 | All six entry modes retain selection; eight authored templates create independent projects; presets work | template-project-contract | Implementing |
| B02 | Paginated projects, search, lifecycle/archive/restore; no history loss | online-project-library | Online backend and browser fixture lifecycle passed (rename/search/archive/soft-delete/restore); broad pagination/mobile matrix pending |
| B03 | Profile, data export, recoverable deletion request, safe legacy routes | account-lifecycle | Actual online Auth lifecycle6 and33-part owner index browser downloads passed; remaining account browser matrix pending |
| B04 | Studio/team/project roles and complete invitation acceptance | online-team-permissions | Actual online Auth invitation/expiry/revoke/handoff/removal/cleanup passed; link-based browser journeys pending, invitation email delivery last |
| B05 | Separate platform admin, real moderation and audit/actions | online-platform-admin | Backend verified online; selected owner ADMIN granted in development; full browser matrix pending |
| B06 | Public/contact/policy/navigation, responsive and accessible states | all-routes-browser | Pending; policy publication owner approval |
| C01 | Streaming uploads, bounded requests, persistent callback outbox, lease heartbeat | renderer-transfer-recovery | Implemented/deployed; completed replay survived two container replacements; expired upload-capability renewal remains bounded |
| C02 | Lossless timeline/manifest roundtrip, compatible v4/v5 rollout | manifest-roundtrip | Pending |
| D01 | Caption authoring, burn-in, SRT/VTT, scope rebasing | caption-frame-acceptance | Pending |
| D02 | Cut/dissolve/fade/wipe/slide with explicit duration and audio semantics | transition-frame-acceptance | Pending |
| D03 | Automatic beats, editable confidence-bound beat map, apply as new timeline | beat-analysis-acceptance | Real online worker/manual correction/new timeline/12s PCM render and ordinary browser download passed; full music/tempo corpus still pending |
| D04 | Native/recorded/dialogue/music/SFX audio mixing and source extraction | audio-content-acceptance | Partial; retained short fixtures |
| D05 | Exact titles/logos/UI/CTA/charts/explainer templates | graphics-content-acceptance | Partial; retained title/UI fixtures |
| E01 | Correct lip-sync/extension/upscale public controls and canonical validation | operation-input-contract | Implementing |
| E02 | Human hairstyle, appearance, masked edit, car/object choreography | live-edit-capabilities | Partial; object edit tested, human/masks unverified |
| E03 | Performance transfer and supplied-audio lip sync | live-performance-lipsync | Pending |
| E04 | Reusable consented voice/reference synthesis, revocation and lifecycle | live-personal-voice | Pending; consented source and certified route |
| E05 | Accepted-job continuation and actual upscale | live-extension-upscale | Pending |
| F01 | Eight complete prompt-to-download recipes through ordinary UI | eight-recipes-browser | Partial; nineteen retained technical exports |
| F02 | Cross-session episodes, exact continuity and immutable approved scenes | episodic-story-acceptance | Partial; online contracts and two-scene character fixture |
| F03 | Movie versions, ordered scene/chapter exports, chunk recovery and 30-minute assembly | movie-fixture-acceptance | Small cloud24s review/delivery/browser download passed; local30min fixture passed; real cloud30min pending |
| Q01 | Missing keys/models, throttling/timeouts/balance, duplicates/uncertain acceptance, spend limits | provider-failure-matrix | Existing contracts; new operations need coverage |
| Q02 | Every public/auth/creator/admin/API/legacy/error/loading route and displayed action | all-routes-browser | Pending |
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
