# Account profile, index and retained-data requests

## Routes and authority

- `/dashboard/settings/account`: verified enabled user, display name, own index downloads and deactivation preflight/request. Linked from Settings.
- `/admin/account-requests`: explicit enabled platform ADMIN only, bounded pending-request queue and audited recovery. Linked from platform administration. Studio ownership, SUPPORT and MODERATOR confer no recovery authority.
- `/account/deactivated`: static public explanation and support link, with no private request data or recovery authority.

Only `users.displayName` is editable. Name length is 1–100 trimmed characters with control characters rejected. Auth email, provider profile name, password and verification settings are unchanged. The root-owned auth projection prefers displayName and denies disabled accounts.

## Account and project index v1

This is an **Account and project index**, not a full archive. The UI and completed manifest list these fields:

- Personal user ID, display name, email and account timestamps.
- Own canonical/legacy studio membership IDs, studio IDs, role, state and timestamps. Legacy rows are deduplicated between their canonical user-ID and external-ID lookup sources.
- Own project membership ID, role, state and timestamps. A project ID is included only while canonical access to that project succeeds; inactive or inaccessible membership rows expose no project ID or project content.
- Project records currently accessible as OWNER or EDITOR: project ID, name, description, type, lifecycle state, own role, creation/update/archive/deletion timestamps and restriction state. Authorized archived/deleted records remain included.
- Restricted project records contain only project ID, name, lifecycle state, restriction state and own role. The canonical restricted-read exception is used only for these metadata projections.

Media/binary downloads, URLs, production contents, scripts, timelines, full project archives, auth/session tables, secrets, provider/voice identifiers, worker authority, raw metadata and other people's profiles are excluded. This packet makes no data-erasure or legal-compliance certification.

Discovery paginates the user's explicit project memberships, then indexed owner/creator migration sources across studios. Any explicit membership row excludes the migration fallback, including a REMOVED/SUSPENDED row. Duplicate owner/creator source records are suppressed. Every candidate passes actual `requireProjectAccess`; OWNER/EDITOR is checked again before exporting a project record. Expected canonical denial skips a record; database/transport failures abort, never masquerade as empty completion. There is no recent-20 sample or fixed total-record cutoff.

`accountExportRequests` persists only request metadata, a server-owned continuation, ordinal and complete-record count. `accountExportPages` persists only start/end continuations, record count, byte count and SHA-256; no exported payload or credentials are stored there. Each part uses at most one native pagination call, at most five source rows, and a 120 KiB payload cap (under 128 KiB including its manifest line). Sparse and empty parts retain continuation until all sections explicitly finish.

Requests expire after 24 hours. Each downloaded `.jsonl` file begins with a `part_manifest`; its `payloadSha256` is SHA-256 of the UTF-8 bytes following that first line. Ordinary `record` lines are readable JSON. An oversized individual record is losslessly encoded as `record_fragment` lines. Group by recordId, base64-decode and concatenate bytes in offset order, verify totalBytes and SHA-256, then decode the resulting UTF-8 JSON. UTF-8 characters may span fragments. Fragment continuation checks the record ID and full-record hash; changed content or lost access fails explicitly.

Profile/status queries receive an explicit display timestamp; it only labels expiry and cannot authorize a download. Part and manifest downloads enforce the server clock in mutations. Manifest generation is read-only but uses a mutation to prevent a cached query result outliving the expiry window. The UI displays the expiry as a stable UTC ISO timestamp.

The browser keeps only one bounded part in memory and offers each as a separate download. The current request/next ordinal is server-persisted, so a refreshed page resumes it. A prior part can be downloaded by ordinal when a browser rejected or lost its first download. Replaying the same part recomputes it, rechecks current authorization, and requires matching content, cursor and count before returning it. No saved payload bypasses later membership revocation. Changed data requires closing and restarting the index. The final manifest lists scope, part count, record count, contiguous file naming and integrity/reassembly instructions; save it alongside every part. “Prepared” does not claim that the browser saved a file. Previously downloaded files remain on the user's device.

This is a live authorized index, not a transactionally frozen snapshot. Membership and content can change while it is prepared. No mutation is retried automatically by the UI; the same stable request/part number supports explicit safe retry.

