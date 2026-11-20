# Biscuit-shot action repair — 20 November 2026

## Outcome and scope

The center man now has timed closed-lip jaw/cheek chewing before the grandmother asks her question. This is a **localized deterministic animation repair of the existing cartoon drawing**, not a successful AI-provider acting repair. Existing characters, clothing, framing and original voices are retained. The original approved export and rejected take remain saved.

Measured speech: denial ends around4.735s; grandmother starts around5.751s. The initial repair instructions wrongly assumed4.25/5.0s. The repaired action runs4.79–7.25s with three chewing cycles before the question. Contact-frame review shows alternating jaw/cheek movement and closed lips at4.875,5.208 and5.542s. This is an explicit visual review, not an automatic semantic-detection claim.

## Delivery

- Project: `kn75m9wtdfk6m5xqpccgtt0xjd8jkyhw` — Three voices · cartoon conversion.
- Production: `kh73wxev87v2nbgn3y47dhw1h58jj168`.
- New immutable approved version: `kd708y64d48hwrhpyfkht83c1h8jjrgf`.
- Imported edited asset: `j9727xrs7zv1vdtcppx8eqth2d8jk6tg`; actual uploaded edit, no invented provider/model/job.
- Reviewed and locked take: `m17egzz0qmxxh1615v8hbjxdmx8jkxt5`.
- Timeline: `s577f4wahv8zkxyj5nwdft7mqs8jjq5x`.
- Manifest: `q57671tf74h0dwj27q0s77g7mx8jjb5k`.
- Render: `r5703rb4q3wxaw7a5jxrtkkp8s8jjb82` — COMPLETED 100%, one actual asynchronous worker render.
- Final storage URL: https://knowing-snail-785.convex.cloud/api/storage/87520cbf-86ad-4258-aea7-d45b77ba6c04.
- Final SHA256: `0a5705bc2b7f79dd8b92fc0023ee4df0a54230064e285b12b1f3a047cb51a7a2`.
- H.264/AAC,1280×720,24fps,195frames,8.125s. Chrome playback reached8.125s/ended with no media error and muted=false.

The locally repaired input copies the original AAC stream unchanged: decoded audio equality=true. Renderer export re-encodes AAC; envelope correlation0.9999636469, identical decoded sample count, best lag0. All three voice windows exceed0.99993 correlation. Voices were not resynthesized. Re-encoding means final exported samples are not bit-identical.

## Application checks added

Code revision `9ff131e`. Additive `storyActionReviews` table deployed to existing online Convex `knowing-snail-785`; no local database. Vercel deployment `EmWNgTHAMHdwaob3DQsCpq9WQj6M` reports successful deployment of that revision. Renderer code unchanged.

- Planner emits bounded, timed observable story actions; generation instructions retain them.
- Take approval/locking and assembly require a passing action review for the exact asset checksum, prompt and requirements.
- Missing, failed, late or stale observations block approval. A completed file or spoken words alone do not pass.
- Reviews retain actor, evidence and times; approved reviews cannot be overwritten. Project/role guards apply.
- The UI explicitly requires a human review; it does not claim automated action recognition. Saved observations survive reload and remain visible read-only after locking.
- Explicit uploaded-edit import creates a separate take with lineage and no fake provider receipt; project-owned approved video and editable shot required. Idempotent duplicate import returns the same take.
- Historical plans without action contracts remain readable; they are not retrospectively certified.

Ordinary authenticated UI saved the repair review; reload showed the saved times/evidence and later LOCKED state. Live online approval of the first failed provider edit was rejected with STORY_ACTION_REVIEW_REQUIRED. Browser screenshot of the review was unavailable because the in-app viewport reported zero width; final playback was verified in Chrome instead.

## Tests

42 focused contract groups PASS: story-action/import 14, source-edit 3, shot-duration 9, operation-controls 16. Typecheck, scoped ESLint, production build and strict Convex deployment pass. Persisted repair, failed-approval and successful-review/export checks ran against online Convex. Contract harnesses are pure in-memory seams, not a local database.

## Cost and unresolved provider request

- First FLUX edit cost $0.2376 and FAILED visual chewing review; retained as rejected evidence.
- Second FLUX submission returned HTTP 503 without a provider job ID. Job `js7fkh7x33sjkbbmf1eb2rxqcx8jjwr6` remains RECONCILIATION_REQUIRED with $0.293501 held; no automatic or blind resubmission.
- Available browser request history did not expose even the known accepted video, so it cannot establish whether that ambiguous request was accepted. No hold was released on absence of evidence.
- Final repair and renderer used no additional AI purchase.
- Current-key usage $8.374382303 of its $10 cap. Known historical aggregate $16.869377544; older holds $0.618903 plus new hold $0.293501 = conservative total $17.781781544, below owner ceiling $25.
- 500 internal test credits granted through the existing audited server-controlled operation; no payments or provider cap increase.

## Evidence

Directory: `/home/ashuboris/.codex/artifacts/finalframe/chewing-repair-2026-11-20`.

`final-chewing-cartoon.mp4`, `final-chewing-contact.jpg`, `final-playback-browser.jpg`, `local-state.json`, `local-animation-receipt.json`, `audio-check.json`, `export-audio-check.json`, `picture-check.json`, `budget-after.json`, and reproducible local animation script/reference frame. Existing source export remains in the previous three-person artifact directory. No provider keys or private credentials are included in this report.

This completes the requested narrow shot repair and review controls. It does not certify universal automatic acting correction, all video workflows, or the unresolved provider submission.
