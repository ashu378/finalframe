# FinalFrame creator workflow implementation

Approved scope: all eight video types, appearance/hairstyle edits, object/car transformations, performance-driven video, recorded audio, consented reference voice synthesis, lip sync, and episodic stories. OpenRouter first. Current authorization (2 November 2026): **US$10 working budget, US$15 absolute ceiling across every paid capability and retry**. The owner’s newer instruction replaces the earlier US$40 allowance. Launch is acceptance-gated; it is not promised for a calendar date.

## Non-negotiable ownership

- Work only on FinalFrame. Never modify Yafpay or other hosted projects.
- Convex online development deployment: `knowing-snail-785`. Do not run a local database.
- Canonical planning: `convex/productions.ts` and `productionVersions`; legacy planning remains read-only.
- Draft versions may change; approved versions are immutable snapshots. Revisions create versions.
- Project CRUD owns lifecycle/membership. `approvals.ts` and `resourceStates.ts` own resource approval/locking.
- Every reference must belong to the project; globals require explicit import.
- Preserve approved takes and soft-deleted project data.
- Billing and email remain disabled. No production deployment or funded provider test is implied by a development deployment.

## Current implementation pass

### Implemented and verified foundations

- Internal generation worker authority, persisted leases and a pre-submit fence.
- Scheduler-driven submission/poll/ingest recovery; accepted provider IDs are resumed, never blindly resubmitted.
- Atomic generation job, product-credit reservation, and provider-dollar reservation.
- Distinct provider-budget ledger with a total US$15 absolute test ceiling; unknown accepted costs keep funds reserved.
- Authenticated bounded provider downloads into Convex Storage.
- Renderer media probe with an exact Convex Storage host allowlist and bounded file size/time.
- Technical checks separated from human visual approval; no automatic visual QC pass from a nonempty file.
- Safe job projections and persisted progress instead of simulated progress.
- Typed media references and operation-specific routing reviews; exact selected model retained through catalog discovery.
- Explicit admin capability review, invalidated when catalog capabilities change.
- Project-scoped voice samples, consent, approval, private synthesis resolution, and revocation checks.
- Explicit episode/production selection; stable project resource versions and continuity bible snapshots.
- Canonical planning consumes explicitly approved bible snapshots and predecessor story state; blank-bible creation is deliberate and idempotent.
- Generation snapshots continuity and sends references only for explicitly selected resource versions or selected asset bindings.
- Immutable accepted story facts tied to the approved production version and timeline; later episodes marked stale after earlier story revisions.
- An additive ownership migration requiring matching recorded creator and studio owner; ambiguous rows are not assigned automatically.

### Additional work now implemented

- Creator resource/bible management, voice recording/consent/revocation, live stock-voice selection, shot reference/operation controls, episode story approval and mobile layouts.
- Shared durable preparation jobs for image references, narration and transcription, with current consent and server-verified pricing bounds.
- Authenticated budgeted text planning with exact transport receipts and no ambiguous paid retries; old generation mutation bypass disabled.
- Durable renderer dispatch/retry/callback recovery and safe asynchronous export state.
- Explicit first-timeline authoring from approved takes, project uploads, deterministic graphics/exact logos and uploaded audio; canonical resource locking and version binding before manifest v4.
- Scoped hashed client review links, expiry/revocation, comments and review-only decisions; authenticated review/export controls.

### Remaining acceptance and release work

The detailed current checkpoint, migration risks and unverified workflow edges are in [CONTINUATION-2026-11-02.md](./CONTINUATION-2026-11-02.md). Paid output quality, a genuine owner-run renderer/export/download, completed-video client review, accepted-job extension selection, richer composition, long-form merging and the FinalFrame-only production release remain outstanding. A development deployment and no-cost transaction checks are not a production launch.

## Dependency order

1. Baseline, private backup, shared contracts and additive schema.
2. Durable jobs, credit/budget transactions, authentication and probe contracts.
3. Verified provider operations and project continuity (parallel after contracts freeze).
4. Planning/context integration, preparation jobs, composition and real workspace controls.
5. Review/export recovery and online fixture verification.
6. Provider key/spend setup, controlled paid acceptance, FinalFrame-only release.

## Parallel agent rules

Coordinator owns shared schema, generated files, financial authority, migrations, canonical integration and deployments. At most three additional agents own separate provider, job, and continuity lanes. Agents propose shared schema changes to the coordinator. No agent independently deploys or spends provider funds. After integration, separate UI/composition/verification work into a second wave.

## Verification and funding

No-cost: isolation, explicit global imports, immutable approved snapshots, lock enforcement, regeneration versions, project restore, episode selection, stale continuity, consent/revocation, concurrent claims, ambiguous submissions, download recovery, callback security and asynchronous exports. Database-backed checks must use online Convex. Pure transport/policy tests use mocks and create no database.

Paid allowance: keep the active backend budget at **US$10**, with the provider key capped at **US$15**. The deployment rejects aggregate configured test allowances above US$15. Start with one four-second clip and check the provider receipt before buying another capability. All failed requests, uncertain submissions and retests count toward the same run; retain uncertain-cost holds. Never reset the budget by creating a new run key.

The reduced budget does not promise one paid sample for every advertised capability. Reuse real generated clips for no-cost relationship/preview checks and report any capability whose paid estimate does not fit.
Use short 4–8 second clips, one paid job at a time initially, live prices and conservative bounds. A capped provider key is the external backstop. No automatic top-up, provider purchase, live billing, full AI movie test, or unrelated service cleanup. If estimates exceed remaining funds, report the unverified acceptance requirement.

Owner test media: authorized performance recording, portrait/reference, clear voice sample with consent, desired product/car reference, logo/screenshot, and licensed music. Enter keys through secure provider/deployment settings, never chat or repository files.

## Rollback

Pause worker and paid execution flags before a rollback. Preserve accepted provider IDs and budget holds. Do not restart an accepted request as a fresh paid call. Retain migrated records and approved versions. Roll back only FinalFrame deploys; keep compatibility reads. Permanent deletion remains unavailable.
