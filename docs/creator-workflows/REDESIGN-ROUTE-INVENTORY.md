# Redesign route inventory

Owner-approved black/white/lime identity; mobile-first. Each page also includes its nested sections, dialogs and loading/error/empty states. All functionality remains in place.

| Source page | Presentation review |
|---|---|
| `src/app/(admin)/admin/account-requests/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(admin)/admin/audit/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(admin)/admin/credits/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(admin)/admin/jobs/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(admin)/admin/moderation/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(admin)/admin/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(admin)/admin/payments/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(admin)/admin/roles/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(admin)/admin/users/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(admin)/admin/video-routing/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(auth)/forgot-password/page.tsx` | Signed-out desktop/mobile presentation inspected on localhost release copy; no email or account mutation |
| `src/app/(auth)/login/page.tsx` | Signed-out desktop/mobile presentation inspected on localhost release copy; no email or account mutation |
| `src/app/(auth)/reset-password/page.tsx` | Signed-out desktop/mobile presentation inspected on localhost release copy; no email or account mutation |
| `src/app/(auth)/signup/page.tsx` | Signed-out desktop/mobile presentation inspected on localhost release copy; no email or account mutation |
| `src/app/(auth)/verify-email/page.tsx` | Signed-out desktop/mobile presentation inspected on localhost release copy; no email or account mutation |
| `src/app/(dashboard)/dashboard/assets/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(dashboard)/dashboard/create/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(dashboard)/dashboard/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(dashboard)/dashboard/projects/[id]/blueprint/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(dashboard)/dashboard/projects/[id]/editor/page.tsx` | Live legacy editor redirects to canonical edit screen with selected production preserved |
| `src/app/(dashboard)/dashboard/projects/[id]/movies/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(dashboard)/dashboard/projects/[id]/page.tsx` | Live project entry opens existing episode selector; selector heading clarified in review fix |
| `src/app/(dashboard)/dashboard/projects/[id]/production/page.tsx` | Canonical redirect route; covered by source inspection; not a separate visual screen |
| `src/app/(dashboard)/dashboard/projects/[id]/report/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(dashboard)/dashboard/projects/[id]/settings/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(dashboard)/dashboard/projects/[id]/workspace/[section]/page.tsx` | All nine sections inspected live at desktop/mobile with retained episode; editor controls checked after hydration |
| `src/app/(dashboard)/dashboard/projects/[id]/workspace/page.tsx` | Canonical redirect route; covered by source inspection; not a separate visual screen |
| `src/app/(dashboard)/dashboard/projects/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(dashboard)/dashboard/settings/account/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(dashboard)/dashboard/settings/operations/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(dashboard)/dashboard/settings/operations/video-routing/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(dashboard)/dashboard/settings/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(dashboard)/dashboard/settings/reports/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(dashboard)/dashboard/settings/team/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(dashboard)/dashboard/templates/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(onboarding)/onboarding/assets/page.tsx` | Existing setup guard redirects to welcome; inner step not browser-certified; callback presentation covered by component tests |
| `src/app/(onboarding)/onboarding/confirm/page.tsx` | Existing setup guard redirects to welcome; inner step not browser-certified; callback presentation covered by component tests |
| `src/app/(onboarding)/onboarding/creative-dna/page.tsx` | Existing setup guard redirects to welcome; inner step not browser-certified; callback presentation covered by component tests |
| `src/app/(onboarding)/onboarding/goal/page.tsx` | Existing setup guard redirects to welcome; inner step not browser-certified; callback presentation covered by component tests |
| `src/app/(onboarding)/onboarding/identity/page.tsx` | Existing setup guard redirects to welcome; inner step not browser-certified; callback presentation covered by component tests |
| `src/app/(onboarding)/onboarding/message/page.tsx` | Existing setup guard redirects to welcome; inner step not browser-certified; callback presentation covered by component tests |
| `src/app/(onboarding)/onboarding/page.tsx` | Existing setup guard redirects to welcome; inner step not browser-certified; callback presentation covered by component tests |
| `src/app/(onboarding)/onboarding/platform/page.tsx` | Existing setup guard redirects to welcome; inner step not browser-certified; callback presentation covered by component tests |
| `src/app/(onboarding)/onboarding/studio/page.tsx` | Live desktop/mobile optional setup inspected |
| `src/app/(onboarding)/onboarding/welcome/page.tsx` | Live desktop/mobile optional setup inspected |
| `src/app/(public)/about/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(public)/account/deactivated/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(public)/case-studies/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(public)/contact/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(public)/legal/cookies/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(public)/legal/gdpr/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(public)/legal/privacy/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(public)/legal/terms/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(public)/methodology/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(public)/movie-review/[token]/page.tsx` | Invalid-link/not-found state inspected desktop/mobile; valid private-token decisions not exercised in this presentation review |
| `src/app/(public)/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(public)/pricing/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/(public)/review/[token]/page.tsx` | Invalid-link/not-found state inspected desktop/mobile; valid private-token decisions not exercised in this presentation review |
| `src/app/invite/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |
| `src/app/maintenance/page.tsx` | Live desktop (1440px) and mobile (390px) presentation inspected; no mutation submitted |

Total: 60 page files. Shared shell work does not certify individual page completion.

Review evidence: [Final review](REDESIGN-FINAL-REVIEW-2026-11-16.md). All admin destinations, creator destinations, nine workspace sections, public destinations and signed-out authentication forms received desktop/mobile presentation checks. Guarded setup steps and valid private review-token states are explicitly distinguished above. This visual review does not certify video-generation quality, email delivery, payments, or every mutation.
