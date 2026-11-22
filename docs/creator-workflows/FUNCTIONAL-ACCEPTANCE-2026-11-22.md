# FinalFrame acceptance checkpoint — 22 November 2026

Status: IN PROGRESS. This checkpoint is not a whole-product launch certificate. Live payments were not activated.

## Revisions and environment

- Main frontend and backend changes: `a7aeb53` (repair/estimate/export acceleration), `21ba3db` (authorized attachments), `b00797f` (structured planned graphics).
- Main domain: https://www.usefinalframe.xyz. Vercel deployment for `b00797f`: `6aeR32QAMv9grpNbybNB8khZYeTS`, successful.
- Matching online Convex: `dev:knowing-snail-785`, strict typecheck/deployment passed. No local database was used.
- The signed-in Coolify session was found in the in-app browser; the earlier login warning came from a different Chrome session. FinalFrame renderer deployment `y0zddjhcppqonw4yg0qod1jq` succeeded at revision `dfde90a592945424f15d7b96039f74be1e03fb97`, with `RENDER_SEQUENTIAL_FAST_PATH=true`. Only project **Final Frame**, resource **finalframe-renderer** (`iqxnl8oe3xnssu9oe4eyaj3z`), was changed. Existing 1 CPU / 2 GB limits remain intact. Yafpay and shared server settings were not changed.
- Existing unrelated changes and retained projects/exports were preserved. No destructive cleanup or migration ran.

## What changed

1. The automatic action repair has a versioned, timed acting prompt. It permits required jaw/body movement while preserving identity and unrelated actions. Only a legacy unversioned failed repair can try the revised method once; the same failed method cannot buy an identical chain. Exact source and original-recording bindings remain pinned.
2. A user can explicitly approve a failed picture as a repair reference without approving its take or its missing action. An unapproved reference previously caused a misleading repair failure.
3. Completed export and movie downloads use a project-authorized same-origin attachment response. Range, byte bounds, upstream origin, ownership and media types remain checked. The old cross-origin download attribute could open the player instead of saving the file.
4. Motion-graphics estimates exclude AI-video credits. Speech, captions and finishing remain separately explicit. Production tools show a reconnect state rather than a blank panel.
5. Structured graphic cards carry exact words, order, durations and colours from the plan into the deterministic recipe. The creator sees the cards before plan approval and can revise their recipe copy/colours without rewriting the approved plan. Historical plans remain readable and keep manual controls. No new table or migration is required.
6. An opt-in sequential finishing path uses single-threaded FFmpeg for eligible contiguous video cuts and Remotion only for graphic segments. Transitions, captions, extra audio tracks and complex framing stay on the existing renderer. The flag is `RENDER_SEQUENTIAL_FAST_PATH=true`; default is off.

## Eight retained browser downloads

All eight saved productions were opened on the main website and downloaded through the ordinary authenticated export link. Each downloaded SHA-256 matches the retained Convex Storage checksum. This is current delivery regression evidence, not eight fresh creations or renewed independent creative approval.

| Recipe | Current download | Measured output | Remaining distinction |
|---|---|---|---|
| 2D comedy | PASS | 4s, 1920×1080, H264/AAC | Retained pigeon gag; fluent Pidgin and complete fresh comedy journey remain separate |
| Realistic skit/UGC | PASS | 4s, 1080×1920, H264/AAC | Retained unmarked mug demonstration; prior fresh talking-UGC evidence is separate |
| Product/SaaS launch | PASS | 8s, 1080×1920, H264, no audio | Retained repaired exact-UI graphic edit |
| Motion graphics | PASS | 4s, 1080×1920, H264, no audio | Retained chart edit; new structured-card journey below |
| Narrated explainer | PASS | 4s, 1080×1920, H264/AAC | Retained narrated/captioned tyre-pressure graphic |
| Cinematic short | PASS | 4s, 1080×1920, H264/AAC | Retained courier scene; not a new multi-scene movie |
| Music video | PASS | 4s, 1080×1920, H264/AAC | Retained authored soundtrack and beat-aligned still-image cut |
| Social cutdown | PASS | 4s, 1080×1920, H264/AAC | Retained selected source window |

The browser tool intermittently stalled on a second download in the same tab. Fresh ordinary tabs resolved each case without weakening browser security. No unresolved application download failure remains in this retained matrix.

