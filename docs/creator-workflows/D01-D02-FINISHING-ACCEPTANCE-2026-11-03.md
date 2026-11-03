# D01/D02 bounded local finishing acceptance

New test only: `renderer/tests/run-finishing-acceptance-media.mjs`. Existing renderer/runtime, visual tests and product sources stay unchanged. No provider, inference, database, deployment, external browser automation or remote media source is used. Local Chromium is used solely through the existing canonical Remotion runtime and its local bundler.

The default is an inert plan. `--self-test` exercises the actual compiled manifest validator, assembly planner and SRT/VTT serializer without rendering. `--execute-local` is required for real media processing; coordinate the single local heavy slot first. Requires the existing installed renderer dependencies, cached Chromium, FFmpeg and ffprobe. Do not install or fetch a browser to make a failing environment pass.

```sh
node renderer/tests/run-finishing-acceptance-media.mjs
node renderer/tests/run-finishing-acceptance-media.mjs --self-test
FINALFRAME_FINISHING_CASES=h264 node renderer/tests/run-finishing-acceptance-media.mjs --execute-local
# Only after the first actual result is reviewed and the heavy slot is free:
FINALFRAME_FINISHING_CASES=vp9,prores node renderer/tests/run-finishing-acceptance-media.mjs --execute-local
```

Canonical runtime, concurrency1, 180-second render phase deadline, 90-second media command deadlines, unchanged CPU/RAM settings and20MB per-output cap. One320x180@24 atlas has128frames (5⅓seconds),256,000 stereo audio sample frames. At most3 formats/384 rendered frames per process; cases run sequentially. Bundle once per invocation; temporary canonical intermediates are cleaned by the runtime. New originals are two2s red/blue H264+PCM MOVs plus stereo PCM WAV, created locally with literal colors and synthesized tones/impulses. Artifacts are retained under `/tmp/finalframe-finishing-acceptance-*`; an explicit directory can be chosen with `FINALFRAME_FINISHING_ARTIFACT_DIR`.

The atlas has an exact CUT (32frames), then DISSOLVE/FADE/WIPE/SLIDE (24frames each with8-frame overlap). Each source has its own explicit trim. DISSOLVE/WIPE preserve native gains; FADE/SLIDE explicitly crossfade native audio. Independent220Hz music stays on its own right channel; native440/880Hz sources and original impulses occupy the left channel.

Actual decoded pixels check frame15→16 CUT, each overlap start/mid/end, literal purple dissolve/black fade/spatial wipe/slide oracles, plus exact half-open caption cue boundaries and TOP/CENTER/BOTTOM green text bounds. Captions use complete plain multiline text. Actual serialized per-track SRT/VTT is saved and parsed back to exact frame-derived times/text. No OCR or creative-quality certification is claimed; retained PNGs support human text inspection.

Actual decoded PCM checks exactly256,000 stereo sample frames, fifteen original content onset points per format within2ms, original native gains, explicit crossfade midpoint ratios and unaffected independent music. Header duration alone does not satisfy audio acceptance. Every case goes through `RemotionRenderRuntime`→lossless intermediate→FFmpeg normalization→strict output probe; codecs are H264/AAC MP4, VP9/Opus WebM, ProRes/PCM MOV.

`RESULTS.json` retains actual manifest/probe/verification, color samples, cue bounds, sample counts, onset errors, frequency amplitudes and selected PNGs. A failure writes `FAILURE.json`; retain it and investigate. Do not widen timing/amplitude oracles to make a runtime defect pass. No product change is authorized by this test packet. Local technical fixture proof does not imply online integration, real-world source coverage or creative acceptance.

Initial preparation validation: Node syntax, default inert plan and pure self-test pass. Actual media outcomes must be recorded separately after execution.

## Actual local results

All three formats passed the fixed oracles without runtime edits or tolerance changes. H264/AAC proof: `/tmp/finalframe-finishing-acceptance-5b3Ocm/RESULTS.json`. VP9/Opus and ProRes/PCM proof: `/tmp/finalframe-finishing-acceptance-309DaY/RESULTS.json`. Combined summary: `/tmp/finalframe-complete-acceptance/D01-D02-LOCAL-ACCEPTANCE.json`. Each has128frames,256,000 decoded stereo sample frames,15 checked original onsets, five transition kinds and three styled exact cue windows with SRT/VTT. Heavy slot released after sequential execution. Local originals only; no online/database/provider calls.
