# Renderer audio onset investigation

The original 12-second click fixture produced a successful online export with
the correct total duration, but every attack was about 42.7 ms late. Total media
duration and audible output alone therefore did not establish correct timing.

## Evidence and cause

The diagnostic uses only original local PCM and local Chromium/FFmpeg. It does
not read the online manifest, private media URLs, databases or AI providers.
All 23 source clicks were compared after decoding each intermediate to 48 kHz.

| Intermediate | Median peak shift from source | Maximum absolute shift |
| --- | ---: | ---: |
| Default Remotion H.264/AAC MP4 | 42.667 ms | 42.667 ms |
| Existing normalization of that MP4 | 42.667 ms | 43.083 ms |
| Separate Remotion AAC ADTS | 42.667 ms | 42.667 ms |
| Separate Remotion PCM WAV | 0 ms | 0 ms |
| PCM WAV plus final MP4 AAC | 0 ms | 0 ms |
| Remotion PCM in MKV | 0 ms | 0 ms |
| PCM MKV plus final MP4 AAC | 0 ms | 0 ms |

The installed Remotion version is 4.0.515. Its renderer implementation:

- `dist/create-audio.js` preprocesses and merges sources into `merged.wav`.
- `dist/compress-audio.js` compresses that mix with `libfdk_aac` and `-f adts`.
- `dist/stitch-frames-to-video.js` copies the compressed intermediate into the
  video container with `-c:a copy`.
- `dist/options/audio-codec.js` resolves `preferLossless` to `pcm-16`; its PCM
  compressor copies the WAV rather than passing through ADTS.
- `dist/file-extensions.js` permits PCM in MKV for H.264/VP9 and MOV for ProRes.

These are paths inside `renderer/node_modules/@remotion/renderer/`. ADTS does
not retain the encoder's skip-sample metadata; the raw Remotion output already
contained 2048 delayed samples. The final AAC encoder's own 1024 skip samples
were correctly signaled in the online output and were not the original cause.
No fixed delay trim was used in the fix or the passing experiment.

## Runtime change and acceptance

When FFmpeg normalization is available, Remotion now preserves its mixed audio
as PCM until the final encode. Its temporary container is MKV for H.264/VP9
and MOV for ProRes. Final normalization uses the final preset's container.
The existing FFmpeg frame-derived duration/sample bounds remain authoritative.
Native video audio remains eligible even when no separate soundtrack was
declared. Plans containing neither video nor an audio track are explicitly
muted, avoiding a fabricated blank mix from still-image asset collection.

Run the focused tests after building:

```sh
pnpm --dir renderer build
node renderer/tests/run-remotion-audio-onset-diagnostics.mjs
node renderer/tests/run-runtime-audio-onset-tests.mjs
```

The diagnostic retains raw and normalized intermediate artifacts and measured
per-click errors. The runtime suite exercises the actual runtime class, local
Chromium and FFmpeg, with independently isolated native/music channels, source
trim and placement, soundtrack fades, undeclared native audio, known-silent
visuals, exact frame counts, intermediate cleanup and one-second H.264/VP9/
ProRes presets. Each final impulse must remain within 2 ms of its canonical
source placement. The tests do not accept the old compressed timing defect as
desired behavior.

`FINALFRAME_ONSET_SOURCE_WAV` optionally selects an existing original 12-second
click WAV. `FINALFRAME_ONSET_VARIANTS` and `FINALFRAME_RUNTIME_ONSET_CASES`
select bounded subsets. `FINALFRAME_TEST_FFMPEG` and
`FINALFRAME_TEST_FFPROBE` select local binaries for compatibility verification.
Temporary artifact directories are printed and retained for inspection.

Local diagnosis used FFmpeg 9.0.2. Production Debian FFmpeg 5.1 compatibility and
a fresh online output remain separate release checks; local success does not
claim those checks have run.

## Delivery format consistency

The final codec now selects one consistent worker filename, upload content
type and completion MIME. An explicit manifest export format must match it.

| Codec | Final container | MIME | Final audio |
| --- | --- | --- | --- |
| H.264 | MP4 | `video/mp4` | AAC |
| VP9 | WebM | `video/webm` | Opus |
| ProRes | MOV | `video/quicktime` | PCM16 |

The ordinary worker derives the new format only from a validated manifest.
The outbox snapshots its optional MIME and uses the matching extension for
exact lease-bound receipt recovery and cleanup. Old persisted requests with
no MIME retain their MP4 default, and existing exact callback bodies replay
unchanged. Movie merge remains MP4.

For canonical v4/v5 manifests, completion and media exposure require the
manifest codec, declared export format, claimed MIME and Storage content type
to agree. This check covers private downloads, shared review video URLs/new
links and caption sidecars. Pre-canonical records retain only their existing
MP4 meaning, including historical read-only assembly v3 records; no migration
rewrites their data or permissions. Historical `ed0e29c:convex/assembly.ts`
authored v3 with H.264 output, `sources` rather than renderer `items`, and no
explicit export format/contractVersion. The retained v3 fixture tests downloads
with both absent and matching stored contract versions, rejects contract/MIME
disagreement, and confirms v3 remains invalid for new renderer requests.

The application currently authors H.264 manifests. The other two rows describe
the supported worker contract, without claiming additional creator UI presets.

```sh
pnpm --dir renderer build
node renderer/tests/run-output-format-delivery-tests.mjs
node tests/render/run-output-format-contracts.cjs
node tests/render-heartbeat/run-recovery-contracts.cjs
node tests/render-callback/run-callback-security-contract.cjs
node tests/production-edit/run-finishing-v5.cjs
```

Delivery tests use real local HTTP with mock Storage/callback services and
original fixture bytes. Backend tests call the actual handlers using isolated
in-memory records and transaction rollback. They cover all three formats,
wrong claimed/stored types, format disagreement, shared URL denial, MP4 legacy
defaults and exact receipt replay. They do not invoke Convex or provider APIs.
