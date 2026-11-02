# Character reference result retention

The coordinator's sanitized live log showed `completePreparation` failed before writes because a value was 1.58 MiB, over Convex's 1 MiB document limit. `extractUsageAndCost` copied the entire image response into `NormalizedUsage.raw`; completion persisted that usage. The image was stored before the failed completion. This was a metadata persistence failure, not evidence of a provider timeout. No replacement request was made during diagnosis.

Normalization now returns numeric usage fields only. Polling, preparation completion and image/music checkpoints independently whitelist scalar usage at the database boundary. No response body, base64 image/audio, provider URL, arbitrary nested usage or secret is retained in usage metadata.

Character references use one fenced POST with no retry/fallback, a three-minute response deadline below the existing five-minute lease, a bounded 22 MiB wire body and 15 MiB raster image. A validated header receipt is saved before body reading. `X-Generation-Id` must have a bounded `gen-` format; bounded `X-Request-Id` is retained separately as correlation metadata, so it cannot conflict with a later SSE generation ID. Neither becomes `providerJobId`. Buffered images are captured after complete JSON; native image SSE captures only `image_generation.completed`, never previews. A missing DONE remains an incomplete transport outcome, but any already checkpointed final image is retained.

Completed PNG/JPEG/WebP bytes are stored privately and bound to the job/model/receipt/SHA/size/MIME in `response.imageOutput` before finalization. Finalization alone can retry, at most 24 times, without catalog calls, new POSTs or new attempt numbers. Lease expiry also resumes only the saved checkpoint. Changed storage proof denies promotion. New assets still require human review. An outcome with no final-byte checkpoint remains reconciliation-required; there is no invented image polling/retrieval endpoint.

## Manual recovery of a pre-checkpoint orphan

`imageOutputRecovery.reconcileStoredImageOutput` is an internal deployment-admin operation, using the same private CLI authorization model as accepted-submission reconciliation. It takes explicit job/storage IDs, expected SHA/bytes/storage creation time, original submission timestamp/attempt number, exact retained provider reservation amount, bounded reason/log reference/request ID, and the literal `FAILED_COMPLETION_LOG_AND_UNCLAIMED_STORAGE` attestation. An optional independently verified receipt ID is correlation only; no cost can be supplied here.

The handler verifies the current canonical project actor, production/studio relationships, image preparation/reconciliation state, exact retained hold/job/budget, original attempt's five-minute storage window, current Storage MIME/SHA/size, and no existing asset using the storage object (including another project's or deleted assets). One fixed storage-bound audit correlation prevents attachment to another job and permits exact replay. The audit explicitly records **operator log attestation**, not a claim that a timestamp proves provider origin. Older rows no longer retain their random lease ID; the original attempt timestamp bounds the issued lease window, while the operator's failed-completion log supplies attribution evidence. The operation does not download or inspect the image, grant approval, call a provider, or fabricate a receipt/cost. It schedules saved-byte finalization only. Unknown provider cost continues to retain the budget hold through existing provider-budget reconciliation semantics.

The coordinator must verify the private log/evidence before invoking this operation. No online invocation is part of the local test packet.

## No-cost checks

- `node tests/generation/run-image-recovery.cjs`: real adapter, worker and mutations with a >1 MiB synthetic image; scalar usage, header capture, SSE tails/bounds, private checkpoint, interrupted completion, one purchase, retained-output resume, rejection vs unknown outcome.
- `node tests/generation/run-image-reconciliation.cjs`: actual private repair handler; exact idempotency, current actor and foreign asset/ownership conflicts, byte/time/attempt/hold checks, unchanged unknown-cost hold.
- Existing generation and MUSIC transport/recovery suites remain required.

Official API references checked 2026-11-02:

- [Image API and native streaming](https://openrouter.ai/docs/guides/overview/multimodal/image-generation): buffered responses and completed image SSE events; Sourceful is not assumed to provide native streaming.
- [Generate an image](https://openrouter.ai/docs/api/api-reference/images/generate-an-image): non-streaming providers ignore `stream` and return a buffered response.
- [Streaming](https://openrouter.ai/docs/api_reference/streaming): response generation-ID header and incomplete/error event handling. No provider cancellation or billing guarantee is inferred from a local timeout.
