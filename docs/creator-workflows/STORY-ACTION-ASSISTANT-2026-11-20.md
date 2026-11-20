# User-operated story-action checking and repair — 20 November 2026

## Outcome

Implemented actual video inspection and a cost-confirmed, single-shot repair assistant in Saved takes. Tested through the ordinary authenticated localhost interface connected to online Convex knowing-snail-785. No local database was used.

**Infrastructure and user flow pass; automatic chewing correction does not pass creative acceptance.** The paid replacement still lacks convincing chewing. It remains unapproved. A comparison check also rejected a copy of the earlier localized animation; this could be a false negative for subtle motion and is not proof that the earlier frame-level review was wrong. The detector is advisory and retains explicit human review. No claim of universal missing-action detection or guaranteed character likeness is made.

## Ordinary creator flow

1. Open a take with timed story-action requirements in Saved takes.
2. Choose **Check this take — see cost**, then **Confirm picture check**.
3. FinalFrame inspects the actual stored video and reports present, missing, or uncertain actions, with picture evidence. Words and mouth motion alone are not evidence of the requested action.
4. For a failed action, choose **Fix only this shot — see cost**, review the price, then confirm.
5. FinalFrame creates a new take in that exact shot and production version. Original take, approved plan, other shots, project character bindings and frozen voice bindings remain unchanged.
6. Review the new take. After approval, select it in Edit & sound and use **Restore original recording**. Export rejects a repaired take unless the exact original recording is attached through the existing validated restoration flow. Generated picture-preview audio is not offered as the finished voice-preserving download.
7. A repair that still misses the same action cannot recursively purchase another identical repair. It requires revised direction or a separately verified approach.

Nothing is bought merely by opening a page. The current repair route requires a short video with a verified original recording; unsupported sources fail before purchase. New checks are not automatically run on every generated video. They inspect the explicit action requirements already saved in the plan.

## Implementation

- `src/lib/production/story-action-check.ts`: strict observation schema, timing checks, bounded pricing, inspection and minimal repair instructions.
- `convex/storyActionChecks.ts`, `convex/storyActionVision.ts`: project authorization, immutable media/checksum binding, quotes, existing durable text receipts, actual video inspection and saved observations.
- `convex/storyActionRepairs.ts`, `convex/generationJobs.ts`: server-derived repair instructions, approved project source and original-audio certificates, canonical estimate and reservation, new take only, submission revalidation, retry-chain protection.
- `convex/sourceAudioContracts.ts`: repaired-take export cannot bypass original-recording restoration, even by omitting all restoration metadata.
- `convex/storyActionReviews.ts`: newer AI concerns require explicit subsequent human review; AI never impersonates human approval.
- `convex/schema.ts`: additive `storyActionChecks` table; historical records retained.
- `src/lib/ai/model-registry.ts`: centralized `OPENROUTER_ACTION_REPAIR_MODEL` setting, default `black-forest-labs/flux-video-edit`, still subject to reviewed routing validation. Inspection uses configured VALIDATION candidates; live selected `google/gemini-3.8-flash`.
- Workspace assistant, review, approval and take components: cost confirmation, persistent progress, safe errors and original-recording guidance.

## Live evidence

Project: `kn75m9wtdfk6m5xqpccgtt0xjd8jkyhw` (Three voices · cartoon conversion).
Production version: `kd708y64d48hwrhpyfkht83c1h8jjrgf`.
Shot: `m57dv8b3mk6mt4e9s400agwy718jkje3`.

| Case | Evidence | Result |
|---|---|---|
| Inspect original missing chewing | check `gh7vyzyyrhrwxccca1grwspczh8jj5k4`, $0.0023084325 | PASS: detected stationary jaw before grandmother speaks |
| Expired estimate | ordinary browser confirmation | PASS: denied before purchase; fresh estimate works |
| Single-shot repair | job `js73ta3tf0tp1sm395e74b9d2d8jjdza`, new take `m17bknfvmt9jz93dvkr8f4htq58jjggs`, $0.2376 | PASS for submission/persistence; FAIL for convincing chewing |
| Recheck paid replacement | check `gh7vg0fz5ngfv6qtn8zse3grjd8jjq1v`, $0.002534895 | PASS: detected continuing missing action; contact-sheet review agrees |
| Comparison with earlier localized animation | cloned take `m176wt9yepa9fd8gb7wf9zk23d8jk8nv`, check `gh7g3hy05nqkn61yfpgzyezx1x8jks9n`, $0.00249777 | Detector returned FAIL; subtle-motion sensitivity remains unverified; original locked take not modified |
| Repeat paid repair | browser displayed “FinalFrame has stopped repeat charges” | PASS: no purchase |
| Retained original audio | real source certificates plus restoration/export contracts | PASS for guard; no new final export certified because replacement failed creative review |

Artifacts: `/home/ashuboris/.codex/artifacts/finalframe/action-assistant-2026-11-20/` contains saved receipts, actual replacement MP4, contact sheet, browser accessibility evidence and budget. Browser screenshots were unavailable because screenshot commands timed out; no screenshot is claimed.

## Verification

73 focused contract groups passed: story actions 14, assistant 11, source-edit planning 3, shot durations 9, operation controls 16, edit certificates 9 and original-audio restoration 11. Tests exercise actual handlers with in-memory seams for pure contracts; persisted/live tests use online Convex. Typecheck, scoped lint and production build passed. Online Convex additive deployment completed at 20:48 local time. No renderer deployment or format migration was required.

## Budget

New test charges: **$0.244941097**. Current-key usage: **$8.6193234 / $10**. Known cumulative charges: **$17.114318641**. Older unresolved holds: **$0.912404**. Conservative cumulative total: **$18.026722641 / $25**. No cap increase, top-up, payment or repeated ambiguous submission.

## Remaining creative work

A verified repair approach is still needed for this subtle chewing action. The app now exposes the failure and supports scoped repair, but neither provider completion nor an AI checker result certifies creative success. Positive-control sensitivity for subtle jaw motion, ordinary-user character fidelity across different repair cases, and an accepted repaired browser-to-download output remain open. Do not label the entire feature creatively complete.

## Rollback

Restore the previous compatible frontend revision if needed. The additive check table and receipts can remain; do not delete them or reset provider spending. Preserve original takes, repair attempts, approvals and unresolved holds.
