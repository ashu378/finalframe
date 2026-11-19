# Two-person cartoon with original voices — 19 November 2026

## Result and boundaries

PASS for the scoped two-person source-video restyle journey: ordinary browser upload → plan → source approval → canonical production approval → one paid cartoon edit → accepted take → original audio extraction/approval → timeline restoration → timeline approval/lock → assembly review → asynchronous render → verified MP4 download.

Frontend tested at localhost:3001 against the existing online Convex deployment `knowing-snail-785`; finishing used the existing FinalFrame worker. No local database, email, billing, or unrelated services were changed. The source is an original synthetic two-person conversation prepared through canonical generation actions, then uploaded through the ordinary UI. Source preparation itself was not a browser journey. This certifies two people, not a separate three-person case, arbitrary character-image replacement, or perfect phoneme-level lip synchronization. No independent human listening/creative score is claimed.

## Fixes

- `src/lib/assets/actions.ts`: map the real `assetId` returned by the upload contract, allowing uploaded source IDs to reach planning.
- `src/components/production/create-production-form.tsx`: keep a newly created project and successful file uploads across failed planning retries; reject missing IDs and suppress simultaneous submissions.
- `convex/castReadiness.ts`, `convex/productions.ts`, `src/components/production-workspace/draft-cast-binding-panel.tsx`: approved source-only EDIT/KEEP_SOURCE plans can use the performers already in their same-project video. Require stored media, checksum, approval and rights checks; new generation, speech replacement, masks and additional references retain normal character-binding requirements.
- `convex/generationWorkerContracts.ts`: accept a bounded 16-pixel codec-grid normalization for small FLUX source edits. Actual source 864×496 became 864×480; exact native-generation validation remains unchanged. Resume recovered the already-paid output without buying again.
- Existing original-audio restoration controls kept the full recording, muted provider audio and held the last picture to avoid truncating the 54 ms audio tail.
- Online administrator capability review enabled generic EDIT alongside existing APPEARANCE_EDIT for FLUX Video Edit after checking its documented source-video animation workflow. No unsupported masks/image-reference route was enabled.

## Saved records

| Record | ID |
|---|---|
| Project | kn7czd3d2b57j1xrqewmq1yc898jhf09 |
| Production | kh77yjgyjjgssq1myf8q75cm5n8jhe6b |
| Approved production version | kd750xvzg5weyetfzsf3xr07n98jghe0 |
| Uploaded source asset | j974fjagayd28ff4tfxr3sr7798jgshg |
| Cartoon generation job | js767b34b80r936y9mmpn3g5c18jhv6d |
| Provider job | gen-vid-1795114363-jrr2VdD5QnwVyrA2iJdV |
| Accepted take | m17a4vver5v4kfv0rx0nyk4nan8jg8hk |
| Cartoon asset | j97dsn3g51v0p18svw0ejfrckn8jhw2m |
| Locked restored-audio timeline v2 | s572exd72dxym9rt9jg2b00xh58jhgzd |
| Final download storage | 487cf740-b894-4184-9365-5d4af7d69a32 |

Project name: **Two voices · cartoon upload acceptance**. Assembly v1 displayed “Finished file verified” and “Download ready” in the ordinary review page.

## Media measurements

- Final MP4: H.264, 1280×720, 24 fps, 195 frames, 8.125 seconds, stereo AAC 48 kHz; 3,140,398 bytes.
- Source recording: 8.096 seconds. Final decoded audio covers the full source plus a short padding/held-picture interval.
- Full recording envelope correlation: 0.999971; first-speaker window: 0.999995; second-speaker window: 0.999954. Best measured offset: 0 seconds.
- AAC re-encoding means decoded samples are not bit-identical. Correlation and original-audio lineage establish preservation without claiming lossless output or independent listening review.
- Contact frames show both cartoon people, yellow/blue clothing, kitchen setting, consistent positions and gestures.
- Final SHA-256: `8066706f03ddc337963d7cdc88f75ff61a0ea4373073e08729d5b8e23d9afe92`.

Evidence directory: `/home/ashuboris/.codex/artifacts/finalframe/multi-person-cartoon-2026-11-19/`.

Files: `two-speaker-source.mp4`, `cartoon-take.mp4`, `final-cartoon-original-voices.mp4`, `source-contact.jpg`, `cartoon-contact.jpg`, `final-frame.jpg`, `browser-download-ready.jpg`, `take-audio-check.json`, `final-audio-check.json`.

## Budget and recovery

Verified current-key usage: $7.598694038 of its $10 cap. Increase this task: $0.551806101, including source preparation, planning and the $0.2376 cartoon edit. Historical cumulative total reconciled against the previous key baseline: $16.093689279, below the authorized $25 ceiling.

Application ledger: $15.942450 spent, $0.618903 reserved, $20 internal cap. Reservations include retained historical uncertainty and $0.430001 for a failed source attempt; they were not cleared merely because it failed. Spending plus unresolved holds remains below both applicable aggregate limits. No new key, cap increase or subscription.

The first Veo source attempt returned no output; its uncertainty remains reserved. A deliberately different Seedance source attempt cost $0.27986805 and returned 864×496, failing its exact native-dimension certificate. That job was not falsely marked successful; its retained media was inspected and explicitly uploaded as a fixture. The cartoon job was resumed after fixing the bounded source-edit validator, with the same accepted provider ID and no resubmission.

## Regression verification

86 focused checks passed across upload/planning (4), creator intent (9), cast readiness (12), operation controls (16), edit certificates (9), accepted-take resume UI (7), worker contracts (11), original-audio restore (11) and audio dispatch (7). TypeScript, scoped ESLint, production build and selected-file whitespace checks passed. Final-file assertions passed for full recording duration, both speaker correlations above 0.999 and zero detected offset.

No schema migration. Existing projects, approved versions and downloads remain retained. Rollback the frontend/Convex code together if needed; retain accepted media and budget receipts. The additional generic EDIT model certification can be removed independently through the existing admin review mutation.

Deployment: backend fixes deployed successfully to `knowing-snail-785`; frontend publication uses this report’s Git commit through the existing main-branch Vercel integration. Deployment readiness is recorded in the completion response rather than inferred from a push.
