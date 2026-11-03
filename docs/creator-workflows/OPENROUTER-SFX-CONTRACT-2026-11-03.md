# Sound effects: reviewed contract and local implementation — 3 November 2026

This packet implements one explicit, opt-in sound-effect preparation operation. It does not enable any server flag, deploy code, mutate the live database or submit provider inference. The independent review and executable suites establish local contract/security/recovery behavior; they do not certify a real SFX response, creative fidelity or actual charged receipt.

## Provider and billing contract

The current [OpenRouter speech guide](https://openrouter.ai/docs/guides/overview/multimodal/tts#non-speech-prompts) explicitly documents Seed Audio non-speech prompts. The request is POST `/api/v1/audio/speech` with exactly model, input and `response_format:"mp3"`, without voice or references. Seed accepts at most3000 input characters and caps generated audio at120 seconds. There is no exact-duration parameter; a short length requested in the prompt is guidance and does not lower the admitted cost ceiling.

The [public speech catalog](https://openrouter.ai/api/v1/models?output_modalities=speech) and [endpoint catalog](https://openrouter.ai/api/v1/models/bytedance-seed/seed-audio-1-0/endpoints) currently show exact model `bytedance-seed/seed-audio-1-0`, canonical20260630, sole eligible Seed endpoint/tag, status0 and completion price$0.0025. [BytePlus Audio1.0](https://docs.byteplus.com/en/docs/byteplusvoice/seedaudio-01) bounds original output at120 seconds and bills original duration; postprocessed playback can differ. The base ceiling is$0.30; the approved reservation policy is `videoBudgetReservationUsd(.3)`=$0.325. Actual charge remains separate and unknown when no receipt exists.

`REVIEWED_OPERATION_CONTRACTS.sfx` centralizes exact model/version/evidence/rate. `SFX_GENERATION`, its logical registration and preparation model are separate from narration and Music. The certificate pins complete expected model/eligible-endpoint control and pricing facts, rejects new/changed endpoints/versions/prices and reserves the full120-second ceiling. Speech does not honor provider only/order routing, so a presumed routing pin is not used. The adapter has no fallback and does not retry a provider POST. Narration still requires a stock voice or approved selected recording; SFX cannot silently become narration, voice cloning or music.

## Explicit estimate and execution

SFX remains unavailable unless preparation, worker and new `FINALFRAME_SFX_PREPARATION_ENABLED` gates are enabled by the coordinator. No flag was enabled here. Visiting a page does not request a quote or schedule inference. The user explicitly asks for an authenticated, no-purchase preview, reviews the current ceiling and opts in. A prompt change clears that consent. Queueing freshly recomputes the quote and exact canonical request identity; a stale/mismatched model/control/price/request/maxhold fails before reservation. Canonical creation and the first-submit fence repeat source-field, actor/project/workspace/moderation, cap, wallet and provider-budget checks. Same actor/key/body replays the same job; changed intent cannot reuse it.

The binary adapter checks the current lease deadline/signal again after the awaited fence. Only MP3 MIME is accepted and both declared/streamed bytes are bounded to8MiB. Real generation receipt and request correlation are recorded separately. Complete binary bytes are saved privately before QC; usage is scalar-only, never a raw response or media body. Accepted/uncertain interruptions retain holds and do not become permission to purchase again.

QC uses the existing authenticated, allowlisted canonical-Storage renderer route/shared heavy gate. Optional `maxAudioDurationSeconds` is an integer1–600, default600 for compatibility; SFX supplies120. The decoder has a one-sample sentinel beyond the cap and rejects a capped/truncated overrun. Actual Storage SHA/bytes, MP3/audio-only codec/container, sample rate/channel count and exact decoded PCM sample duration are checked; no upload metadata or requested duration can substitute. Only the strict bounded proof fields persist.

A valid result becomes a project DRAFT SFX asset/audio row with exact measured duration, provenance and human-review requirement. There is no padding, looping, hidden trim or automatic approval. A source longer than an episode needs an explicitly reviewed ≤60-second timeline window; episode limits are unchanged. Current stored actor, project restriction/archive/deletion and canonical membership are rechecked before promotion; withdrawn access retains the paid private output rather than exposing it or buying another result.

Transient QC retries preserve the accepted job/attempt/output, at most24 retries within2 hours. Invalid audio, changed bytes/ownership or exhausted bounds stop for private attention. Unknown actual charge retains the existing provider budget hold; only an actual generation receipt can reconcile it, never a correlation ID or a fabricated estimate-as-charge.

## New private audio ownership and compatibility

New SFX and Music outputs atomically record indexed `media-output:<storageId>` audit authority bound to exact job/project/attempt/SHA/bytes/kind. Existing image-private binding and current asset ownership are checked, and promotion rechecks storage ownership. This prevents a private output from being adopted by another new audio job or foreign project. Music pricing/route and completed Music assets are unchanged.

Older private Music outputs without this immutable indexed proof stop for manual lineage review. The system does not scan history, fabricate ownership or repurchase them. Existing completed Music asset reads and exact terminal completion replays remain compatible. This is an intentional fail-closed compatibility limit.

## Verification

- `node tests/generation/run-sfx-contracts.cjs`:9 groups; exact body,120s/$0.325 certificate, current price/control/version drift, consent binding, deadline-after-fence, zero retry,8MiB/partial output and exact decoded proof.
- `node tests/generation/run-sfx-recovery.cjs`:11 groups; actual canonical actor/create/fence/receipt/checkpoint/completion handlers, one reservation, private withdrawal, late foreign asset/source changes, cross-kind storage binding and legacy quarantine, one mocked binary POST through429 QC recovery, bounded retries and receipt-only reconciliation.
- `node tests/generation/run-sfx-ui.cjs`:3 groups; actual authenticated read-only preview/queue and component events, no page-visit estimate, explicit reviewed consent and prompt invalidation.
- `node renderer/tests/run-certified-audio-probe-tests.mjs`:8 groups; actual WAV/VBR decode, forged Xing, optional/default PCM cap, invalid bound and overrun rejection.

Music8/13, preparation7, primary voice4, transcript4, image recovery9, continuation6/actor3/realtransport4, Avatar5 and upscale12 regression groups pass. Renderer build, Convex typecheck and targeted source lint pass. Full application typecheck had only another lane's temporary timeline-lineage error during this packet; coordinator runs the frozen integration check. Independent SFX reviewer reran9/11/3 +Music13 +actualPCM8 and found no remaining concrete blocker. A coordinator-approved live SFX call, actual receipt/download and subjective listening remain acceptance gates; no live success is claimed here.
