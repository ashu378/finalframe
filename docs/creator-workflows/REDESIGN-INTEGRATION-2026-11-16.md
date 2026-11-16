# Redesign integration — 16 November2026

## Implemented presentation
- Shared mobile-first black/white/lime tokens, readable forms/buttons/navigation, self-hosted licensed fonts.
- New public homepage, original sample posters and3 explicit silent video previews, interactive Three.js scene with keyboard/pointer/touch controls, lazy entry and static/reduced-motion fallback.
- Public examples/methodology/about/contact/pricing/footer/policies, authentication/optional setup/utility states.
- Dashboard/creator entry, projects/templates/media, settings/account/team/invitations.
- Production story/guide/storyboard/takes, project map, editor/audio/captions/graphics, review/download.
- Movie/chapter/version/private review and finishing/recovery surfaces.
- Separate platform administration, clearer tables/forms and optional technical details with existing role gates.

## Wording
Use everyday visible labels. Keep scenes, shots and takes distinct. Technical IDs and preserved-version details remain available where needed; identifiers, actions, provider controls and persisted enum values were not renamed. Legal obligations and contact address were preserved, not invented. The existing contact mailbox still needs owner verification during the later email phase.

## Evidence
Artifacts: /home/ashuboris/.codex/artifacts/finalframe/redesign-20261116 and redesign-workspace-tests-20261116.
- Combined TypeScript/Next.js production build and scoped lint passed on an isolated clean configuration with only task edits, preserving23 original user-dirty files.
- Focused UI/navigation/admin/auth/account/team/media/project/movie/release tests passed. Workspace set includes105 groups plus template contracts; finishing/recovery and component matrices also passed. Exact test outputs retained rather than treating UI mocks as cloud/provider acceptance.
- Actual public gallery:0 video elements before Play; one local four-second clip reaches readyState4 with no error; close unmounts the video and restores focus.
- Actual homepage390px: no horizontal overflow, no broken images, one WebGL canvas,0 initial video elements. Desktop/mobile screenshots retained. Prior login screen measured16px fields and52px targets.
- Current owner login attempt was rejected. Sign-in request remains pending. Private dashboard/admin/editor browser screenshots and current-auth acceptance are NOT certified by source/SSR tests.

## Preserved boundaries
No backend/schema/environment/role/AI routing/credit/payment/email changes. No paid calls, new cloud storage copies or renderer deployment. Retain all approvals, locked versions, project permissions, exact selected IDs, spending confirmations and on-demand private media. The original user changes stay outside the release commit.

## Remaining acceptance
Owner sign-in for private visual pass, any corrections it identifies, and later full application acceptance after email/recovery and payments. Existing video fixes remain on the release checklist. This document is not whole-product launch certification.

## Rollback
Frontend-only release. Restore preceding main revision52f9996 if needed; database and renderer remain compatible and unchanged. Preserve retained work and accepted jobs. Publication revision/status are recorded in the release artifact.
