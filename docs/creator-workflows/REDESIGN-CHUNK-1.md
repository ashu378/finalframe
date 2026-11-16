# Redesign chunk1: mobile-first foundation

15November2026. Implemented locally; not pushed or deployed.

## Changes
- Black/white/lime semantic tokens and compatibility aliases for existing CSS-module controls.
- Self-hosted variable Manrope/Bricolage Grotesque with OFL licenses; no font-service requests from the browser.
- Shared button styles replace tiny uppercase amber controls; preserve component API.
- Responsive account shell,52px inputs/submit and16px mobile field text. Authentication submission code remains unchanged.
- Shared desktop/mobile studio destinations, active-page semantics, native modal mobile menu with explicit close/focus return and sign out.
- Public navigation collapses earlier to avoid crowded labels.
- Remove whole-dashboard entrance animation so working controls do not move on load.
- Preserve user-owned dirty files, backend/database/provider configuration and media behavior.

## Verification
- Isolated HEAD-based source snapshot plus only chunk1 edits: TypeScript PASS; scoped ESLint PASS; production Next.js build PASS.
-6 actual-component navigation contract groups PASS (nested active route, destinations, open/close, focus return, route change and backdrop).
- Existing platform-navigation ADMIN/SUPPORT/MODERATOR and studio-role SSR matrix PASS.
- Mechanical detector on changed navigation/auth-layout/button surfaces returned no findings. Global legacy styles are not certified.
- Actual login browser at390x844: scrollWidth390,16px inputs,approximately52px fields and submit. Manrope loaded. Desktop also inspected.
- Screenshots: /home/ashuboris/.codex/artifacts/finalframe/redesign-chunk1-evidence/login-mobile.jpg and login-desktop.jpg.
- Full signed-in browser menu journey and signup/recovery screens are not certified by these isolated checks. Full application acceptance remains after email/payments.
- Existing ThreeUI dependency emits pre-existing gradient-direction Autoprefixer warnings; build succeeds.

## Local preview
http://localhost:3000/login. Preview uses an isolated build of the same source to preserve original user-edited build configuration. It connects to the existing cloud environment; no local database, new subscription, paid inference, render or storage copy.

## Next chunk
Homepage and public pages, including the interactive storyboard showcase. Continue the route inventory; do not mark dashboard/admin interiors complete merely because they inherit new tokens.
