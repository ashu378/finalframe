# FinalFrame narration, music timing and editing acceptance — 2 November 2026

This continues the initial seven-clip live acceptance. Real provider jobs and persisted integration tests used **online development Convex `knowing-snail-785`** and the owner's existing test account. No local database, paid image generation, billing, email, full movie or final renderer export was used.

## Spend and safety

- OpenRouter's key usage reports **$2.369959793 cumulative**, including the previous **$1.08202446**. This phase added approximately **$1.287935333**.
- The existing application budget remains **$10**, with the existing **$15 absolute provider/deployment ceiling**. A new budget was not created to reset prior spend.
- Both new video edits completed on attempt **1**, costing **$0.6435 each**. Repeated submission returned the original job ID. Accepted jobs were polled, never repurchased.
- Two short stock-voice speech samples and one transcription completed. The second speech receipt reports **$0.000338**; transcription reports **$0.0002333332**.
- The backend records **$2.369600 settled plus $0.000401 conservatively held**. The first speech response's generation ID was not persisted before the fix, so its original hold remains instead of inventing a per-job receipt or freeing uncertain funds. The provider's cumulative usage is authoritative for the actual provider usage reported above.
- All paid generation is complete. Receipt reconciliation performs metadata GETs only; it cannot create a speech or video purchase.

## What was actually tested

| Test | Route or input | Verified result |
| --- | --- | --- |
| Stock narration | `mistralai/voxtral-mini-tts-3-0`, explicitly selected current stock preset | Real MP3 in project Convex Storage, 3.208 seconds, 22,050 Hz mono; duplicate creation returns the same job. |
| Narration intelligibility | `mistralai/voxtral-mini-transcribe-3-0` | Exact transcript: **Your ideas. Brought to life.** |
| Speech receipt fix | A second short narration using the same project-owned approved stock voice | Real provider generation ID retained; attempt becomes COMPLETED; metadata receipt reconciles actual cost once and rejects an unrelated receipt. |
| Appearance edit | `minimax/hailuo-3`, source-video reference and APPEARANCE_EDIT | The original dark speaker becomes orange while retaining the pedestal and studio composition. Real stored H.264 result: 2560×1440, 5.167 seconds. |
| Object replacement | `minimax/hailuo-3`, source-video reference and OBJECT_REPLACE | The speaker becomes a translucent amber glass cube on the original pedestal. Real stored H.264 result: 2560×1440, 5.167 seconds. |
| Music synchronization | Original deterministic four-second, 120 BPM soundtrack uploaded into the explainer project | Cuts at 0/1/2/3 seconds align with the supplied beat grid; music and narration overlap on independent lanes. |
| Practical editing | Real online normalized timeline versions | Split offsets, playback reorder, source trim, undo/redo, decibel gain, fades, mute, locked-state protection and preserved old versions. |
| Assembly contract | Canonical manifest v4 and the renderer validator | Actual source trims, audio roles, offsets, gain and fades reach the manifest. **No render or export job submitted.** |

Music synchronization here means timing to a **known fixture beat grid**. It does not establish automatic beat detection, generative music, automatic lip sync or a completed synchronized MP4. The audio-only reference mix is a WAV assembled locally from the saved manifest's frame timings, for listening; it is not a FinalFrame renderer export.

The provider's requested five-second edits contain approximately 0.167 seconds of additional encoded duration. Both pass the existing bounded technical tolerance. They contain a quiet AAC stream despite the silent request; the inspected appearance clip peaks around -61 dB. This is not a source-audio preservation or dialogue-editing acceptance test.

## Fixes

1. **Split replay:** the second half of an untrimmed clip previously restarted at source time zero. Both split halves now retain correct source bounds.
2. **Reorder without a playback change:** ordering metadata changed while start times remained unchanged. Reordering now retimes the affected lanes.
3. **Trim/UI mismatch:** source trim and timeline position were mixed in the editor; changing trim bounds did not derive a shorter duration. The UI now shows source offsets and the backend derives the trimmed duration. Known source overruns fail before a new version is created.
4. **Overlapping narration/music blocked:** the composer placed every audio clip in one non-overlapping lane. Each audio clip now has an independent lane, and the UI supports adding/removing up to 16 project audio lanes.
5. **Missing audio semantics:** narration was labeled music, and fade/mute metadata was lost at assembly. Roles, source trims, gain, fade-in, fade-out and mute now feed manifest v4.
6. **Incorrect gain controls:** decibels were treated as linear amplitude, invalid levels/fades were accepted, and unsupported pan was silently stored. Gain conversion and supported ranges are enforced; unsupported pan fails clearly. Toolbar limits match playback limits.
7. **Unusable history controls:** persisted undo/redo existed but were never enabled in the editing surface. Availability now follows the current version's saved operations and canonical edit permission.
8. **Incorrect replacement lineage:** replacing a clip's media could keep the old take ID. Asset replacement clears unrelated take identity; explicit take references must match their production and actual media. Wrong media types and cross-project references fail.
9. **Speech observability:** the speech generation ID was discarded when no request header was returned, and a completed preparation could leave its attempt in progress. Generation IDs and terminal attempt metadata are now retained. Internal metadata-only reconciliation settles verified costs idempotently while preserving unknown holds.
10. **Audio discovery:** new prepared narration assets receive readable names; retained unnamed narration gets a descriptive project-library fallback.

