# UGC brief, speech and references — 19 November 2026

Status: implemented; one ordinary-browser UGC talking-shot flow reached a downloaded MP4 using online Convex and the existing FinalFrame renderer. This is a scoped acceptance result, not certification of every advertising or cartoon workflow.

## What changed

- Optional structured UGC brief: audience, truthful product facts, one benefit, call to action, presenter/demo/voiceover/story format, speech choice and delivery. Existing brief-only projects remain compatible.
- Canonical planning receives the brief on initial creation and later episodes. It distinguishes visible speech, off-camera narration, original-recording preservation and no speech. It must not invent product specifications, personal testimonials or labels.
- Speech preparation shows a conservative text-length warning. Actual measured audio, not the heuristic, determines whether the complete recording fits.
- The shot workspace guides the creator through preparing or choosing speech, choosing an approved portrait, reviewing both assets, saving the exact lip-sync inputs and measuring them without AI cost.
- `productions.fitTalkingShotToRecording` explicitly adjusts a current draft to the complete measured recording. It uses canonical shot guards and updates canonical duration settings. Approved snapshots, locked shots and existing takes cannot be rewritten.
- An approved character can retain one main reference plus up to three additional views. Every image remains approved, stored and scoped to the same project. Duplicate requests retain their existing idempotency semantics.
- Portrait lip sync selects one deliberate approved view from the character pack; it does not send several faces to a single-portrait endpoint. Other operations retain their reference handling.
- Recipes can carry a certified `LIP_SYNC` shot through estimate, paid job, take approval, timeline lock, assembly approval and export. They do not add a second narration purchase for the same supplied-speech shot.
- The cast controls now expose an explicit action to bind a character's existing approved voice when its visual identity was already bound without that voice.

## Bugs caught by the real journey

1. Draft source measurement originally required an already-approved plan, preventing the user from measuring inputs before approval. Current drafts can now be measured with the same ownership, source-byte and lifecycle checks; measurement never grants approval or spending authority.
2. The first-cut preview muted `USE_RECORDING` lip-sync output. It now retains speech only when the exact saved job policy and output audio probe establish it.
3. A provider returned 1.96 seconds for a two-second talking shot. The first-cut and current-take format preview now honor the canonical timeline's existing bounded 50ms frame-rounding allowance. Source audio must still match planned timing within one frame. Different replacement assets, trimmed source windows and longer shortfalls remain rejected. The final rendered ending was checked.

## Files

- Brief and planner: `src/lib/production/ugc-brief.ts`, `src/components/production/ugc-brief-controls.tsx`, `src/components/production/create-production-form.tsx`, `src/lib/production/actions.ts`, `src/lib/production/episode-actions.ts`, `src/lib/types/database.ts`, `convex/productions.ts`.
- Reference preparation: `convex/characterSetup.ts`, `src/lib/production/character-setup-actions.ts`, `src/components/production-workspace/guided-character-setup.tsx`, `convex/generationContinuity.ts`.
- Speech controls: `src/components/production-workspace/speaking-shot-setup.tsx`, `preparation-panel.tsx`, `shot-workspace.tsx`, `shot-assignment-controls.tsx`, `convex/audioCertificates.ts`, `convex/imageCertificates.ts`.
- Recipe/finishing integration: `convex/planningVideo.ts`, `recipeAuthority.ts`, `recipeDirector.ts`, `recipeInputs.ts`, `recipePlanning.ts`, `recipeWorkspace.ts`, `timelineEditor.ts`; `src/lib/production/recipes/{contract,compiler,workspace}.ts`; `src/components/production-workspace/{recipe-panel,director-first-cut}.tsx`; generated Convex API declarations.
- Tests: new `tests/recipes/run-ugc-speech.cjs`, `run-speaking-draft.cjs`; updated recipe compiler/director, guided-character/reference, creator-intent, operation controls, shot-assignment and editor-replacement suites. Online fixture authentication helper: `scripts/dev-fixture/cli-client.mjs`.

## Verified browser journey

Used the normal interface at localhost against online `knowing-snail-785`; no local database and no CLI-created substitute for browser approvals.

1. Created an original UGC brief and generated the canonical plan.
2. Uploaded and approved an owned synthetic presenter portrait.
3. Chose a stock voice, approved the project character/voice and bound the exact version.
4. Generated and approved “Write one small goal today.”
5. Selected portrait and recording in the guided shot controls; measured the complete audio at 1.985 seconds; deliberately matched the draft to 2 seconds.
6. Approved production version 2, prepared the recipe, reviewed its fresh estimate and explicitly started the one paid portrait job.
7. Played and reviewed the saved take. Approved the exact media, opened the editor, approved and locked timeline version 1.
8. Approved the assembly and resumed the same run. FinalFrame rendered, uploaded, verified and exposed the download.
9. Downloaded the MP4 through the browser's Download video control. All six recipe nodes reached COMPLETED.

