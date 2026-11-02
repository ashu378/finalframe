# Platform and studio administration

The platform has an explicit `platformRoles` grant independent of studio ownership, team roles, project membership, and user metadata. `platformAdministration.requirePlatformRole` checks the verified provisioned user and an ACTIVE grant on every query or mutation. Disabled users and revoked grants fail closed. The compatibility Next.js `requireAdmin` export now requires the explicit ADMIN grant; its former studio-owner shortcut grants no platform authority.

## Route inventory

- `/admin`: platform overview, with links filtered to the caller's explicit role.
- `/admin/users`, `/admin/jobs`, `/admin/credits`, `/admin/audit`, `/admin/video-routing`, `/admin/moderation`, `/admin/roles`: paginated projected platform inventories.
- `/admin/payments`: deferred activation notice; no checkout or payment mutation.
- `/dashboard/settings/operations`: current-studio operational records and the existing development-only test-credit form.
- `/dashboard/settings/operations/video-routing`: existing current-studio catalog review and route preferences.
- `/dashboard/projects/[id]/report`: authorized project metadata and content-report form, including restricted-project status.
- `/dashboard/settings/reports`: the verified user's own submitted reports and decisions.

The studio operations guard uses the current verified owner/admin studio membership. Platform staff are never impersonated into a studio. Existing `app.admin*`, routing and development test-credit actions remain studio-scoped under that route.

## Platform permissions

| Role | Read | Changes |
|---|---|---|
| ADMIN | All listed platform inventories | Account enable/disable, platform role grants/revocations, report decisions, restriction clearing, model quarantine/clearing |
| SUPPORT | Accounts, generation jobs, credit ledger, platform audit | No account, grant, moderation, or routing changes |
| MODERATOR | Content reports and platform audit | Dismiss or quarantine an OPEN report |

Role changes and account disable cannot leave the service without an enabled active ADMIN. Self-disable is rejected. Changes require a reason and a stable request ID, and append an idempotent event to the existing `audit` table with `metadata.scope = PLATFORM`. Caller roles, user metadata, and `is_admin` presentation flags never grant backend platform access.

Platform inventories are bounded to at most 50 scanned rows per call, with continuation cursors bound to the user, inventory, and report-status filter. Job request/response bodies, provider job identifiers, credentials, signed media URLs and auth/session records are omitted. The audit inventory only projects PLATFORM-scoped records; sparse pages retain continuation. No inventory presents a recent sample as a total.

## Bootstrap and restrictions

`bootstrapAdministrator` is an internal mutation only. It requires `FINALFRAME_PLATFORM_BOOTSTRAP_ENABLED=true` and exact equality between its canonical user ID and `FINALFRAME_PLATFORM_BOOTSTRAP_USER_ID`. The target must exist and be enabled. It only creates the first ADMIN, never replaces/reactivates an existing role, and records an audit event. An existing grant can be replayed without another write. The owner has confirmed the target account. Real bootstrap remains a coordinator-only step after deployment/integration checks and resolution to its exact canonical user ID; no real account was granted during this packet.

Reporters need actual project access and may optionally identify an asset/export belonging to that same project. Reports bind their request ID to reporter, project, target, category and text. A decided report cannot be overwritten by a new decision. Quarantine sets project restriction metadata and retains the project and all descendants. An ADMIN can separately clear a restriction; that action does not erase the report or its decision history.

Restricted projects expose only tightly projected library/report metadata through `allowRestrictedRead`. Ordinary production and media paths retain the root-owned restriction guard. Reporter status pages expose only the caller's own reports, including after a decision. Public shared review and provider/render fences are separate root/AI integration checks.

Model quarantine sets persistent platform-only quarantine fields in addition to disabling availability and invalidating capability review. Studio refresh/review retains those fields. ADMIN-only clearing removes the platform fields but leaves availability false and capability review invalidated: a fresh studio review is still required. Generation eligibility and submission-fence enforcement are integrated by the AI lane. No platform wallet grant or alternative accounting authority was introduced; credits use the canonical ledger and the existing studio development grant remains flag-gated. Payments and email activation remain last.

## Verification and remaining acceptance

`node tests/admin/run-platform-contracts.cjs` executes actual authorization and handlers in memory: studio-owner/metadata denial, exact internal bootstrap, revoked-role denial, role matrix, last-enabled-admin protection, idempotent audit effects, cross-project report denial, moderation state transitions, metadata-only restriction reads, model quarantine/clearing, paginated global projections, private-field omission, Next.js guard separation and SSR role-filtered navigation. No database, provider, payment or real grant occurs.

Root TypeScript, changed-file ESLint and prior project/template/owner-transfer tests are regression checks. Online role provisioning, real browser flows with owner/support/moderator/administrator accounts, case evidence/creative inspection, production quarantine fences, scale and policy acceptance remain release gates. This packet does not certify the whole-product B05 release entry.

## Isolated online authorization harness

`node tests/admin/run-platform-fixture-guards.cjs` tests the private fixture gates and cleanup in memory. `tests/admin/run-online-platform-authorization.mjs` is opt-in and has not been run by the implementation agent. The coordinator can run it from the repository root after deploying the functions, before the first real administrator grant. It requires an online `NEXT_PUBLIC_CONVEX_URL`, `FINALFRAME_ALLOW_PLATFORM_ONLINE_TESTS=true`, and the private `FINALFRAME_DEV_FIXTURE_KEY`. The deployment must already have `FINALFRAME_DEV_FIXTURES=true`, `FINALFRAME_DEV_FIXTURE_ENV=development`, and the matching private fixture key. The driver does not deploy or change environment settings.

The private internal seed refuses any existing ACTIVE ADMIN. It creates five new UUID-marker users without auth/password accounts, a marker studio, two canonically provisioned owner projects, metadata-only assets and a non-provider catalog model. Temporary fixture grants are created directly by that gated seed; it never calls the real bootstrap, grants the real owner, uses real assets, submits render jobs or invokes a paid provider. Every target comes from this exact marker. Internal fixture calls use the authenticated admin CLI without `--identity`, and remain protected by internal visibility plus exact private fixture key, development flags and UUID/record-marker checks. The gated private helper supplies only that exact marker's owner context while delegating to canonical project creation/deletion guards. Public API calls retain simulated CLI subjects; this does not certify browser sign-in or JWT issuance.

The driver checks studio-owner/admin denial, explicit ADMIN/SUPPORT/MODERATOR permissions, last-ADMIN protection, fixture role/status changes, cross-project report denial, idempotent report/decision/audit effects, project restriction and metadata-only recovery, ADMIN-only clearing and model quarantine. In `finally`, a marker-only internal mutation revokes fixture grants, disables fixture users, soft-deletes their two projects via the canonical helper, disables the fixture catalog row and retains audit and reports. Cleanup temporarily re-enables only its exact disabled fixture owner within the same atomic transaction if needed to use the canonical project helper; it ends disabled. Open reports are marked dismissed with an explicit fixture-cleanup reason, never a real content judgment. Snapshot reads are bounded and fail explicitly on an exceeded report/audit limit.

The driver prints its UUID run ID before seeding. After process termination or cleanup failure, rerun the same driver with `FINALFRAME_PLATFORM_FIXTURE_RUN_ID` set to that exact UUID and `FINALFRAME_PLATFORM_FIXTURE_CLEANUP_ONLY=true`, plus the same private configuration. Cleanup-only requires an explicit run ID and accepts no arbitrary target account or project IDs. No mutation is automatically retried after an ambiguous response. Transport failures cannot count as expected permission denials. After a verified cleanup, the coordinator may resolve and bootstrap the owner account separately.
