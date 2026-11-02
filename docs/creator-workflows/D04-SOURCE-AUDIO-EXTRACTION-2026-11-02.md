# D04 — explicit source-video audio extraction

This packet creates a separate project draft audio asset from an explicitly selected approved source video and time window. It uses the existing authenticated renderer and local FFmpeg only. No AI/provider route, credit reservation, voice enrollment, creative approval, email or payment is involved. The source asset and bytes remain unchanged. Cloud acceptance is not claimed by local tests.

The shared profile is `VIDEO_AUDIO_WAV_48K_STEREO_V1`. Input is a current same-project APPROVED/LOCKED MP4/MOV/WebM asset, at most50,000,000bytes and60seconds of actual first-video and first-audio packet timestamps. Output is the first audio stream only, selected in source-video-relative timestamps, resampled to48kHz stereo16-bit PCM WAV. Start and length seconds round to the nearest48kHz sample. The output sample count must exactly equal the requested count; the worker does not insert silence, loop, pad, synthesize or lengthen missing audio. A source with delayed/short/no audio may require a narrower selected window.

## Bounded media contract

`renderer/src/media/audio-extraction-contracts.ts` owns window/RIFF validation and limits. Source video and first-audio packet bounds are verified from the complete bounded packet response: at most15,000combined packets and4MiB total probe JSON, finite PTS/durations, actual combined A/V presentation span<=60s. Audio codec skip/discard sample metadata excludes encoded priming/padding from that span; the selected window still uses the actual video origin. Input-side decoding is independently capped at60s. Declared container duration and asset metadata cannot replace this measurement. The accepted source codec/container set is explicit in the extraction worker. Unknown shapes fail closed.

The worker downloads only an explicitly allowed HTTPS Convex Storage host/path, with redirects denied, exact canonical SHA and byte size, <=50MB and a shared90s processing deadline. Bounded packet/probe work and single-thread FFmpeg run under the existing heavy-media gate. The output ceiling is11,520,000PCM data bytes plus4096header bytes. RIFF size, every bounded chunk, PCM format, stereo/sample rate/byte rate/block alignment and exact data sample count are parsed again in the Convex action. The actual RIFF header need not be44bytes; FFmpeg commonly emits78bytes. RF64, malformed/truncated chunks and appended bytes are rejected.

`POST /media/extract-audio` uses the existing worker shared-secret header. Input is `{url,checksum,byteSize,profile,startSample,sampleCount}`. A successful response is bounded `audio/wav` binary, with exact profile, source-duration and output-SHA headers. Busy media work returns429; errors expose fixed safe codes. This additive route preserves ordinary-render/movie/D05 dispatch and gate behavior.

## Canonical durable authority

`mediaDerivationJobs` binds the exact project/studio/actor, source asset/storage/bytes/SHA, selected sample window, profile and canonical request hash. Public `mediaDerivations.request` accepts no actor override or caller source metadata. A globally unique request key binds actor, project, source byte identity, window and profile. Exact replay reuses the same job/result. Public read projections omit source/output storage IDs, raw checksums, signed URLs and private receipts.

Request, first-work claim and atomic completion use the canonical project/studio membership resolver, including inactive/tombstone precedence, active user/project lifecycle, moderation restrictions, current source rights, current approval and canonical Storage bytes. Background execution resolves the saved actor without a browser session. Max3attempts and a2h queue/retry window bound free processing. Only unavailable/timeout/408/429/5xx/expired-lease failures retry; deterministic bad sources, bytes, audio or range stop.

The authenticated action verifies the WAV bytes before Storage, then records a private exact output receipt and atomically creates one asset, one audio row and a canonical DRAFT resource state. The new asset retains exact duration/sample count and source-window lineage. No voice or voice consent is created. The normal project library approval controls remain the authority for subsequent use.

Cancellation/revocation/stale completion cannot promote output. Up to3issued leases and3private receipts retain exact unpromoted outputs for2h for reconciliation, without exposing an asset. Current-authority retry may reuse an unexpired exact retained output rather than running FFmpeg again. Cleanup checks exact receipt/storage/SHA/size and never deletes promoted Storage. An action crash before its Storage ID can be durably acknowledged remains a cross-service handoff limitation; retries can repeat only free local processing, never a provider purchase. Acknowledged receipts have bounded scheduled retention and cleanup.

## Public opt-in surface

The new `audio-extraction-panel.tsx` is mounted in the existing project assets/continuity workspace. It lists approved source videos, explicit start/length inputs, an Extract audio button, durable status/attempt count, cancel/retry controls and exact completed duration. Page visits only query saved state. The refreshed library exposes the new draft through existing review controls. The panel states first-track behavior, source/output bounds, no AI charge, source preservation and no implied voice consent.

Public APIs are `request({projectId,sourceAssetId,startSeconds,durationSeconds,idempotencyKey})`, `get({jobId})`, bounded `list({projectId,limit?})`, `cancel({jobId})` and `retry({jobId})`. All claim/input/record/complete/fail/expiry/retention/processing functions are internal. Retry stays bound to the saved actor; project OWNER may cancel another actor's work but cannot use cancellation to obtain an output.

## Local verification

* `node tests/media-derivation/run-audio-extraction.cjs` — actual canonical-auth/backend handlers, WAV parsing, request replay, foreign/inactive/revoked/changed-source denial, no-session stored actor, single DRAFT output, revoked/cancel/stale receipt retention, restored-authority byte reuse, transient retry and retention bounds. Financial seams assert zero reservations/settlements.
* `node tests/media-derivation/run-audio-extraction-ui.cjs` — executable component handlers: no page-visit mutation, deliberate submission/idempotency, view-only controls and truthful draft/duration output.
* Build renderer, then `node renderer/tests/run-audio-extraction-tests.mjs` — original local synthetic video/audio, actual FFmpeg/FFprobe, exact stereo WAV/window, source SHA/size/URL denial, silent/short/delayed audio failure and forged-duration packet rejection, and an actual4s-video/61s-audio MOV rejection.
* `node renderer/tests/run-audio-extraction-http-tests.mjs` — actual local authenticated HTTP worker, shared busy gate and binary output; isolated source-fetch fixture, no cloud calls or Chrome rendering.

Local tests do not certify deployed renderer compatibility or live project access. The coordinator owns schema/generated API integration, deployment and any subsequent no-cost cloud acceptance.