Evidence identifiers:

- Production: `kh7ahkn90y8mwk14b5ampqb3a58jhrna`.
- Approved version: `kd7fkdnxct48g4v4a4x01evvnx8jgaym`.
- Recipe run: `zh7chf7y2008kz68a24t060f7h8jgzgj`.
- Timeline: `s572d0smra6m5j8dadtt5b5hk18jgcrs`.
- Export: `ps77hw0ejq2gxmexvndhv7t8mh8jhtd8`.
- TTS: `mistralai/voxtral-mini-tts-3-0`, reported $0.000351.
- Portrait speech: `heygen/avatar-iv`, reported $0.096030. One accepted video job; no repurchase after preview/editor fixes.
- Final download: 1080×1920, H.264/AAC, 30 fps, 60 frames, 2.000 seconds, 1,532,986 bytes.
- SHA-256: `0221f980661070f4cee28c54848211f493f4693459d2c37388db5ed60da28ab5`.
- Generated take → final export decoded audio envelope correlation: 0.99999583, best offset 0 seconds (5ms windows). This checks preservation, not phonetic lip-sync or pronunciation quality.
- Final four frames were inspected: portrait remains visible, no black tail. Contact sheet shows stable presenter and mouth movement; no independent creative score is claimed.

Local evidence: `/home/ashuboris/.codex/artifacts/finalframe/ugc-speech-2026-11-19/` contains `final-export.mp4`, `speech.mp3`, `talking-take.mp4`, contact/tail images, `browser-download.jpg`, audio comparison and final verification JSON. Do not commit media or private provider responses to Git.

## Tests and budget

Passing focused groups: UGC speech 7; draft speech timing 2; recipe compiler 22; recipe backend 21; recipe UI 16; dialogue tracks 6; guided character 8; guided UI 4; reference UI 1; creator intent 9; cast readiness 11; avatar certificates 5; audio certificates 5; operation controls 16; shot assignment UI 1; director cut 10; director UI 17; editor replacements 6; finishing v5 7. These use pure contracts/in-memory handlers, not a local Convex database.

Online guided-character integration passed four groups: unapproved references denied, cross-project references denied, exact duplicate/voice-version replay, approved resource/bible/version preservation with no provider purchase. Test project records were soft-deleted with retention, not purged.

Typecheck, scoped ESLint and final production build passed. Browser verification includes fixing and revisiting the failed editor route, resuming the existing run after navigation, explicit review gates and an actual downloaded file.

After this sample, current-key usage is $7.046887937; its $10 key limit leaves $2.953112063. The current task's observed key-usage delta is $0.115434540, including planning. The historical cumulative estimate is approximately $15.541883178, plus $0.188902 unresolved holds. Application ledger: $15.390642 spent, $0.188902 reserved, $20 limit. Historical deleted-key usage is not reset or replaced by that ledger. Owner ceiling remains $25; effective purchasing authority remains the smallest applicable allowance.

## Cartoon conversion with original voices

The user's example belongs to **Edit my video → reference-guided cartoon restyling**, rather than treating each original speaker as a new TTS voice:

1. Upload owned/authorized source footage and approve one cartoon identity per performer.
2. Bind those identities to the intended people/shots. Describe what changes and what stays: original actions, timing, camera and speaker turns.
3. Keep the original soundtrack separately, including all speakers, pauses and ambient sound. No voice cloning is required to retain that recording.
4. Generate only the visual transformation through a route whose references and controls are verified.
5. Review identity mapping, hands/actions, camera and mouth timing. Reapply the complete original audio using the existing measured source-audio restoration workflow and explicit timing decisions.
6. Save a new take/timeline; keep the original intact.

Existing source-audio extraction/restoration and reference editing are useful foundations. This change does **not** certify multi-person source-video-to-cartoon conversion, exact group-performance transfer, or every cartoon mouth type. The portrait endpoint tested here animates one presenter. The three-person cartoon case needs its own owned fixture, route validation, bounded quote and reviewed output before being advertised as verified.

## Compatibility and remaining limits

- No schema migration, new database, payment, email or domain configuration is required by this change. New brief fields and reference inputs are optional.
- Canonical planning remains `productions.ts` / `productionVersions`; no legacy planning writer was added.
- Existing approved snapshots and downloads remain retained. Rollback can restore the previous frontend while keeping these additive backend readers and persisted records; never purge accepted jobs or reset spending.
- A separate unconfigured test studio correctly stopped at catalog validation before purchase. Automatic model-policy bootstrap for every new studio is not established by this owner-account test.
- Multi-person/cartoon creative acceptance, fluent Pidgin review, product hand interactions and long UGC advertisements remain separate checklist entries. This short speech test cannot certify those outputs.
- Convex reported that the account is above Free plan limits. No upgrade, database copy or destructive cleanup was performed.
