# Owner administration and payment direction — 21 November 2026

## Owner decision

- Finish application functionality and owner administration before live payment activation.
- Pay as you go, minimum USD 3. Planned pack amounts: 3, 5, 10, 20, 25, 30, 35, 40, 45, 50 dollars.
- No required monthly subscription; purchased credits do not expire.
- No routine change-of-mind cash refunds. Duplicate/error charges and legally required refunds remain exceptions. Eligible credits from failed generation are returned separately.
- This supersedes the suggested USD 10 minimum and voluntary fourteen-day unused-balance refund recommendation.
- Trial entitlement/abuse limits, credit quantities, fee-inclusive local prices and real ledger integration still need validation; this decision does not grant free provider usage.
- No live payment key, webhook mode, price catalog, real balance, subscription, or refund operation changed in this task.

## Delivered changes

- Owner-only payment-readiness page in the existing black/white/lime admin shell. It documents planned terms without a checkout or activation button.
- Platform navigation includes that page for ADMIN only; SUPPORT and MODERATOR do not receive it.
- Desktop and mobile creator navigation expose “Manage FinalFrame” only after an explicit server-side platform-role lookup. Studio ownership grants no platform role.
- Admin desktop and mobile navigation include the existing canonical sign-out action.
- Login now preserves a safe requested admin/dashboard destination, including the email-verification handoff. External/protocol-relative destinations and routes outside authenticated app areas fall back to the dashboard. Route/backend role guards remain authoritative.

## Checks

The existing saved-account login succeeded on the main .xyz website. Direct /admin access reported ADMIN. Overview, users, roles, account requests, jobs, moderation, credits, audit, routing and payment pages loaded with online Convex data. Initial login incorrectly discarded the /admin destination; this was the repaired regression.

Pure handler/component tests cover explicit platform roles, no studio-owner inheritance, last-administrator protection, audit/idempotency, project report ownership, model restrictions, navigation role matrix, safe redirects, verification handoff, owner-only policy, safe action errors and payment live-mode denial. No real account was disabled and no role was granted during this review.

## Limits and remaining work

This is not whole-product acceptance. Platform job and credit pages inspect records; this change does not add arbitrary global retries, unrestricted wallet editing, provider-secret editing, or direct deployment control. Studio operations retain their own guard and existing scoped actions. Remaining safe operational controls must use canonical job/credit services and an audit trail. Do not claim every action has been browser-tested because its inventory loads.

The whole-product release checklist retains video-quality, collaboration, format and recovery gates. Activation remains a separate final step after completion and explicit owner approval. Existing sandbox pack values remain test configuration, not final prices.

No database migration is required. Rollback restores the preceding frontend without changing project data, platform grants, payment receipts or existing balances.

## Main-domain verification

Revision `7566a13` deployed successfully through the existing FinalFrame Git/Vercel connection. On the live main domain, the owner used the phone menu to open platform admin, signed out, was denied direct admin access without login, then used the saved account to log in directly back to /admin. The role remained ADMIN and balances were not changed. Payment readiness rendered the planned USD 3 minimum and non-expiring credit policy, without activation controls.

Phone inspection found that the existing native admin disclosure stayed open after choosing a page and covered most of the viewport. The follow-up closes it on ordinary link activation and returns focus to its summary; modified clicks retain normal browser behavior. The actual-component regression covers close/focus behavior. Scoped lint, TypeScript, the production build, platform navigation/authorization/action tests, owner-access tests and sandbox payment suites passed. Existing unrelated working-tree changes were preserved and excluded from publication.
