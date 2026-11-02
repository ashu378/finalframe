# F06 durable recipe execution — 2026-11-02

This packet adds an opt-in execution path for the eight existing creator types. It does not establish paid provider acceptance or creative fidelity. Both `FINALFRAME_RECIPE_ENABLED` and `FINALFRAME_RECIPE_WORKER_ENABLED` default to false. Existing page visits and `productions.approvePlan` do not purchase or schedule recipe work.

## Binding and authority

`recipeProposals` captures the exact canonical draft snapshot hash and logical sequence/scene/shot addresses before plan approval. A separate post-approval run transaction resolves those addresses to the current approved production version and exact materialized shot descriptors. The approved snapshot is never patched with a recipe/run hash. Descriptor checks repeat at estimation, admission and first provider submission; deleting or changing a materialized shot cannot replace the reviewed prompt.

Runs hold a bounded authored recipe (128 KiB), canonical context (512 KiB), and immutable compiled-plan identity. Nodes are initialized in batches of 16, up to 192; each abstract node request is at most 128 KiB. Resolved source/model bindings are stored separately and become immutable before dispatch. Raw Storage/asset lineage remains available for actual fences, while pure recipe byte identities normalize canonical SHA-256 base64/hex equivalently.

Scheduled execution resolves the actor recorded on the run through the same canonical user/studio/project role, tombstone, moderation and lifecycle policy as public calls. It never fabricates a browser identity. Private job factories accept only validated stored run/node authority. No public actor override was added.

## Spend, retries and existing work

Estimates distinguish **stage** provider/credit ceilings from **cumulative** ceilings including already admitted work. Start requires the exact estimate ID/hash and both reviewed cumulative totals. Unresolved future paid work is explicitly blocked; the response is `READY_STAGE_ONLY`, never a zero-price whole-run promise. Quotes expire after 30 seconds, and existing operation-specific provider fences still recheck prices, controls, source certificates and the canonical provider budget before the first POST.

Job creation, the existing wallet reservation, existing global provider reservation, and run-cap allocation occur in one mutation. No second credit ledger was introduced. Every canonical effect executes in its own transaction; an action records a sanitized failure only after that transaction rolls back. A budget refusal cannot leave a partial take, job, wallet or allocation.

A run uses a run-scoped execution key while retaining its immutable compiler identity. Exact current approved completed takes/assets are reused; queued/accepted work is linked for observation/reconciliation. Admission repeats this lookup atomically, preventing two concurrently estimated runs from purchasing the same work. Existing same-shot history without sufficient proof pauses for explicit regeneration review. Deliberate fresh takes require a reason and a newly reviewed estimate. Existing accepted or ambiguous work is never automatically repurchased.

Cancellation releases only the originating job that certainly has not crossed its provider fence. Reused jobs belong to their original run. Accepted work continues through its existing polling/reconciliation path and can retain its private completion after actor/source revocation. New local effects and exposure still require current authority. A 24-hour recipe observation bound ends in needs-attention without pretending accepted work failed or completing it falsely.

## Human review and canonical output

Prepared assets, transcripts, takes, beat maps, caption plans and timelines use existing `resourceStates` and `approvals` events. Automation can request `IN_REVIEW`; it cannot approve or lock resources. Timelines require an actual owner review and lock. Final export requests use the existing exact-manifest review and render/export factories.

Dynamic reference slots must already be present in the approved shot metadata. Their grants bind the exact run/node/shot/version/slot and a completed same-project prepared asset, provenance, raw checksums and Storage bytes. They are rechecked before reservation and first POST. The creator panel saves these explicit slots only in a draft through the existing shot-edit mutation.

Visual source windows preserve exact frame-derived trim and native-audio policy. New explicit trims/volumes require a current authoritative project-video probe; asset duration metadata cannot certify the range. Source checksums are verified against actual downloaded bytes. The authenticated worker's video probe now returns its verified digest and `hasVideo`, matching the existing audio certificate transport.

Recorded narration is local and preserves the selected approved recording window. Generated narration uses the existing approved voice/current consent/explicit primary sample contracts. It is measured before placement and stops if it overruns the picture. There is no synthesis fallback for a recording.

Caption cues come only from actual timed transcript segments or explicit human-authored reviewed cues. Text-only transcription stops at `CAPTION_TIMING_REVIEW_REQUIRED`; the panel provides timed-cue entry and canonical caption review. Beat maps receive a canonical project resource type and source/grid/algorithm validation; manual correction and explicit selection are available without changing D03's existing manual apply workflow.

Structured graphics preserve the four actual templates' exact supported text, CTA, six-digit colors, and canonical logo asset binding. There is no arbitrary JavaScript or chart template claim. Motion-graphics-only work remains local. Assembly/render/download continues through the existing canonical v5 pipeline and authenticated stored-output checks.

## Creator surface and remaining explicit stops

The flag-gated storyboard/takes panel saves instructions before plan approval, previews/resumes runs, shows stage and cumulative caps, requires explicit consent/start, surfaces real review decisions, supports approved-source measurement/manual caption timing/manual beat corrections, and resolves completed downloads through `reviewExport.getExport`. Page rendering subscribes to read-only queries only. Legacy approved plans without a captured proposal retain their manual workflow.

The eight builder choices produce strict logical recipes, not eight claims of paid end-to-end acceptance. Generated footage still needs a compatible reviewed model route. Recipe automation currently certifies ordinary `GENERATE` footage; existing ordinary UI operations such as Avatar/edit/upscale/continuation retain their own separately tested contracts and are not silently converted into generic recipe generation.

A trimmed/long recording requested for transcription stops at `RECIPE_AUDIO_RANGE_EXTRACTION_REQUIRED`; prepare a complete selected recording of at most 60 seconds. Text-only transcripts require manual cues. Music analysis does not claim automatic beat-cut editing: precise cuts remain an explicit canonical timeline-editor operation. Unsupported masks, performance-transfer controls, uncertified model controls, uncertain history and unavailable quotes remain hard stops. F06 does not certify real personal identity, provider creative fidelity, chart/SaaS UI templates, or a newly paid acceptance receipt.

## Local evidence

- `node tests/recipes/run-recipe-compiler.cjs` — 20 pure contract groups.
- `node tests/recipes/run-recipe-binding.cjs` — exact logical/snapshot/materialized binding.
- `node tests/recipes/run-recipe-actor.cjs` — actual canonical stored-actor policy.
- `node tests/recipes/run-recipe-backend.cjs` — 17 actual-handler/canonical-helper groups, transactional in-memory Storage/auth seams.
- `node tests/recipes/run-recipe-ui.cjs` — 4 executable creator/component groups: eight builders, read-only render, exact stage/cumulative consent, recorded narration.
- `node tests/production-edit/run-beat-analysis.cjs` — 12 groups, including actual canonical stale-alias/foreign-legacy claim and commit denial.
- `node renderer/tests/run-video-source-certificate-tests.mjs` after renderer build — strict canonical base64 digest/byte/hasVideo transport and changed-source denial.

The backend/component tests use no deployment, live database, paid provider call or browser session. Existing operation, preparation, music, finishing, finance and delivery suites remain separate compatibility evidence. Coordinator-owned codegen, isolated build/deployment and live authenticated acceptance remain required before enabling the flags.
