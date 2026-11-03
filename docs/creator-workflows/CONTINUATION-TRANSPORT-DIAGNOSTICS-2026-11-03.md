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
- Before this packet the worker kept only the error code and
  rejection/uncertainty decision, discarding rejection details. The historical
  live job therefore cannot prove the rejected parameter. A completed
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
408/500/network/abort reconciliation without another POST, private persistence
and public query redaction, malformed/oversized/interrupted bodies, stale lease
and terminal replay, and hashing failure without changed accounting. Assertions
check the actual fail handler's settlement calls; this is not an online ledger
or billing test.

`src/lib/ai/submission-diagnostic.ts` is a pure helper used by the adapter,
worker and internal failure persistence boundary. Its output contains only
version 1, a SHA-256 of fixed-order permitted
controls, and optional HTTP status, recognized request ID, exact allowlisted
provider code/parameter, and bounded response-byte SHA-256. It never serializes
arbitrary error/request/response objects, messages, prompts, model/source IDs,
media references, URLs, or base64. Response bytes over 64 KiB produce no digest;
there is no misleading partial digest. Input snapshots are taken before async
hashing yields. The output boundary sanitizer drops unknown fields and rejects
invalid versions/fingerprints. Unknown correlation-ID formats are omitted.

## Integrated private boundaries

1. In the VIDEO_GENERATION error transport only, the adapter captures at most 64 KiB of the
   rejected response bytes using one bounded body read (also capped at 2048
   reads). It cancels overflow and retains no partial digest. Bytes remain
   ephemeral. It feeds
   only status, the actual `x-request-id` header, allowlisted provider error code
   and parameter, and those bytes into `buildSubmissionDiagnostic`, along with
   controls derived from the already-built canonical request: duration,
   aspectRatio, resolution, generateAudio, continuation boolean, and reference
   counts. It reads explicit provider code/parameter fields, never infers them
   from messages. Unknown ID/code/param values remain absent. If exact bounded
   bytes are unavailable, `responseDigest` is absent. Rejected video errors use
   a static message, and raw provider details are not forwarded. Success-body
   handling and non-video/SFX/MUSIC transports keep their existing behavior.
2. The generation worker forwards only the re-sanitized private diagnostic.
   Network/timeout errors can retain a control fingerprint without inventing
   a status, request ID or response digest. Read/hash failure does not replace
   the original HTTP or uncertainty classification or change settlement.
3. Internal `generationJobs.fail` accepts an optional diagnostic and revalidates
   it after existing terminal/lease checks. Only fenced, unaccepted
   SHOT_GENERATION jobs persist it in `job.response.submissionDiagnostic`.
   Invalid versions/fields are dropped. Existing response fields, stored-output
   recovery, accepted/uncertain barriers and accounting are preserved. No schema
   field or public projection is changed. A diagnostic grants no retry authority.
4. Actual-handler tests verify private preservation, malicious optional-field
   stripping, stale lease/no writes, terminal no-op replay, public get/list
   redaction, and unchanged rejected-versus-uncertain settlement even if hashing
   fails. Future controlled attempts remain explicit; this packet schedules none.

## No-cost checks

```sh
node tests/generation/run-continuation-transport.cjs
node tests/generation/run-submission-diagnostic.cjs
node tests/generation/run-continuation-certificates.cjs
node tests/generation/run-operation-controls.cjs
```

No live-success or exact live-cause claim follows from these tests.
