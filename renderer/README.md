# FinalFrame renderer foundation

This package is an isolated, bounded renderer/assembly foundation. It accepts a versioned render manifest, validates frame windows and resource bounds, creates a stable assembly plan, and exposes Remotion composition/template primitives.

FFmpeg and ffprobe are runtime dependencies only. They are not downloaded or executed during package installation. The media adapters accept injectable command names and a `CommandRunner`, which makes unit tests and managed-worker deployments independent of the host PATH. If a binary is unavailable at runtime, the adapter returns an actionable error explaining how to install or inject it.

## Run

```powershell
cd renderer
npm install
npm run typecheck
npm run build
```

With pnpm in a workspace, use `pnpm install --dir renderer --ignore-workspace` before the same `pnpm run --dir renderer typecheck` and `pnpm run --dir renderer build` commands.

The fixture is `fixtures/kinetic-title.json`. It drives the `kinetic-title` Remotion template at 1080x1920, 30 fps, for 150 frames. `src/remotion/entry.ts` is the Remotion entry point and `src/remotion/Root.tsx` is the composition primitive; a deployment can pass a validated manifest as composition props.

Example runtime adapter setup:

```ts
const media = createMediaAdapters({
  ffmpegCommand: process.env.FFMPEG_COMMAND ?? 'ffmpeg',
  ffprobeCommand: process.env.FFPROBE_COMMAND ?? 'ffprobe',
});
```

Callbacks are signed over the exact raw request body using HMAC-SHA256 (`sha256=<hex>`). The receiver should verify the signature before parsing, then claim `eventId` through a durable `CallbackReceiptStore`; duplicate claims are acknowledged without re-running side effects.

## Finishing recovery and deployment requirements

Mount `RENDER_OUTPUT_ROOT` **and** `RENDER_STATE_ROOT` on persistent worker storage. They must survive container replacement together. The default state directory is `.worker-state` inside the output root; the default output root is `/tmp/finalframe-renders`, which alone does **not** provide container replacement durability. Run a single worker process against this state directory. Files contain private Storage upload capabilities and use directory mode `0700` and file mode `0600`; never expose or commit them.

The Docker image sets `/var/lib/finalframe/output` and `/var/lib/finalframe/state`, owned by its non-root UID10001. Mount one dedicated FinalFrame Docker named volume at `/var/lib/finalframe` to retain both. The image prepares that directory before the initial empty volume is populated. A pre-existing bind mount must already grant UID10001 access; do not change permissions on unrelated host directories. Do not mount this state directory publicly or share it between simultaneous workers.

Configure comma-separated exact HTTPS origins in `RENDER_CALLBACK_ORIGINS` and `RENDER_STORAGE_ORIGINS`. Alternatively, pinned `RENDER_MEDIA_ALLOWED_HOSTS` entries of the form `<deployment>.convex.cloud` derive their Storage origin and corresponding `<deployment>.convex.site` callback origin. Missing origins deny new submissions. Incoming requests cannot authorize origins. HTTP loopback origins may be explicitly configured for local tests. Media rendering now uses the configured media-host allowlist too. Transfer redirects are rejected.

Successful verified renders and upload receipts are written atomically to private local state. Callback failures retain the output and exact completion body/event ID, then replay that completion after restart or on a bounded retry schedule. They do not issue a failed-render callback or re-render accepted media. Upload attempts stream from disk with a 64 KiB buffer and bounded receipts. A crash after Storage accepts an upload but before its receipt is persisted can leave an orphan Storage object and require another upload; Storage supplies no upload idempotency primitive here. Rendering is still reused in that case.

