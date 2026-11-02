# Creator workspace controls

These controls use the selected project's online Convex records. They do not purchase generation merely by opening a page. The generation/preparation buttons are separate actions and still require the enabled worker, approved model route, and capped budget.

## Prepare project references

1. Select the intended production/episode. Its URL keeps an explicit `production` selector.
2. Open **Media** and upload media into this project. Inspect each asset before submitting it for review, approving it, and optionally locking it.
3. Create character, location, costume, prop, product, brand, or style references. Select their actual project media. Revising a reference creates another immutable resource version.
4. For a voice, use an uploaded recording or create a reference-synthesis profile. Reference synthesis needs explicit speaker permission and third-party processing disclosure. Permission for another speaker requires uploaded project-owned evidence. Avatar/lip-sync permission is a separate opt-in.
5. Approve a ready voice before assigning it to a character. Revoking consent blocks future synthesis; it does not erase its audit history or already-produced recordings.
6. Build a continuity bible from exact approved reference versions and written rules. Approve the bible before using it in a production plan. A new bible never rewrites an approved plan's snapshot.

## Bind shot requirements

1. Create a draft plan through the canonical production planning flow and select its approved bible deliberately.
2. Open **Storyboard** or **Takes** before approving the plan.
3. Select the exact continuity reference versions for each shot and save the bindings.
4. Choose the operation, source/reference footage, audio policy, and any first/last frames. Save the requirements.
5. Review and approve the plan. Its graph and shot metadata become immutable. Later instruction changes require a revised production version.

An operation selector is a request constraint, not a promise that a provider is available. No fallback may drop required controls. Extension remains unavailable in these controls until accepted-provider-job history selection is connected.

## Compose without paid AI

1. Approve the current production plan. A paid generation is not required if you already have suitable project footage or images.
2. Open **Edit**. The initial composer sits above the existing editing surface.
3. Explicitly add approved takes, approved project footage/images, or designed cards. Exact title text and approved project logos use deterministic renderer templates.
4. Reorder or remove clips. The current controlled composition is limited to 60 seconds.
5. Optionally add an approved original recording or licensed soundtrack. Its timing must fit inside the composition.
6. Save a draft timeline. Saving does not render or purchase AI output.
7. Inspect the selected sources and composition instructions, submit the timeline for review, approve it, and lock it before creating the renderable manifest.
8. Build the canonical manifest for that exact timeline. Rendering/export remains a separate asynchronous operation. A manifest is not a completed MP4.

## Accept an episode's story

Open **Review** after the final timeline is approved and has a manifest for the current approved production version. Record what actually happened, unresolved threads, the cliffhanger, and the next episode's payoff. Accepting this snapshot supplies the next episode's continuity. Revising earlier accepted facts marks dependent episodes stale; refresh them deliberately.

## Verification

- `node tests/episodes/run-workspace-controls.cjs`: pure operation/input policy checks; no database or providers.
- `node tests/episodes/run-online-episodes.mjs`: authenticated online Convex continuity, binding, approval, and episode tests.
- `node tests/episodes/run-online-workspace-ui.mjs`: authenticated desktop/mobile browser checks backed by online Convex; creates isolated fixture projects and soft-deletes them afterward.

The online scripts require the private fixture account, `NEXT_PUBLIC_CONVEX_URL`, `FINALFRAME_DEV_FIXTURE_KEY`, `FINALFRAME_DEV_FIXTURES=true`, and `FINALFRAME_DEV_FIXTURE_ENV=development`. Do not put credentials into this document or source control. Browser screenshots are written outside the repository under `/tmp/finalframe-workspace-verification` by default.

No paid provider request, full movie render, billing action, or email delivery is part of these scripts. Paid transformation quality and complete downloadable MP4 output remain separate acceptance checks.
