# Music preparation contract and evidence — 2026-11-02

Status: isolated new worktree packet after checkpoint3's frozen tree; MUSIC flag remains false. No schema/generated edits, deployment, online database mutation or paid generation was used. SFX remains a separate unsupported kind and cannot fall back to music or speech. This packet implements a controlled path; it does not certify a live paid Lyria response.

## Primary-source findings

Read-only public GETs on2026-11-02 returned four audio-output models: `google/lyria-3-clip-preview`, `google/lyria-3-pro-preview`, `openai/gpt-audio` and `openai/gpt-audio-mini`. No dedicated SFX contract was identified. General collection marketing about sound design does not establish SFX request controls or billing.

| Field | Clip | Pro |
|---|---|---|
| OpenRouter ID | `google/lyria-3-clip-preview` | `google/lyria-3-pro-preview` |
| Canonical slug | `google/lyria-3-clip-preview-20260330` | `google/lyria-3-pro-preview-20260330` |
| Advertised fee | $0.04 per30-second clip | $0.08 per song |
| Endpoint provider/tag | Google AI Studio / `google-ai-studio` | Same |
| Observed endpoint status | `0` | `-5` |
| Live token pricing | prompt0 / completion0 | prompt0 / completion0 |

Those token-zero fields do **not** mean free music. The APIs expose no structured song SKU. A pinned reviewed fixed-song contract and actual receipt reconciliation are therefore mandatory; never reuse generic character/token arithmetic. The exact canonical version, provider, status, published price sentence, modalities, parameter surface and complete expected pricing keys are checked. Changed facts fail closed.

