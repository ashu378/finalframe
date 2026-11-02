# Launch completion contracts

Approved implementation: 2 November 2026. **Owner steering: email verification, reset delivery, and payments are last. Leave their current flags disabled.** OpenRouter is the only AI gateway. Existing $10 working / $15 cumulative absolute testing limits remain. Only root/coordinator deploys, changes shared schema/generated files, or authorizes a paid call. No local database, Yafpay changes, destructive migration, or budget reset.

## Canonical authority

- Project CRUD owns lifecycle and membership; `productions`/`productionVersions` own planning and blueprint approval; `resourceStates`/`approvals` own resource decisions. Approved versions never change; edits create versions.
- All production media resolve to the same project. Global reuse requires explicit import. Account/studio ownership never grants platform administration.
- Existing durable jobs, reservations, provider receipts, leases and idempotency remain authoritative. Do not introduce a second submission/planning path. Templates are authored starting briefs, never fake generated outputs; template projects use canonical project creation.
- Only an implemented control, authorized persisted effect, appropriate failure tests, genuine output and browser journey can complete a release entry. Existing 19 exports are regression evidence, not blanket feature approval.

## Finishing protocol

- v4 remains readable/renderable. v5 adds explicit transitions/caption/composition semantics; deploy compatible readers before new writers. Root owns manifest/schema changes.
- Heartbeat POST `/renderer/heartbeat`: signed raw JSON `{version:1,eventId,jobId,projectId,attempt,leaseId,occurredAt,stage,progress?}`. Stage is `RENDERING | UPLOADING | CALLBACK_PENDING`. Use the existing worker-secret/raw HMAC headers; timestamp skew <=60s. Worker cadence 30s, timeout10s.
- Internal renewal validates enabled worker, accepted job, exact project/attempt/lease, nonterminal status, unexpired lease and maximum2h attempt wallclock. Extend for5min without resetting startedAt; return `{leaseExpiresAt,cancellationRequested:false}`. A correctly authenticated heartbeat awaiting the dispatch acknowledgement returns retryable HTTP425 and grants no lease authority; the same event may succeed after acknowledgement. No public browser renewal authority.
- Completion outbox retains exact event/body, accepted upload result and callback idempotency. Retry transfer/delivery, not successful rendering. Stream uploads, pin destinations, disable redirects, bound all network waits. Persistent outbox required before production outage acceptance.
- Older callback bodies can be delivered with fresh signed headers: `x-finalframe-delivery-timestamp` ISO and `x-finalframe-delivery-signature = HMAC(secret, timestamp + '\n' + rawBody)`. Raw-body signature is still required. Signed delivery freshness <=60s. Within the original accepted attempt's2h recovery window, completion may reconcile an expired lease only against its unchanged project/job/attempt/key/lease, actual stored video and checksum, without a newer attempt. Expiry retains that authority and payload rather than automatically rerendering. After2h keep NEEDS_ATTENTION and artifacts, without granting renewed authority. Only an exact already-applied receipt may be acknowledged within24h with fresh delivery proof, with no new side effects. Without verified delivery headers retain the existing10min body window.

## Operation controls

- GENERATE/FRAME_TO_VIDEO/edit/appearance/object/performance/lip-sync/extend/upscale have operation-specific required references. Portrait+audio lip sync must not inherit the generic video-edit input requirement.
- Continuation source is an authorized completed generation from the same production/project/provider/model with an approved or locked take. Revalidate at create and submission fence. Never trust a caller's invented provider-job/model relationship.
- Upscale factor/mode inputs must reach the canonical job unchanged and match current certified catalog controls and bounded pricing. UI ranges alone do not certify a paid route. Unsupported masks/pricing stay failclosed until implemented.

## Ownership and first wave

1. Application agent: template/preset catalog, canonical project helper, starting-mode propagation, legacy editor redirect, packet tests. Root alone owns schema/auth/platform separation.
2. AI agent: workspace operation controls/actions, generation public validation, history and upscale controls, generationJobs create/fence invariants and tests. No shared schema writes.
3. Finishing agent: renderer streaming transfer/outbox/callback sender, runtime cache and narrowly isolated composition memoization, tests. Root owns Convex heartbeat and manifest/schema.
4. Coordinator: acceptance checklist, contracts, schema, heartbeat, integration, review, online tests, deployment and budget.

All subsequent packets are checked against the release checklist. The owner selected `peterboris2020@gmail.com` for initial platform ADMIN, after authorization tests pass; resolve its existing stable user ID and use the audited server-only bootstrap. The owner has no personal voice/performance/portrait fixtures yet. Use original synthetic fixtures and leave personal identity/voice likeness unverified. Missing owner media, email credentials, policy approval, provider access or budget are explicit blockers; unrelated work continues. No personal clone acceptance using unconsented recordings. No paid submission during packet implementation.

## Frozen v5 reader shape (second finishing packet)

- RenderManifest.version accepts1/2/4/5; the default current writer stays4 until `FINALFRAME_MANIFEST_V5_ENABLED=true`. No reinterpreting v4.
- Add optional `trackId` to visual items and audio tracks. Add optional `tracks: {id,kind:'VIDEO'|'IMAGE'|'GRAPHIC'|'AUDIO'|'CAPTIONS',orderIndex,name?}[]`.
- v5 `transitions?: {id,fromItemId,toItemId,kind:'DISSOLVE'|'FADE'|'WIPE'|'SLIDE',durationInFrames,audioPolicy:'PRESERVE'|'CROSSFADE'}[]`. CUT means no transition. Existing adjacent logical clips overlap by exactly transition duration; length reduces accordingly. References must exist on same visual track, adjacency/order must be valid, overlap <=half either clip and <=2s, no unsupported overrun. UI/assembly must create a new retimed timeline version, never alter approved inputs. Preserve audio by default; crossfade is explicit.
- CaptionTrack retains existing `id,language,cues[{id,startFrame,durationInFrames,text,speaker?}],style?`; v5 style allows only validated font size/color/background/position/max-lines values. Captions are frame-timed and burned into the export, with SRT/VTT sidecars from exact same cue versions. Selections clip/rebase cue times, movie components offset them.
- Finishing agent owns renderer types/manifest/assembly-plan/composition/readers and local rendering tests for these v5 fields. Coordinator owns Convex authoring, timeline roundtrip, assembly writers and schema. Readers accept v5 before gated new writers. Agent must report serializer normalization changes to coordinator.
- Visual VIDEO/IMAGE/GRAPHIC tracks may contain mixed visual item kinds. A transition still requires the exact same visual `trackId`; AUDIO/CAPTIONS lanes cannot contain visual items. v5 caption style keys are exactly `fontSize` (integer12–120px), `color` (#RRGGBB), `backgroundColor` (#RRGGBB or #RRGGBBAA), `position` (TOP/CENTER/BOTTOM), and `maxLines` (integer1–4). Complete cue text must fit readably; shrinking to12px is permitted, truncation/line-clamping is not.
