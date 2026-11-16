# FinalFrame redesign review — 16 November 2026

## Scope and outcome

Reviewed the existing black/white/lime redesign against the running main domain. This is presentation review and polish, not a new redesign or complete product acceptance. No paid generation, rendering, email, payment, database migration, or retained-data deletion was performed.

Baseline: `f3f1ee4` (brand kit release). The review commit preserves the current API calls, routes, authorization, production identifiers, immutable versions and action handlers. Deployment target: existing FinalFrame project, production `usefinalframe.xyz`, through `main`.

## Findings corrected

1. Production navigation hid later stages off-screen on phones. All eight stages now use a two-column mobile layout and wrap on larger screens; active-stage semantics and exact production/timeline links remain.
2. Settings section links now wrap instead of requiring horizontal scrolling.
3. The multiple-episode chooser lacked a page heading. It now explains how to resume an existing video or start the next episode.
4. The editor said “Build the first timeline” even with saved edits. It now distinguishes first/another edit and uses plain-language instructions.
5. Sixteen leaf metadata titles repeated FinalFrame because the root already appends it. Removed the redundant suffixes.
6. Credit-history headings now explain held, used, returned, added and refunded credits; underlying ledger records are unchanged.
7. Private invitation pages now include a clear return-home link.
8. Hero headline spacing is less cramped. Active scroll reveals use a shorter 24px, 500ms transition with reduced staggering. Existing reduced-motion and static fallbacks remain.

## Browser evidence

Local artifact directory: `/home/ashuboris/.codex/artifacts/finalframe/redesign-final-review-20261116/`.

- `checks.json`: route, width, title, headings and overflow observations.
- Desktop 1440px and mobile 390px captures for public, creator, admin, workspace, utility and authentication surfaces.
- Public, creator, admin, workspace and authentication contact sheets plus individual screenshots.
- Auth screens were checked signed out at loopback against the local release copy; the live owner session remained signed in.
- Nine workspace sections used an existing approved episode, not an empty mock project. Read-only navigation did not buy media or change production state.
- Homepage mobile sample selection/play/pause verified; actual video reached readyState 4 and advanced while playing. Mobile menu opens and Escape closes it.
- Reduced-motion emulation leaves visible content at full opacity and no canvas or auto-playing video. Existing component tests cover viewport activation, static fallback, arrow/pointer controls and cleanup.
- No page-level horizontal overflow observed at the checked widths. Deliberate sample carousels and contained data regions are not classified as page overflow.

## Checks

- TypeScript no-emit: pass.
- Scoped ESLint: pass.
- Isolated production build: pass (clean tracked baseline plus review changes).
- Ten targeted suites: pass: design navigation, admin/auth/setup surfaces, auth controls, cinematic hero, showcase interaction/fallback, admin navigation, public surfaces, timeline composer labels, current edit lineage/UI, and creator intent/journey.
- Review-file whitespace check: pass. Pre-existing unrelated worktree changes were preserved and excluded from release.

## Limits and remaining checklist

- Guarded legacy setup steps redirect to welcome for this account; their inner forms were not exercised by altering the owner's setup.
- Private review links were checked in their unavailable/not-found state. Valid-token comments/approvals were not submitted.
- Email verification/recovery and payments remain later work. Policy publication copy and the contact mailbox still require their existing owner/service review.
- Remaining video-quality, provider-operation and functional acceptance entries stay on `LAUNCH-RELEASE-CHECKLIST.md`. Passing this review does not mark those entries complete.
- The browser review used Chromium desktop/mobile emulation, not a new Firefox/WebKit or physical-phone certification.

## Changed application files

- `src/app/(admin)/admin/account-requests/page.tsx`
- `src/app/(admin)/admin/page.tsx`
- `src/app/(dashboard)/dashboard/create/page.tsx`
- `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/(dashboard)/dashboard/projects/[id]/report/page.tsx`
- `src/app/(dashboard)/dashboard/projects/[id]/settings/page.tsx`
- `src/app/(dashboard)/dashboard/projects/[id]/workspace/[section]/page.tsx`
- `src/app/(dashboard)/dashboard/projects/page.tsx`
- `src/app/(dashboard)/dashboard/settings/account/page.tsx`
- `src/app/(dashboard)/dashboard/settings/operations/page.tsx`
- `src/app/(dashboard)/dashboard/settings/operations/video-routing/page.tsx`
- `src/app/(dashboard)/dashboard/settings/page.tsx`
- `src/app/(dashboard)/dashboard/settings/reports/page.tsx`
- `src/app/(dashboard)/dashboard/settings/team/page.tsx`
- `src/app/(public)/account/deactivated/page.tsx`
- `src/app/(public)/movie-review/[token]/page.tsx`
- `src/app/(public)/review/[token]/page.tsx`
- `src/app/invite/page.tsx`
- `src/components/admin/platform-inventory.tsx`
- `src/components/finalframe/cinematic-hero.tsx`
- `src/components/production-workspace/production-journey.tsx`
- `src/components/production-workspace/timeline-composer.tsx`
- `src/components/team/invitation-acceptance.tsx`
- `src/components/threeui/scroll-reveal-root.tsx`