## Deactivation and recovery

The form is labeled “Request deletion and deactivate access.” It explicitly says that this submits a retained-data request, disables access immediately and does **not** permanently delete projects, membership history or audit. The requester should complete the index first. A successful preflight is informational: the mutation repeats all checks in its own transaction, requires a reason and exact `DEACTIVATE` confirmation, then inserts the request, links it to the user, disables the user and appends audit atomically.

Safety checks reject:

- The last enabled ACTIVE platform ADMIN. Disabled other admins cannot satisfy the guard.
- A primary studio owner while another active enabled collaborator exists. Shared studio handoff is a separate B04 workflow and is deliberately not implemented here.
- A shared project owner without another enabled explicit OWNER who has active canonical studio access (or is that studio's recorded primary owner). Disabled owners do not preserve access. Indexed legacy creator/owner projects are checked too; explicit removal still overrides fallback.
- An incomplete bounded ownership scan. Limits are explicit (25 rows per studio-ownership source, 100 own project memberships or project rows per ownership source, 50 collaborator rows per workspace/project, and 500 cumulative safety candidates). Larger accounts receive a staff-assisted review blocker; the code never pretends a partial scan proves safe deactivation.

Projects and descendants are untouched, and memberships/platform grants are retained as history. Existing `requireUser`, `ensureAccount`, auth session creation and the root-owned disabled-user projection prevent ordinary new actions and self-reactivation. Request replay is a narrow exception for the same already-linked disabled user's verified session, request ID, reason and REQUESTED state; it only returns the prior receipt and cannot enable anything. Other disabled-user operations still fail.

The client receives the receipt before signing out and opening the static confirmation. The request action intentionally does not revalidate the protected dashboard while that receipt is being delivered. If sign-out fails, it shows the receipt and offers a sign-out retry. A reload still cannot restore account access.

Recovery is explicit ADMIN-only cancellation of the linked REQUESTED record, with required review reason. It atomically re-enables that account, clears its request link, retains the request as CANCELED with actor/time/reason, and records `ACCOUNT_DEACTIVATION_RECOVERED` in PLATFORM audit. It does not grant roles or alter projects. The same administrator/reason can replay without another write; a changed decision is rejected. Generic platform enable/disable refuses linked deactivation requests, including replay attempts, so recovery cannot bypass its dedicated audit. There is no public/self-recovery mutation or permanent-deletion worker.

## Evidence and remaining gates

- `node tests/account/run-account-lifecycle-contracts.cjs`: actual authorization and handlers in memory; cross-user denial, profile isolation, more-than-20 explicit/legacy completeness and deduplication, removed/foreign/viewer exclusion, restricted/inactive projections, UTF-8 fragmentation/integrity, bounded parts, replay reauthorization/content changes/transport propagation/expiry, last ADMIN/shared-owner guards, retained data, disabled ensureAccount, generic-enable denial, ADMIN-only idempotent recovery and explicit scan-limit refusal.
- `node tests/account/run-account-surfaces.cjs`: SSR labels/scope/resumption/manifest states, guarded account and ADMIN pages, exact server-action targets, no disabled-dashboard revalidation, safe error output and static confirmation privacy.
- Root and Convex TypeScript, changed-file ESLint and existing platform contracts are regression checks.

No live account was deactivated, no online fixture was seeded and no deployment/database/provider/payment/email operation was run by this packet's implementation agent. Real browser download/resumption/sign-out, fixture-only online deactivation/recovery and operational support review remain coordinator acceptance gates. Email/password recovery delivery, verification and payments remain last. B04 invitation acceptance remains design-only and must resolve verified recipient proof before any email-bound acceptance flow ships.

## Opt-in actual-Auth online driver

The coordinator can run `node tests/account/run-online-account-lifecycle.mjs` **after deploying B03**. The implementation agent has not run it online. It uses actual Convex Auth bearer sessions and existing public account/project APIs; it creates no test endpoints, simulated identities or role grants.

Required private runner environment:

- `FINALFRAME_ALLOW_ACCOUNT_ONLINE_TESTS=true`.
- `NEXT_PUBLIC_CONVEX_URL`: exact single-deployment HTTPS `*.convex.cloud` origin; custom hosts, ports, URL credentials, paths and query strings are rejected.
- `FINALFRAME_ACCOUNT_FIXTURE_RUN_ID`: a new lowercase UUID.
- `FINALFRAME_ACCOUNT_FIXTURE_EMAIL`: exactly `finalframe-b03-fixture-<UUID>@example.test` or `finalframe-b03-fixture-<UUID>@finalframe.fixture.invalid` for that run UUID.
- `FINALFRAME_ACCOUNT_FIXTURE_PASSWORD`: a supplied dedicated password of at least 12 characters, different from the administrator password. The driver never generates credentials.
- `FINALFRAME_ACCOUNT_ADMIN_EMAIL` / `FINALFRAME_ACCOUNT_ADMIN_PASSWORD`: coordinator-supplied owner ADMIN credentials. Optional `FINALFRAME_ACCOUNT_ADMIN_USER_ID` pins the expected canonical administrator ID too.

Before any authentication attempt, a read-only CLI `env get CONVEX_AUTH_EMAIL_ENABLED --deployment <exact-host-deployment>` must prove remote email delivery is unset/false. Lookup/transport failure aborts. It never changes environment variables or prints their values. This is the only CLI operation; all application tests use actual bearer clients pointed at the identical cloud origin. No email, provider, payment or rendering API is called.

The real administrator uses sign-in only. Explicit ADMIN authority and canonical identity are checked, and `ensureAccount`, project mutation and deactivation are never called on that client. The fixture uses fresh sign-up only, with no “existing user sign-in” fallback; duplicate sign-up or a pre-existing run state aborts. It then signs out/signs in with the supplied fixture credentials and provisions only that fresh account. Fixture identity/email must match the exact run, differ from the ADMIN ID, and hold no platform grant before any lifecycle change.

Six small canonically owned projects force native index pagination beyond the five-row page size. Parts are fetched serially and checked for size, SHA-256, contiguous ordinals, exact project coverage, replay identity and final manifest counts. The index is kept bounded in driver memory; it is not claimed as a browser-download test. Unexpectedly large output or incomplete 100-page discovery fails explicitly instead of reporting truncated completion. An ADMIN session attempting to download that fixture's index is denied by ordinary ownership checks.

The driver requests fixture deactivation, verifies disabled reads, `ensureAccount`, actual re-sign-in and generic-enable denial, then has the real owner ADMIN cancel only the exact fixture request with a reason. Request discovery is serialized/paginated and checks canonical user ID, exact fixture email and run-marked reason before recovery. Recovery replay is checked, actual fixture sign-in is restored and all six projects must still exist.

In `finally`, only the confirmed fresh fixture can be recovered for cleanup. Canonical library discovery checks exact run-marked names plus both owner/creator IDs before soft-deleting its own projects. Records are reread with `includeInactive` to prove retention. The index is closed, the fixture is deactivated again and pending-request/disabled-read checks confirm the final state. The ADMIN must remain enabled. Test sessions are signed out. There are no automatic retries of ambiguous mutations. A fresh non-secret cleanup operation UUID allows a resumed cleanup to recover an earlier pending cleanup request and deactivate again without reusing a canceled request key.

The default private state file is `/tmp/finalframe-b03-<UUID>.json`, overridable with `FINALFRAME_ACCOUNT_FIXTURE_STATE_FILE`. It stores only the run, fake fixture email, confirmed fixture IDs, planned safe request IDs/reasons and cleanup evidence; it never stores passwords, bearer/refresh tokens, administrator email or export payloads. Files are mode 0600. An interrupted confirmed run can be resumed for cleanup using the same exact environment/state file and `FINALFRAME_ACCOUNT_FIXTURE_CLEANUP_ONLY=true`. Do not edit IDs or reuse this mode for ordinary accounts. A sign-up with an ambiguous response before confirmation requires coordinator review: the driver refuses to guess that an existing account is disposable. Cleanup failures are reported explicitly with the run UUID.

`node tests/account/run-online-account-guards.mjs` validates target/fixture/credential separation offline. Driver syntax and ESLint are also local checks; none imply an online pass.
