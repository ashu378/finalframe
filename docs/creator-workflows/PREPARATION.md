# Project media preparation

Preparation uses the existing `generationJobs`, canonical product-credit reservation, provider-budget reservation, lease, submission fence, and settlement paths. It does not create payments, a separate queue, or a second planning authority.

## Routes

| Preparation | Current central model setting | Output |
| --- | --- | --- |
| Reference image | `OPENROUTER_REFERENCE_IMAGE_MODEL` | One 1K project image, pending human review |
| Stock narration / voice preview | `OPENROUTER_NARRATION_MODEL` | Project audio using an approved project voice |
| Consented reference synthesis | `OPENROUTER_REFERENCE_VOICE_MODEL` | Project audio; current consent and approved project recordings rechecked before submission |
| Transcription | `OPENROUTER_PREPARATION_STT_MODEL` | Durable transcript linked to the project recording and production |

Model IDs and billing certificates live in `src/lib/ai/model-registry.ts`. Arbitrary replacements require review of billing units. All quotes use current public OpenRouter catalog endpoints; unknown pricing fails closed. An image quote covers one 1K output at the most expensive eligible endpoint. Speech reserves the maximum eligible character rate. Reference synthesis reserves the documented 120-second hard maximum at the maximum endpoint rate; the live catalog must still state that bound and every endpoint must support cloning. Transcription first measures the actual stored audio using the authenticated renderer probe, limits it to 60 seconds and 15 MiB, and rounds duration up for reservation.

An uploaded `RECORDED` voice is used directly in a timeline. It never implicitly grants permission to clone a voice. Stock voices must use the enabled provider. No private reference URLs or provider voice IDs are returned by the preparation UI.

## Activation

Both `FINALFRAME_GENERATION_WORKER_ENABLED=true` and `FINALFRAME_PREPARATION_ENABLED=true` are required. Keep them disabled until the changed renderer is deployed, media probes work, server-side provider credentials are installed, and an administrator has configured the allowed studio and capped test budget. The same global USD ceiling covers preparation and video jobs. Unknown accepted provider costs keep funds reserved for reconciliation.

All paid adapter POSTs require a durable `beforeMediaSubmit` fence, except explicit mock transports. Legacy direct engine calls cannot purchase media without this authority. Paid synchronous preparation requests are not automatically retried after an uncertain acknowledgement. An administrator must reconcile them; buying replacement output silently is forbidden.

## Verification

- `node tests/generation/run-preparation-contracts.cjs`: seven no-cost quote and capability tests.
- `pnpm test:generation`: transport guards, no POST on missing or rejected reservation, one paid POST despite retry/fallback settings; injected transports only.
- `pnpm test:generation-worker`: lease, recovery, public projections, technical video policy, authority, and persisted progress contracts.
- `preparationVerification:run`: internal, private-key guarded online-development transaction harness. Verifies non-shot transcript completion, source relationship, duplicate completion and single settlement using isolated synthetic records; calls no provider.
- `generationWorkerVerification:run`: online-development concurrency, ambiguity, expiry, current-route revalidation and credit/budget recovery checks.

Fixture cleanup closes synthetic budgets at zero, settles unused reservations, cancels unused fixture jobs and soft-deletes fixture projects while retaining evidence. It never removes customer records.

## Still requires paid acceptance

The online fixture proves database behavior, not model quality or successful speech/image generation. Reference likeness, pronunciation, transcription accuracy, generated audio validity, and visual quality require the separately approved capped paid samples. Generated preparation media remains pending human review. A synchronous response lost after provider acceptance can require manual reconciliation; it is not automatically purchased again.

## Stock voice selection

The project voice panel now loads the current narration model's `supported_voices` from OpenRouter's public `GET /api/v1/models?output_modalities=speech` catalog. Model selection remains central in `PREPARATION_MODELS.narration`.

The browser receives opaque selection keys and preset labels. Saving re-fetches the live catalog, rejects invented or removed selections, authorizes the project role, and writes a project-owned `STOCK` profile with private provider identity and catalog/model evidence. No speech is generated. The voice becomes `READY` but its resource state remains `DRAFT`: review and approval are required before synthesis. Approved or locked profiles cannot be rebound; revoked profiles cannot be reused. Changing the configured narration model invalidates incompatible saved bindings rather than choosing another voice silently.

At synthesis time the selected preset must still appear in the current model catalog before the paid reservation fence. Tests cover malformed catalogs and retired voice selections. The actual sound, accent, and pronunciation remain subject to the capped paid acceptance sample.

Additional verification:

- `node tests/voice/run-stock-voice-contracts.cjs` — public catalog projection, stable selection keys, missing/removed voices, malformed catalogs.
- `node tests/voice/run-online-stock-voices.mjs` — live catalog GET and project binding, idempotency, privacy, cross-project denial, approval/lock, and revocation guards. Database records stay on online Convex; fixture projects are soft-deleted after verification.
