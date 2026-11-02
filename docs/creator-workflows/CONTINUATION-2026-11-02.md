# FinalFrame implementation checkpoint — 2 November 2026

This checkpoint uses the online FinalFrame development deployment, `knowing-snail-785`. It does not deploy to the production Convex deployment, Vercel production, or Coolify, and does not claim an actual rendered video or paid provider acceptance. Yafpay and all other projects remain outside scope.

## Changes made

### Canonical production authoring

- Draft plans materialize an editable sequence/scene/shot graph. Approval freezes the actual edited graph, selected resource versions and continuity context into `productionVersions`.
- Plan creation and approval enforce project-owned reference assets, bounded episodes, current continuity and immutable approved versions.
- The project library can be approved and reused across productions in the same project. `assets.productionId` records origin; it does not replace project ownership. Unimported global and foreign-project assets remain prohibited.
- A real initial timeline composer replaces the fixture-hidden dependency loop between timelines and manifests. Its ordered selection can contain approved takes, uploaded videos/images, deterministic title/brand/feature/end cards with exact project logos, and approved uploaded audio.
- New draft timelines bind to the exact current approved production version, reserve no provider funds, and are idempotent. Resource approval and locking precede canonical manifest v4 assembly. Outdated version bindings fail closed.
- Manifest output preserves selected audio volume and trim offsets. Editor display converts between decibels and the renderer's linear volume convention.

### Creator workspace

Project resources and immutable versions, approved continuity bibles, deliberate shot resource bindings, explicit editing/frame/reference/audio controls, saved takes, original recordings, consented voice profiles, approval/locking/revision controls, and accepted episode story facts have real backend actions. Mobile controls are included. A generated asset or queued job is never presented as a finished export.

Stock voice selection uses current public OpenRouter catalog discovery, opaque selection keys, server-side provider identifiers and a model certificate. A selected stock voice still requires project approval. Revoked or unconfigured voices cannot pass approval or synthesis preparation.

### Durable jobs and spending

- Video and preparation jobs share the existing generation job, lease, credit reservation and provider-budget architecture.
- Image reference, transcription, stock speech and reference-voice preparation have explicit capability and pricing checks; unknown billing contracts fail closed.
- All non-mocked paid adapter submissions require a reservation fence. Ambiguous accepted submissions are held for reconciliation and cannot be automatically purchased again.
- Text planning now runs in authenticated Convex actions. It selects a catalog-eligible configured model before reserving funds, uses bounded text/output and provider price ceilings, records the actual model/request/usage/cost receipt, and never automatically retries a paid POST.
- The text transport receipt is not a second planning path. `productions.ts` remains the only active plan/blueprint approval authority.
- The old `secureJobs.ts` generation mutators are read-only compatibility errors. They cannot bypass worker settlement or manufacture an output.
- Total approved paid testing remains US$40 across every paid capability and retry. Unknown charges retain their budget hold. The external capped provider credential remains a necessary backstop.

### Renderer and review

Convex owns durable renderer dispatch, exact frozen retry payloads, leases, per-attempt callback keys, retries, bounded concurrency and asynchronous export status. Signed callbacks validate timestamp, lease, attempt, payload, job/project and replay receipts. Stored output must exist before a download is exposed.

The renderer's authenticated media probe measures actual video/audio streams from explicitly allowlisted Convex Storage URLs, with download/process bounds. No private network paths or arbitrary provider URLs are accepted.

Client review links use random bearer tokens stored only as SHA-256 hashes, exact completed export/manifest/timeline version scope, expiry, revocation, bounded timestamp comments, and review-only approval/revision events. A public review decision cannot approve a production or unlock a timeline. The release screen can request version review and queue an asynchronous export.

## Verification boundaries

Database-backed integration uses online Convex only. Contract/policy/transport tests use mocks without starting a database. Browser checks use the local frontend connected to online Convex. The legacy fixture reset now delegates to canonical project soft deletion, and repeating a soft deletion is idempotent. Test projects are soft-deleted and their evidence retained; temporary arithmetic budgets are removed or closed at zero and unused synthetic credit holds are released.

No paid inference or video generation was executed. No real MP4 render was submitted. A manifest, a synthetic callback transaction test, and a completed video are different acceptance requirements.

## Remaining before funded testing and launch