Sources: [audio-output catalog](https://openrouter.ai/api/v1/models?output_modalities=audio), [Clip endpoints](https://openrouter.ai/api/v1/models/google/lyria-3-clip-preview/endpoints), [Pro endpoints](https://openrouter.ai/api/v1/models/google/lyria-3-pro-preview/endpoints), [Clip model/price](https://openrouter.ai/google/lyria-3-clip-preview), [Pro model/price](https://openrouter.ai/google/lyria-3-pro-preview).

OpenRouter audio output uses Chat Completions, `modalities:["text","audio"]`, `audio` configuration and `stream:true`; fragments appear in `delta.audio.data`. A final accounting chunk may repeat the terminal reason. HTTP200 can still contain a stream error. Google AI Studio is explicitly listed as not supporting billing cancellation by aborting the connection. [Audio protocol](https://openrouter.ai/docs/guides/overview/multimodal/audio), [streaming/errors/cancellation](https://openrouter.ai/docs/api_reference/streaming).

Google's current music documentation describes fixed30-second Clip output as MP3 and44.1kHz stereo; OpenRouter's pinned preview description says48kHz stereo. The output certificate therefore records the actual measured44.1/48kHz rate. Google's current full-song example names Lyria3.5; this packet never substitutes that model for OpenRouter's Pro preview. Google documents prompt safety filtering, SynthID marking and restrictions around specific artist voices/copyrighted lyrics. Generated text is retained as authored structure/lyrics metadata, never claimed as a measured transcript or timed caption track. [Google primary documentation](https://ai.google.dev/gemini-api/docs/music-generation).

A model-specific OpenRouter example proving whether Lyria requires an `audio.voice` field was not found. The candidate request deliberately supplies only `audio:{format:"mp3"}`; it does not invent a speech voice. This remains an explicit controlled live-acceptance question before enablement. OpenRouter's public OpenAPI JSON returned403 to this unauthenticated research request, so it supplied no additional evidence.

## Frozen route, quote and bounds

`PreparationKind` adds `MUSIC` and `SFX`. `preparationModel('SFX')` denies before any catalog read, reservation or provider request. MUSIC resolves centrally through `MUSIC_GENERATION` / logical `music`, `PREPARATION_MODELS.music`, `OPENROUTER_MUSIC_MODEL`, and `REVIEWED_OPERATION_CONTRACTS.music`. An override outside the reviewed Clip ID fails certification. `FINALFRAME_MUSIC_PREPARATION_ENABLED` must equal`true`, alongside existing preparation/generation flags, both at creation and immediately before submission; default is false.

Certificate `LYRIA3_CLIP_FIXED_SONG_V1`: exact model/canonical slug/provider/endpoint fingerprint, `sku:"song"`, quantity1, nominal30seconds, MP3, advertised$0.04 and conservative provider reservation$0.052. Fresh catalog certification is at most30seconds old at creation and fence. The reservation is not an upstream-enforced per-request spending ceiling; a higher authenticated receipt is recorded and existing provider-budget logic pauses an overrun rather than hiding cost.

The request is text-only,1–4000characters, one output, fixed Clip duration, no voices/references/images/clone/format/duration controls. POST only to pinned`https://openrouter.ai/api/v1/chat/completions`, with provider.only`google-ai-studio`, allow_fallbacksfalse, no model/provider fallback or automatic POST retry. Decoder/transport bounds:180seconds,3MiB decoded MP3,5MiB total SSE,64KiB generated text,4096events. Redirects denied. Parser checks split UTF8/CRLF, multiline SSE data/comments, canonical base64, consistent generation ID/model, single choice, completed stop+DONE, mid-stream errors and post-terminal payload; it cancels the reader after DONE. Usage is reduced to bounded numeric accounting fields. Generic deterministic mock options cannot accidentally invoke this transport; tests inject synthetic fetch streams explicitly.

## Durable authority and recovery

Reuse existing generationJobs, credits/provider reservations and canonical project ownership. The server checks the live certificate, actor/membership, flags and exact sufficient reservation in the same `fenceSubmission` mutation before POST. Idempotency binds MUSIC project/actor/body/route/certificate version; changing the text or caller cannot replay another reservation. Music never uses `providerJobId`: chat generation IDs belong in `providerRequestId`, preventing accidental video-poll recovery.

1. Persist `recordMusicAcceptance` for the exact validated generation ID when headers/first event arrive.
2. A complete bounded stream is stored privately in canonical Storage. `recordMusicOutput` checkpoints its exact Storage ID/raw SHA/size, model/generation identity, complete-stream marker and bounded authored text in `response.audioOutput` **before** technical QC. No library asset is exposed at this stage.
3. Claim/recovery recognizes only this complete exact checkpoint. It resumes AUDIO_QC with the same paid attempt, including after flag/actor changes. Probe retries or lease expiration never invoke catalog lookup or generation again. Retry/expiry paths are bounded to24 QC recoveries with at most60-second backoff; exhausted or invalid results retain private bytes for reconciliation.
4. Existing authenticated isolated renderer `/media/probe` checks actual downloaded bytes/SHA and decoded sample duration, MP3/no-video, stereo,44.1/48kHz, and nominal30seconds within100ms. The observed duration is recorded without silently trimming. HTTP429/QC failures retain the checkpoint.
5. Exact completion creates a project-owned AI asset with MUSIC role and an audio.kindMUSIC row. Technical evidence is retained; human review/approval remains required before timeline use. Accepted paid output can be retained privately under later access restrictions; current canonical project/media authority still governs exposure and subsequent use.

If a stream was submitted but no complete output checkpoint exists, existing RECONCILIATION_REQUIRED preserves the provider budget hold and prevents another POST. A known chat receipt can reconcile metadata costs while the job remains incomplete; it does not invent the missing audio. A crash after Storage accepted bytes but before the checkpoint mutation can leave orphaned private bytes and requires operator reconciliation. No automatic paid replay is used to repair this window.

Receipt lookup is metadata-only, exact-generation/model-bound, with64KiB response cap, five bounded attempts and existing exactly-once provider-budget settlement. Unknown cost retains the reservation. A suspicious zero/below-advertised MUSIC receipt remains held for operator review; it does not turn token-zero catalog fields into a free song. Existing TTS receipt semantics remain unchanged.

## Local checks and remaining gates

- `node tests/generation/run-music-contracts.cjs`:8 groups, synthetic metadata/SSE. Exact positive fixed-song certificate, changed version/provider/status/fees denial; SFX no-fetch; split framing/base64/Unicode; error/EOF/model/receipt/size denials; terminal reader cancellation; one fenced pinned POST and no fallback/retry.
- `node tests/generation/run-music-recovery.cjs`:10 actual-handler groups, in-memory auth/budget/storage. Default flag/SFX deny before holds,52,000-micro reservation and actor/body idempotency, atomic fresh actor/budget/certificate fence, incomplete accepted hold/no video poll, immutable private checkpoint, QC resume after revocation/flag change, strict probe/SHA promotion, bounded failure/expiry, and actual preparation worker mockSSE→one Storage save→renderer429→resume with exactly one provider POST.
- `node tests/generation/run-music-receipts.cjs`:2 actual receipt/provider-budget groups: completed and incomplete stream receipts settle once; wrong model/ID/zero cost preserves the hold; no generation call.
- Coupled existing preparation, primary-voice, transcript, studio-fence, accepted-source and operation-control suites are rerun, together with app typecheck and targeted ESLint. Fixture loaders now import the actual new music contract, without weakening old guards.

These tests make no real network, database or paid provider calls. No live music quality, exact OpenRouter MP3/voice behavior or actual charged receipt has been certified. Coordinator must deploy readers with flagfalse, review this pinned contract, then separately authorize one tightly capped original prompt, inspect actual stream/MP3/decoded duration/receipt and project approval/timeline use. Pro/SFX remain unavailable. Disable only the music flag to stop new music submission; retain accepted private outputs, queued QC, receipts and reservations. Do not delete jobs/reset budgets or repurchase to recover an interrupted accepted result.