`RENDER_UPLOAD_TIMEOUT_MS` defaults to 120 seconds (maximum 300 seconds); `RENDER_CALLBACK_TIMEOUT_MS` defaults to 15 seconds (maximum 30 seconds). An optional coordinator-supplied `heartbeatUrl` must be on a pinned callback origin at `/renderer/heartbeat`. Its 30-second heartbeat uses a 10-second timeout and exact signed job/project/attempt/lease authority. A valid heartbeat arriving before the HTTP 202 acceptance acknowledgement is persisted receives retryable 425 without extending its lease; the monitor retries and can resume renewal after the acknowledgement. It remains active during finishing retries and stops when acknowledged or denied, or after two hours. The coordinator owns lease extension and the total attempt deadline. Browser clients cannot claim or renew renderer leases; legacy fixture leases require an internal CLI call with the private development flags, key and fixture marker while the production worker is disabled.

Each delivery preserves the original callback body and signature, and adds `x-finalframe-delivery-timestamp` plus `x-finalframe-delivery-signature` (`sha256=` HMAC over `timestamp + "\n" + exactBody`). Delivery proof must be fresh within 60 seconds. New completion effects require an original body at most two hours old and the exact current project, attempt, callback key and lease. When an accepted lease expires, the coordinator retains that identity in `RECONCILIATION_REQUIRED` and blocks automatic dispatch. Only that accepted attempt's verified stored completion can reconcile the expired lease, within two hours of acceptance. A supplied checksum must match canonical Storage bytes. Accepted output can be retained privately while project exposure remains restricted. Past the recovery window, `NEEDS_ATTENTION` retains evidence for an administrator; no completion is fabricated. An exact already-applied receipt can be acknowledged without side effects for up to 24 hours with fresh delivery proof, including after terminal state or a later attempt. Worker replay never extends lease authority, starts another render, or extends the outbox's two-hour automatic transfer window.

Only acknowledged artifacts directly inside the output root are automatically removed. Pending artifacts and failed/mismatched recovery evidence are retained; operator-managed disk quotas and alerting are deployment gates. Completed local idempotency tombstones retain no transfer URLs. No container replacement, disk-exhaustion, or production load acceptance is claimed by unit tests. Exercise these separately on the isolated FinalFrame worker before promotion.

Run local HTTP, streaming, restart, receipt mismatch, heartbeat and callback replay regressions with `node renderer/tests/run-transfer-outbox-tests.cjs` from the repository root. They use temporary local files and local HTTP only; no database or provider calls occur.

## Compatible v5 finishing reader

The default writer version remains **4**. Readers accept1/2/4/5; saved v4 picture ordering, captions and audio retain their existing behavior. v5 consumes explicit already-retimed frame windows and never shifts source timing. DISSOLVE, FADE through black, left-to-right WIPE and leftward SLIDE require adjacent items on the same visual lane, exact overlap of at most half either item and at most two seconds. CUT is an absent transition. Explicit CROSSFADE applies linear gain ramps to native video audio only; PRESERVE keeps original native gain, and independent soundtrack lanes retain their authored gain/fades.

v5 caption style accepts only fontSize12–120, six-digit text color, six/eight-digit backgroundColor, TOP/CENTER/BOTTOM placement and maxLines1–4. The browser measures complete cue text against actual export fonts/viewport before finishing a frame. It may shrink to12px; unfit text fails the render, with no ellipsis or clipping. `serializeCaptionSidecars(track,fps)` produces SRT/VTT from the same cue times/text. Plain multiline text is supported; markup, controls and blank separator lines are rejected explicitly. WebVTT ampersands are entity-escaped and CRLF sidecar line endings normalize to LF; original cue objects remain unchanged.

`npm test` runs build and contract/transfer regressions. `npm run test:visual` additionally uses installed Chromium (`FINALFRAME_TEST_CHROMIUM`, default `/usr/bin/chromium`) and FFmpeg to create original local color/tone fixtures, render real transition/caption frames and native-audio MP4s, and measure their pixels/tone amplitudes. `FINALFRAME_V5_ARTIFACT_DIR` selects an output directory; otherwise artifacts remain in a printed temporary directory for inspection. These local tests make no database/provider calls and do not establish deployed authoring, sidecar delivery, production recovery or long-form acceptance.