1. Deploy this renderer revision through the separate FinalFrame Coolify resource, including authenticated audio probing and its exact Convex Storage host allowlist. Verify server resource limits without changing another project.
2. Install a fresh scoped/capped provider credential through secure environment settings, configure the explicitly allowed test studio and US$40 global budget, then enable only the capabilities being tested. Never paste credentials into chat or Git.
3. Verify one real short render/export with owner-controlled media and callback-to-download behavior. The owner performs MP4 rendering acceptance.
4. Run the approved paid matrix within the single ceiling: actual planning, image/audio/voice/lip-sync, eight video-type samples, appearance/object/performance operations, and controlled retries. Catalog discovery and transaction tests do not prove output quality or speaker/character consistency.
5. Run valid-link client review/comment/decision acceptance against a genuine completed export. No completed renderer output is fabricated to make these tests pass.
6. Finish remaining workflow edges honestly: accepted-job extension selection, long-form/cross-version deliberate reuse and merging, richer exact chart/product compositions, full selected-scene soundtrack rebasing, and durable/manual recovery for a lost synchronous image/audio response. Do not advertise an unsupported operation.
7. Publish reviewed FinalFrame frontend/backend/renderer revisions to their verified targets and repeat authenticated/public smoke checks before launch. Current worktree changes remain available for review; a development Convex push is not a GitHub or production release.

## Migration and rollback

All new schema fields are optional on existing tables; new tables/indexes are additive. Existing assets, approved versions, legacy planning records and exports are retained. Unbound historical timelines require an explicit new version or safe migration; they are not silently assigned to a current production. Stock profiles missing a current narration-model certificate must be deliberately reselected, not silently rewritten. Keep worker/preparation/paid-run flags off for rollback, preserve accepted provider IDs and unknown-charge holds, and retain callback receipts and audit records.

## Verification results for this checkpoint

| Online suite | Passed checks | What it establishes |
| --- | ---: | --- |
| Episodes, ownership and real initial composition | 28 | Explicit bindings, immutable approval, project library reuse, authored timeline and manifest |
| Descendant project access | 9 | Owner allowed and same-studio project nonmember denied, using CLI test identities |
| Voice lifecycle | 14 | Samples, consent, approval/lock, private projections and revocation |
| Live stock-voice discovery and project binding | 8 | Catalog GET, selection validation, isolation, approval and revocation; no speech purchase |
| Durable generation worker | 19 | Concurrency, leases, fencing, ambiguity, settlement and recovery |
| Preparation transactions | 6 | Existing job/credit/budget authority and durable transcript relationship |
| Renderer orchestration and callback guards | 24 | Includes two real callback HTTP authentication checks; no renderer execution |
| Provider budget arithmetic | 6 | Aggregate cap, idempotency and conservative unknown-cost holds |
| Paid text access guards | 5 | Authentication, paused budget, internal reservation privacy and no planning writes |
| Media probe | 5 | Real FFprobe of online stored video/audio, authentication and URL restrictions |
| Login/dashboard/logout | 5 | Local frontend with online auth; no email verification needed |
| Creator workspace browser | 5 | Actual reference, voice and shot controls plus mobile bounds |
| Read-only composed editor browser | 3 | Desktop/mobile clips, no hydration/runtime/duplicate-key errors, no horizontal overflow |
| Client review denial/scope checks | 9 | Anonymous/invalid tokens and unfinished exports cannot grant review access |
| Project lifecycle/retention | 6 | Idempotent deletion, restore, descendants retained and retention-only fixture reset |

These are distinct acceptance checks, not a claim that all production video workflows have passed. The extended browser write-through composition test saved a real four-second timeline but later encountered workstation-to-cloud HTTP timeouts; its remaining browser assertions are not marked passed. The separate 28-check cloud composition suite and three read-only browser checks passed.

Typecheck, lint, Next production build (44 static pages), renderer build/contracts, planning, financial, video-routing, generation, approval/state, callback, stock/preparation policy and timeline projection tests passed. Pure test modules do not start a local database. Existing callback/approval test loaders were updated to load the new production guards instead of bypassing them.

## Access/configuration observed

- Coolify redirected the known FinalFrame environment URL to its login screen. No server resources were changed.
- The Vercel plugin returned `UNAUTHORIZED` and requires reauthentication. The authorized GitHub browser sign-in attempt did not advance beyond the login screen. No frontend deployment was claimed.
- Online Convex generation, preparation and renderer worker flags are false/unset; the paid-run key is unset. Email remains off.
- Online Convex has renderer URL/secret configured, but no `OPENROUTER_API_KEY`. Local credentials were not printed or committed. A fresh scoped/capped credential is required before funded acceptance.
- Local frontend remains available at `http://127.0.0.1:3000`, connected to online Convex. No Git commit/push or production release was made from this checkpoint.
