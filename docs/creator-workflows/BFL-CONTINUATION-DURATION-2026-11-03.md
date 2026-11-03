# FLUX3 continuation duration intersection — 3 November 2026

The generic OpenRouter FLUX3 catalog advertises5–20 seconds, but this list spans several operations. It is not a continuation-specific contract. Current primary [BFL OpenAPI](https://api.bfl.ai/openapi.json) `Flux3VideoV2VInputs.duration` permits whole seconds5–15 (or native `auto`); [BFL's overview specification](https://docs.bfl.ai/flux_3/flux3_overview#specifications) separately lists text/image generation5–20 and continuation5–15. FinalFrame's normalized bridge uses explicit integer duration and does not expose native `auto`.

Read-only official GET evidence was refreshed3 November and retained under `/tmp/finalframe-complete-acceptance/continuation-duration-contract-20261103/`: native OpenAPI, overview Markdown, OpenRouter catalog and extracted `verified-bounds.json`. Current OpenRouter model/canonical version is `black-forest-labs/flux-3-video` / `black-forest-labs/flux-3-video-20260804`; its dedicated catalog still advertises5–20.

`src/lib/ai/video-routing.ts` now centralizes the reviewed provider/model/operation duration intersection in `REVIEWED_VIDEO_OPERATION_DURATION_BOUNDS`. `supportedVideoOperationDurations` preserves catalog order and narrows only OpenRouter FLUX3 `EXTEND` to5–15. Both direct continuation quoting and route eligibility apply this intersection. A catalog-unadvertised duration is never added merely because the upstream mode accepts it.

The canonical create/fence already consume these shared route/quote functions. New16/20-second continuations fail before either reservation. An older unaccepted16-second frozen quote fails the fresh submission fence even if it carries enough funds and the same catalog fingerprint. Already accepted exact jobs retain their existing reconciliation/polling path, with no additional reservation or POST. Ordinary `GENERATE` remains5–20; other model/provider contracts, source requirements, audio/framing controls, billing units, price calculation, fingerprints and certificate shape are unchanged. Existing valid5–15-second quotes remain compatible; the restrictive rule is rechecked at first submission.

The current shot workspace has no operation-specific duration selector: duration belongs to the approved canonical shot. Global production-length controls cannot be capped at15 without changing ordinary generation. The central duration helper is available to catalog-backed selectors; an out-of-bound approved continuation shot requires a revised plan rather than silent clipping, padding or a different model. No new UI path or feature-local model hardcode was added.

Verification:

- `node tests/generation/run-continuation-certificates.cjs`:8 groups, including5/15 quote+route acceptance,4/16/20/noninteger denial, unchanged16/20 ordinary generation, catalog intersection, actual canonical create with zero reservation on invalid continuation, old queued16s fence rejection and accepted-job reconciliation preservation.
- Continuation real transport8 and stored actor3 pass; upscale12, Avatar5 and source-edit8 regressions pass.
- `node tests/ai/run-video-routing-tests.cjs`: both general eight-video-type checks pass. Its temporary adapter harness only gained mappings for existing image-response/submission-diagnostic imports; assertions are unchanged.
- Full application and Convex typechecks and targeted route lint pass.

This fixes an independently verified admission/certification gap. It does **not** prove the cause of the earlier live5-second HTTP400, certify a15-second paid continuation, or authorize a retry. No live DB mutation, inference, paid call, route review, flag change, deployment or Git operation was performed by this packet.