## Automatic chewing repair: creative FAIL, safety checks PASS

- Source: three-person cartoon production `kh73wxev87v2nbgn3y47dhw1h58jj168`.
- New v2 repair job `js7fftahhjydb2p29575y9q5m58jn6sd`, new take `m172msv7e04vme93jem4kvntw98jnzhe`, one submission, provider cost $0.2376.
- The ordinary browser completed reference approval, estimate, confirmation, saved take and picture check. The picture check cost about $0.0025 and correctly reported no visible chewing before the grandmother's question. Coordinator inspection of the actual timed frames agreed.
- Do not approve or export this failed repair as successful. Approved previous takes and original voices remain unchanged. The earlier localized deterministic chewing repair is different evidence and does not certify provider acting repair.
- No repeat of the same failed strategy was purchased. A different verified repair strategy needs a new quality test before automatic correction can be called reliable.

## Export speed: local and live same-edit benchmark PASS

Same 30-second, 900-frame, 1080×1920, four-segment retained edit, one CPU:

| Path | Wall time |
|---|---:|
| Earlier local Remotion path | 582.08 seconds |
| New eligible sequential path | 131.593 seconds |
| Earlier VPS result, different environment | 968.731 seconds |
| New live VPS path, same approved edit and retained resource limits | 258.035 seconds |

The local comparison is about 4.4× faster. Mean decoded-frame SSIM is 0.98982779, minimum 0.951368 across all 900 frames; joins and end card were inspected. This is a visual comparison, not a bit-identical claim. The approved fixture is silent: the new output has no audio track while the old output contained synthetic silence.

The faster code is now deployed on the FinalFrame-only worker. Its health check passed, preserving the `finalframe-media-pcm-v1` compatibility value, format/source-audio versions and graphics readers. A new render of the exact retained approved manifest was queued through the authorized online-development CLI (`r575r77qn336v1jdfph8ma0fy98jpyjf`, export `ps73fa2jtvfrb8rwg6dvy945hs8jqf0z`). Repeating the request returned the same job; no AI provider call was made. The ordinary main-site download completed as `/home/ashuboris/Downloads/finalframe-export (9).mp4`: 30.000 seconds, 900 frames, 1080×1920, H264, silent as approved. Mean decoded-frame SSIM against the older live export is 0.98993889, minimum 0.951407; all four segments, joins and authored end card were inspected. Accepted-to-completed time fell from 968.731 to 258.035 seconds (3.75× faster, approximately 73% shorter). Timing includes render finishing/upload/callback. This is a finishing benchmark, not a fresh browser creation or a performance guarantee for caption/transition/audio-lane-heavy compositions. Peak memory was not measured; server-wide metrics were left disabled rather than changing shared-host settings.

Rollback: set the FinalFrame resource's `RENDER_SEQUENTIAL_FAST_PATH` to `false` and redeploy the same revision. The earlier pinned revision `0a95c5a360fb67a92254f289af0bf47c95f09874` and deployment `fg8gcnngfar2ab63ncac54mx` remain recorded. Preserve all accepted jobs, receipts, storage and database records; do not restart the shared host or alter another application.

### Live audio and archive regression

- An additional retained UGC fixture initially failed before dispatch with `RENDER_SOURCE_UNAVAILABLE`: its project was archived. Restoring the test project through `projects.restore` and retrying the same job succeeded. The fixture was then returned to ARCHIVED through `projects.archive`. Earlier approved resources and downloads were retained. Job `r5797ddfksjf93kh2aqbw5grgh8jq9y1`, export `ps78pfjds95txyk2f98x68d12h8jpa93`, 30.920s after acceptance. This fixture's actual source contains no audio; the earlier export's AAC track was synthetic silence. The new silent output is therefore not native-audio evidence.
- A separate audible test deliberately uploaded the retained owned four-second music export (132,528 bytes) into the active test project as a new project asset. New timeline/manifest/review records preserve the earlier approved thirty-second timeline. The completed export was downloaded through the ordinary main-site link. This is developer-authenticated fixture preparation plus ordinary browser delivery, not a new creative recipe test.
- Job `r57ccnk93f3gm8c2h7tyaf7cfx8jqab4`, export `ps78qg4rxe0f04skn4zmsqqqk98jq9wr`, 6.825s after acceptance. Actual output: 1080×1920, 120 frames, 4.000s, H264/AAC. Comparison against the original uploaded soundtrack: correlation 0.9999407174 at zero lag, best measured lag 0ms, both decode to 191,968 mono samples for the comparison. RMS remains nonzero (0.10361 versus 0.10371). This proves audible native-track preservation for this fixture, not human speech/lip-sync quality.
- Evidence: `desk30-live-result.json`, `desk30-live-contact.jpg`, `desk30-live-ssim.txt`, `real-audio-live-result.json`, `real-audio-fixture.private.json`, `native-audio-live-fast.private.json`, `renderer-health-live.json`, `finalframe-renderer-deployed.png`, and `real-audio-live-download.png` in the checkpoint artifact folder. All new renderer tests in this follow-up made **zero AI-provider calls**. The last reconciled spending total below is unchanged by these tests.

