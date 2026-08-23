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
