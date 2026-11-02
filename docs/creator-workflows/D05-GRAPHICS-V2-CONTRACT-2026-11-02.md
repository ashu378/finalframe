# D05 deterministic graphics, layout2

Implementation checkpoint, not online or creative certification. No schema changes, paid calls, deployment, cloud database writes, F06/MUSIC changes or git staging were performed by this packet. Root owns deployment, flags, online verification and rollout. Existing approved manifests and exports remain retained.

## Reader and authoring contracts

`FINALFRAME_GRAPHICS_V2_ENABLED` is false by default. New authoring also requires `FINALFRAME_MANIFEST_V5_ENABLED=true`. This packet never changes either live flag. Four legacy templates retain their existing renderer path when `props.layoutVersion` is absent. Responsive graphics opt into `layoutVersion:2` in v5; new template IDs are `product-ui`, `bar-chart`, `explainer-steps`.

The shared pure graphics parser is closed by template. It rejects unknown fields, arbitrary CSS/HTML, control characters, nonfinite values, oversized copy and invalid frame/geometry ranges. Text is not rewritten or truncated. At browser layout preflight, every complete text block must fit its bounded area at12px or larger; otherwise render fails before a valid final artifact. Arial/Helvetica system fallback is measured by that actual browser. This is a browser render preflight, not a speculative server font measurement.

- Shared fields: exact title<=240, supported optional text/colors; colors are six-digit hexadecimal. Responsive legacy title/brand/feature/CTA cards expose exact brand, eyebrow, subtitle, feature/detail/index and call-to-action/destination fields where rendered. CTA requires explicit text, not an invented default for new authoring.
- `product-ui`: exact `screenAssetId`, `screenFit:'contain'`, optional normalized `focus:{x,y,width,height}`, optional `cursor:{fromX,fromY,toX,toY,clickFrame}`. Bounds are inside the supplied screenshot and exact clip frames. The screenshot's actual aspect ratio controls containment and overlays; its interface pixels are not fabricated or cropped. A UI card binds one image. Use a separate brand card for a logo; simultaneous screenshot+logo is rejected explicitly.
- `bar-chart`:2–8 `{label,value}` rows, label<=40, finite values0–1e9; optional unit<=24 and source note<=200. Every bar shares zero baseline; decimals are displayed with their exact JavaScript numeric value, without rounding. All-zero input remains all-zero. User values/source notes are not a factual verification certificate.
- `explainer-steps`:2–4 steps, heading<=80 and optional detail<=180. Active step advances on exact clip-relative frames, or an explicitly bounded fixed step may be supplied. No arbitrary diagrams/scripts/icons are accepted.

A screenshot/logo resolves through the existing `timelineClips.assetId`; `metadata.graphicAssetRole` distinguishes screen/logo. `graphicsAssets.resolveGraphicImage` privately checks same project/studio, project scope, active/checksummed image, current actual Storage SHA/size/MIME equality, canonical approval, and explicit rights/provenance/moderation denials. Creation, graphic editing and the image picker share this resolver. Assembly removes caller URLs and resolves `screenUrl`/`logoUrl` from the bound canonical asset. Worker source policy enumerates both nested URLs. Timeline import and reassembly preserve the typed values and single asset lineage. No new movie authority or source-map representation is introduced.

## Editing and interface

`timeline.graphicsCapabilities({projectId}) -> {enabled}` exposes the actual server flag after project authorization. `timeline.graphicsImages({projectId}) -> {enabled,canEdit,images:[{id,name}]}` examines at most201 recent project asset rows and selects only currently valid approved images. The editor labels a retained image outside the selectable list as a current image that may require reselection; it never silently changes it to “No logo”.

`timelineEditor.getDraft` adds `graphicsV2Enabled`. `timelineEditor.apply({timelineId,kind:'updateGraphic',input:{clipId,graphic:{templateId,props,logoAssetId?,screenAssetId?}},idempotencyKey})` creates a new timeline and records the complete operation. It preserves the previous version, timing, captions, transitions and independent soundtracks. Same-key replay binds the exact source timeline and complete graphic body; changed bodies fail. Locked versions and viewers cannot create edits. A previous responsive graphic cannot bypass this complete validator through legacy `updateText`. Legacy graphic text edits now persist into canonical `metadata.templateProps` instead of a transient discarded object.