## Source changes

- `convex/timeline.ts` — independent soundtrack lanes, audio role/trim/fade settings and bounded media timing.
- `convex/timelineEditor.ts` — split, reorder, trim, gain, source, replacement and permission-safe edit behavior.
- `convex/assembly.ts` — canonical audio roles, gain, mute and fades.
- `convex/generationJobs.ts`, `convex/preparationWorker.ts`, new `convex/providerReceipts.ts` — preparation metadata, completion, audit and internal receipt reconciliation.
- `src/lib/production/timeline-view.ts`, `workspace-controls.ts`, `workspace-actions.ts` — source offsets, soundtrack request types/validation and readable audio choices.
- `src/components/editor/production-edit/edit-surface.tsx` and `src/components/editor/timeline-editor/` — real history availability, source trim fields and supported gain controls.
- `src/components/production-workspace/timeline-composer.tsx`, new `soundtrack-editor.tsx` — explicit multi-lane project audio selection.
- `scripts/controlled-tests/run-audio-edit-tests.mjs`, `run-small-edit-tests.mjs`, `run-audio-sync-tests.mjs` — opt-in online acceptance drivers; none submits a renderer export.
- `tests/production-edit/run-timeline-behavior.cjs`, `run-online-timeline-isolation.mjs`, `tests/generation/run-online-speech-receipt.mjs`, `tests/episodes/run-timeline-view.cjs` — executable regressions.

## Verification

- Eleven real online soundtrack/timeline/manifest checks passed, including a separate muted-music manifest that preserves narration.
- Eight executable tests of the actual production edit/audio helpers passed, without a database or provider call.
- Fourteen timeline projection assertions passed.
- Seven preparation pricing contracts, eight worker contracts, existing editing contracts and manifest-v4 contracts passed.
- Speech receipt reconciliation was verified against the online ledger, including replay and wrong-receipt denial. Its first acceptance assertion was corrected to wait for asynchronous metadata settlement rather than assuming immediate completion.
- Four additional online checks passed: cross-project replacement, wrong-media-type replacement, source-duration overrun and no version creation on failure. Final frontend deployment evidence is recorded in the accompanying acceptance artifacts.
- TypeScript and changed-file ESLint passed. Backend functions were deployed to the online development deployment. Frontend changes use the existing GitHub → Vercel Preview pipeline.

## Owner handoff and remaining limits

The two edit projects are **Live acceptance · appearance-edit** and **Live acceptance · object-replace**. Narration, soundtrack media and the approved test timeline/manifest belong to **Live acceptance · explainer**. Test-resource approvals record controlled fixture acceptance; they do not substitute for the owner's creative sign-off on generated takes.

The owner still performs the genuine final renderer/export/callback/download test. Render dispatch remains disabled; it must be deliberately enabled for that owner-run export. No render request was sent, no renderer container was changed, and no production deployment was promoted. Yafpay and other projects were untouched.

This pass does not certify voice cloning, real-person hairstyle changes, lip sync, source-audio preservation, automatic music beat analysis, transition rendering, every provider/edit operation, or long-form production.

No schema migration is needed: audio settings use existing clip metadata and optional request fields. Existing locked versions remain unchanged; rebuild an affected legacy one-lane soundtrack as a new draft. Rollback can restore the prior frontend/backend code while retaining every project, take, asset, audit event and timeline version. Pausing the existing budget or preparation worker stops new purchases without erasing spend.

## Catalog evidence

Speech models and presets were read from the current [OpenRouter speech catalog](https://openrouter.ai/api/v1/models?output_modalities=speech), and narration pricing was checked across the current model's eligible endpoints. The current [MiniMax H3 page](https://openrouter.ai/minimax/hailuo-3) documents source-guided edits; the [video API documentation](https://openrouter.ai/docs/guides/overview/multimodal/video-generation) documents asynchronous submission and polling. These establish candidate capabilities; the concrete results above come from the actual FinalFrame jobs and downloaded media.
