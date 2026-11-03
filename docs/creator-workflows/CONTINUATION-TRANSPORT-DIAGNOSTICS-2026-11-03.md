# Continuation transport and private diagnostics

This packet removes unnecessary empty reference arrays from video requests and
adds offline transport coverage. It does **not** establish why the live FLUX 3
continuation returned `INVALID_REQUEST`. No paid request, database operation,
provider login, or retry of that job was performed.

## Evidence and limits

- The [official OpenRouter SDK request model](https://github.com/OpenRouterTeam/typescript-sdk/blob/main/src/models/videogenerationrequest.ts)
  documents `previous_job_id` as a completed source job reused on the same model
  and endpoint. Its optional array schemas do not establish that empty arrays
  are prohibited.
- [BFL's continuation documentation](https://docs.bfl.ai/flux_3/flux3_video)
  supports a 5-second continuation, 16:9, and disabled generated audio. Direct
  BFL input names are not the normalized OpenRouter transport contract.
- The worker currently keeps the error code and rejection/uncertainty decision,
  discarding the adapter's HTTP status, request ID, and rejection details. The
  retained live job therefore cannot prove the rejected parameter. A completed
  source GET does not prove upstream availability, and source age alone does not
  prove expiry.

## Implemented scope

`buildVideoGenerationRequest` omits zero-length `frame_images` and
`input_references` both from capability-presence checks and the JSON body.
Populated references retain their existing transport representation.

`tests/generation/run-continuation-transport.cjs` loads the actual worker,
adapter/builder, canonical job creation/fence/claim/submit/poll/fail handlers and
reviewed routing. Catalog discovery, HTTP, database, and accounting functions
use isolated fixtures. It verifies the exact silent 5-second continuation
payload, one fenced POST, accepted polling, definitive 400 release, and uncertain
408/500/network/abort reconciliation without another POST. Accounting assertions
check the actual fail handler's settlement calls; this is not an online ledger
or billing test.

`src/lib/ai/submission-diagnostic.ts` is a new pure helper with **no active
imports**. Its output contains only version 1, a SHA-256 of fixed-order permitted
controls, and optional HTTP status, recognized request ID, exact allowlisted
provider code/parameter, and bounded response-byte SHA-256. It never serializes
arbitrary error/request/response objects, messages, prompts, model/source IDs,
media references, URLs, or base64. Response bytes over 64 KiB produce no digest;
there is no misleading partial digest. Input snapshots are taken before async
hashing yields. The output boundary sanitizer drops unknown fields and rejects
invalid versions/fingerprints. Unknown correlation-ID formats are omitted.

## Proposed integration for the coordinator (not implemented here)

1. In the VIDEO_GENERATION error transport only, capture at most 64 KiB of the
   rejected response bytes using a bounded single body read. Cancel overflow;
   do not collect an unlimited body for diagnosis. Keep bytes ephemeral. Feed
   only status, the actual `x-request-id` header, allowlisted provider error code
   and parameter, and those bytes into `buildSubmissionDiagnostic`, along with
   controls derived from the already-built canonical request: duration,
   aspectRatio, resolution, generateAudio, continuation boolean, and reference
   counts. Never parse arbitrary provider messages to invent a parameter or
   receipt. Unknown ID/code/param values remain absent. If exact bounded bytes
   are unavailable, omit `responseDigest` rather than hash a reconstruction.
2. Forward only the returned diagnostic on a private typed error slot through
   the generation worker's catch. Do not forward raw adapter details: existing
   `providerMessage` can echo sensitive request content. Diagnostic creation
   failure must never replace the original submission outcome or alter whether
   its reservation is released or retained.
3. Add an optional diagnostic argument to internal `generationJobs.fail` and
   call `sanitizeSubmissionDiagnostic` at that persistence boundary. After the
   existing terminal/lease checks, persist only sanitized output inside existing
   `job.response.submissionDiagnostic`. Preserve all stored-output recovery,
   accepted/uncertain barriers, retry, settlement, and stale-lease behavior.
   No schema field is needed. Do not expose this field through public job/error
   projections, and do not turn its existence into retry permission.
4. Add actual-handler integration assertions for diagnostic preservation,
   malicious optional fields, stale lease/no writes, public projection redaction,
   and unchanged rejected-versus-uncertain settlement. Keep controlled future
   attempts explicit; this packet does not schedule one.

## No-cost checks

```sh
node tests/generation/run-continuation-transport.cjs
node tests/generation/run-submission-diagnostic.cjs
node tests/generation/run-continuation-certificates.cjs
node tests/generation/run-operation-controls.cjs
```

No live-success or exact live-cause claim follows from these tests.