## Fresh motion-graphics regression

The first fresh ordinary brief reached a four-second square downloaded MP4 but failed the brief: it required retyping copy and used one blue card rather than the requested two black/lime cards. That failure remains retained. The correction is deployed in `b00797f`. A second fresh brief passed the ordinary live journey without retyping graphic copy: two structured cards, reviewed plan approval, preparation, explicit $0 provider estimate/start, reviewed/locked timeline, assembly approval, asynchronous render and real download.

- Production: `kh763j4kmasxwskedx5eyj56118jqhzq`.
- Export: `ps75sj9m0gjaxwzfs8cef62cfd8jqeb4`. Render job `r571x254m7ztrx7d66xqwbe1nd8jq19y` completed in 26.867 seconds from worker start; recipe `zh72cyrjecjw2q0b6z23e0crqd8jqfrh` is COMPLETED with zero admitted provider cost.
- Output: 4.000 seconds, 120 frames at 30fps, 1080×1080, H264, no audio as requested.
- First card: “One small step”; second card: “Start today”; requested black/white/lime values retained. Decoded frames at the boundary and card interiors inspected. Each card uses its normal animated entrance within its two-second segment.
- New planning cost: $0.01337589. No AI image/video/speech generation was used for the graphics result.
- Download: `/home/ashuboris/Downloads/finalframe-export (8).mp4`; probes and rendered-frame comparison in `exact-graphics-probe.json` and `exact-graphics-frames.jpg`.
- This is a scoped successful brief-to-download graphics case, not independent creative certification of the other seven recipes.

## Automated checks

- Production build, TypeScript, lint and strict online Convex deployment: PASS.
- Renderer build and actual FFmpeg sequential-media tests: PASS, 11 eligibility cases, 48-frame media test, native audio, mute, trim and short-source rejection.
- Eight-type routing/capability/cost/provider contracts: PASS.
- Recipe compiler: 22 PASS; recipe backend: 21 PASS; recipe UI: 17 PASS.
- Planning contracts and new planned-graphics order/copy/colour/timing/validation tests: PASS.
- Story-action assistant: 12 groups PASS, including access denial, stale observations, exact reference binding and failed-repair repeat denial.
- Existing review-media streaming: 10 groups PASS; new authenticated export/movie attachment, HEAD and denial tests: PASS.
- Renderer-only planning estimate regression: PASS.

## Evidence location

Local artifact folder: `/home/ashuboris/.codex/artifacts/finalframe/acceptance-20261122/`.
Contains eight-download-probes.json, browser-downloads.json, contact sheets, the repair frame sequence and private receipt, local benchmark MP4/JSON/SSIM, build/typecheck/contract logs and budget reconciliations. Private receipts and credentials are not committed.

## Remaining acceptance gates

- Successful automatic acting correction after the failed v2 approach.
- Broader renderer interruption/recovery verification; the live acceleration rollout and same-edit timing comparison now pass.
- Fresh all-eight start-to-download and independent creative-review matrix; retained downloads are not a substitute.
- Existing fluent Pidgin and consented personal-likeness requirements, advanced operations and broader collaboration/recovery checks remain as recorded in the release checklist.
- Live payments remain disabled until separate owner authorization.

## Reconciled spending

Current provider usage $8.886359812, earlier deleted-key usage $8.494995241; cumulative known $17.381355053. Retained uncertain holds $0.912404. Conservative total **$18.293759053 / $25**. The provider key has $1.113640188 left under its separate $10 limit; the application ledger still has its independent $20 limit. No cap, reservation history or payment mode was changed.