The composer exposes typed controls for exact copy/colors/CTA, owned image selection, normalized focus/cursor, data rows and explainer steps. It preserves authored output dimensions/FPS. The edit surface revises saved graphic content through the same controlled form. New controls remain hidden while the server flag is false. Completed output uses the existing ordinary Preview/review/download flow; no new live canvas/player dependency or automatic AI choreography was added.

## Reader rollback and durable completion

Public worker `/health` advertises `graphicsLayoutVersions:[1,2]` and exact `motionTemplateIds`. The matching backend fence is owned/reviewed separately by the independent reviewer: it must check required layout/template capability before each unaccepted dispatch/retry, then require a matching202 ACK. A durable no-resubmit barrier is written before POST. Every non202/malformed ACK/network outcome after that boundary remains ambiguous, including proxy503/429/409 responses; it retains work rather than resubmitting. Only pre-POST health failures use bounded retries.

New v2 requests derive **`graphicsCertificate`** exclusively from their frozen request:

```
{layoutVersion:2,manifestId,templateIds:sortedUniqueIds,jobId,leaseId,attempt}
```

The202 ACK and persisted CompletionRequest contain the same exact proof. Completed and failed callback payloads carry it inside the HMAC-signed raw body. Backend completion must require that certificate for every layout2 manifest, including responsive versions of the old four IDs; this prevents an old worker's callback from promoting a result before/missing ACK. Both completed and failed v2 events require the proof before receipt/state writes; an uncertified failure cannot clear an unknown lease into retry. Unknown requests without an ACK/acceptedAt can apply a valid proof under the live lease; later delivery stays private for operator reconciliation. The audio ABI remains `finalframe-media-pcm-v1`; it is not a graphics certificate. Legacy/v1 transport remains unchanged.

Outbox restart replays the original event/body/signature and upload receipt. Old retained outbox records lacking this proof are never upgraded or rerendered to manufacture one, even when the same payload reaches a newer worker. Such accepted ambiguity stays private for reconciliation. No schema field is required: the exact manifest/lease and stored signed body retain the authority.

Rollout: deploy reader/callback fence and renderer first, verify health +actual ACK/callback proof, then deliberately enable authoring. Rollback: disable the authoring flag first and retain compatible callback/outbox readers for pending v2 work. An incompatible old worker must be rejected by the capability fence; do not revert the backend below that fence while v2 attempts remain unresolved. Existing legacy exports continue to read. No resource limits or host concurrency are raised.

## Verification

Local no-cost checks:

- Pure graphics contracts/geometry:11 groups.
- Actual registered authoring/edit/import/assembly handlers:11 groups, including flag-off legacy behavior, project/approval/lock checks, MIME/SHA/rights/provenance/moderation denial, immutable revisions and exact replay.
- Actual React SSR:6 groups for forms, exact values, flag-off UI, retained output controls and role denial. This does not claim browser interaction acceptance.
- Actual Chromium/Remotion/FFmpeg:8 groups,30 stills:7 templates ×3 aspect outputs (320×180,1080square,1080portrait), actual screenshot corner fidelity, title reveal, chart zero/decimal glyph differences, cursor click frame, exact explainer step boundary, complete-text overflow rejection.
- Actual3s/90frame graphics-over-video PCM export retains native440Hz, independent220Hz music and3 original click onsets within2ms, with exact audio duration.
- Real local HTTP:3 groups for advertised capabilities, derived202 certificate ignoring forged input, same HMAC-signed failure certificate and unchanged legacy ACK. Deliberately missing lock metadata fails before Chromium/encoding/upload in this transport test.
- Durable certificate delivery:4 groups for signed completed proof, exact callback outage/restart with one upload, and refusal to fabricate a proof for an old retained result. These original byte fixtures are not encoded-video evidence.
- Existing finishing backend7, renderer suite and transfer/outbox14 passed. App/Convex/renderer TypeScript and targeted ESLint passed at the recorded stable packet; coordinator-owned dispatch/runtime changes require their own final combined checks.

Latest actual media evidence: `/tmp/finalframe-graphics-v2-h1pNWV/RESULTS.json`, stills and `graphics-native-music.mp4`. No personal recordings, provider generation, paid requests or cloud media are used. Independent review closed green: reviewer reran image11/UI6/workerHTTP3/outbox4, and author independently reran/reviewed backend handshake/callback9 including uncertified FAILED and crash barriers. Online ordinary-authoring/browser/download and creative/readability review remain coordinator gates; local fixtures do not certify an arbitrary supplied brand, real product UI, factual chart or polished explainer campaign.
