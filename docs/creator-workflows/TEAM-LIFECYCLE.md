# Team invitations, workspace selection and owner handoff

## Delivery and identity contract

This packet supports existing canonical account IDs with manually copied invitation links. It sends no email, searches no global account directory, and treats no unverified email string as recipient proof. A user copies only their own canonical account ID from `/dashboard/settings/account` and shares it with the workspace owner/administrator who intends to invite them. Sharing the ID alone grants nothing.

The issuer's browser generates 32 random bytes using Web Crypto and encodes a 43-character base64url token. Only its SHA-256 hash is sent to invitation creation and stored in `studioInvitations`; raw tokens never enter invitation/audit storage or roster/list responses. The copyable link uses `/invite#token=...`, keeping the secret out of HTTP URL queries and referrers. The landing removes the fragment from browser history and keeps the token only in memory. If the recipient needs to sign in, they sign in and reopen the private link; the token is not forwarded through a login redirect or persisted for later retrieval. A lost issuer-side token requires revoking the invitation and creating another.

Preview and acceptance require the exact enabled canonical recipient's verified session. A different account gets no studio/name/role preview. A valid token alone grants no access. Expiry is checked on the server for every uncached preview and acceptance; creation permits one minute through seven days. Lists use an explicit display timestamp, which cannot authorize acceptance. An accepted receipt cannot restore a removed/suspended membership or overwrite a later role.

Email-bound invitations remain deferred until verified recipient-email proof and delivery are implemented in the last email packet. No email delivery or verification flag is changed here.

## Workspace roles and routes

- `/dashboard/settings/team`: real paginated own-workspace picker, authorized roster/invitation records, copy-link creation, member review and owner handoff.
- `/invite`: private-token landing and explicit recipient acceptance, outside the dashboard guard so a signed-out recipient can receive sign-in instructions without losing a secret into query parameters. No indexing.
- `/dashboard/settings/account`: read-only own account ID and copy control, alongside B03 profile/index/request flows.

| Actor | Allowed team changes |
|---|---|
| Current recorded primary owner with active owner membership | Invite members/admins; grant/review admin authority; explicit restoration; suspend/remove others after ownership safety review; revoke invitations; transfer primary ownership |
| Active workspace administrator (including a non-primary legacy owner role) | Invite ordinary members; manage active ordinary members; revoke ordinary-member invitations |
| Ordinary workspace member | Select an actually authorized workspace; accept an invitation addressed to their own canonical ID; read their own account ID |
| Platform ADMIN/SUPPORT/MODERATOR alone | No workspace membership or team authority is implied |

No invitation grants `owner`. No workspace action changes a project's membership/ownership or grants platform roles. Project membership remains a separate canonical boundary. Primary owners cannot be demoted/suspended/removed through generic member controls.

## Canonical membership and current workspace

`studioMemberships.studioRoleForUser` is a shared, pure stored-record inspector, not a public endpoint or alternate identity context. Verified actor checks remain in authorization functions. Every explicit canonical membership is authoritative: only `active` returns its role; invited/suspended/removed immediately deny before legacy membership or recorded-owner fallback. With no canonical row, an existing inactive legacy row also blocks owner fallback. A legacy userId, when present, must match the verified/stored user being inspected.

`authorization.requireCurrentMember`, `account.current` and `auth.currentUser` use the same `currentStudioForUser`. A stored `users.currentStudioId` is only a preference and is revalidated before use. Without an authorized preference, bounded indexed active-member/legacy/recorded-owner candidates are individually validated. Incomplete safety scans fail explicitly; they do not select denied fallback records. Disabled account and display-name guards remain intact.

`ensureAccount` never reactivates or re-promotes an existing canonical row. It backfills missing rows only for an already authorized workspace with that resolved role. Existing inactive owned workspace records cause an explicit denial, not resurrection. Genuinely new/no-workspace accounts still receive a zero-credit personal studio. An existing valid member workspace is reused after owner handoff instead of manufacturing a second studio. A former primary owner's canonical admin role remains admin. A transferred-away external studio key is not reused for a different workspace.

Workspace selection lists only the caller's authorized workspaces, with canonical/legacy/recorded-owner cursor phases and deduplication. Selecting or accepting a workspace validates membership and updates the preference; no new access is inferred from a client-supplied studio ID. Dashboard/create/settings resolution follows that preference, so joining another studio is usable even when the recipient already has a personal studio.

## Invitation and member lifecycle

Creation validates issuer authority, exact enabled recipient ID, role, hash, expiry and stable request. It rejects existing canonical/legacy membership records; inactive records require explicit owner restoration instead. Existing unexpired pending invitations must be revoked before replacement; incomplete bounded pending scans reject creation. Creation replay binds studio, recipient, role, hash and expiry.

Acceptance rechecks issuer authority, account status, token, expiry and absence of conflicting membership. An ADMIN invitation requires its issuer still be the current recorded owner. Removed/suspended issuers cannot rely on stale active legacy rows. The mutation atomically creates canonical ACTIVE membership, synchronizes the legacy membership, marks the invitation ACCEPTED with recipient/request/time, optionally selects the joined workspace, and appends audit. It grants no project access. Same-request replay requires an existing active canonical membership, preserves current roles/preferences and binds the workspace-selection intent. Changed or inactive memberships fail instead of being revived by old tokens.

Revocation applies only to PENDING invitations, requires an authorized reason/request, retains history and is idempotent. Explicit member review synchronizes canonical and bounded matching legacy rows. Removed canonical membership is retained as a tombstone; legacy state becomes suspended. Restoration is current-recorded-owner-only and cannot enable a disabled account or bypass a pending B03 deactivation request. Legacy aliases are updated by canonical user ID as well as external identity; ambiguous multiplicity requires migration review.

Member suspension/removal performs a conservative bounded project-ownership check. The prospective inactive member never counts as another eligible owner. Other peers must be enabled and pass the shared canonical workspace resolver. If an affected shared project would lack another eligible OWNER, the action fails with a generic message containing no project name or ID. An incomplete ownership scan fails explicitly. Project records and project-member history are retained and no project role is automatically granted/transferred. B03 deactivation now uses the same workspace resolver when validating alternate project owners.

## Atomic owner handoff and audit

Only the current recorded primary owner with active owner membership can initiate a new transfer. The successor must already be an enabled ACTIVE canonical member, cannot be the actor, and cannot have a pending account deactivation. The confirmation must be `TRANSFER <exact-successor-account-id>`, with a reason and stable request ID.

The Convex mutation atomically updates `ownerUserId`, `ownerId`, `ownerExternalId`, successor canonical/legacy owner roles and former-owner canonical/legacy admin roles. There is no gap without a primary owner. A repeated original request by the still-authorized former owner returns its receipt only while the intended successor remains the current owner; changed operation intent or later transfers reject replay. No project or platform role changes. Account provisioning cannot promote the former owner back.

Every invitation/member/handoff decision appends an existing `audit` row scoped to the studio with `metadata.scope = STUDIO` and a bound correlation/fingerprint. Raw tokens are absent. These canonical audit rows are retained for coordinator inspection. The existing operations audit currently reads the legacy auditEvents table, so it does not display these new canonical team events; a projected canonical studio-audit view remains a separate product acceptance item. Scope is not a second role system or a platform grant.

The old `app.team` raw unbounded directory and `app.inviteTeamMember/updateTeamMember/removeTeamMember` writes now return explicit compatibility errors. Their active adapter/UI callers were replaced; the old email dialog, legacy role menu and unused header were removed. Retired exports cannot silently create email invitations or owner grants.

The remaining studio-operations `app.adminUsers` compatibility read is separately bounded to the existing100-row recent sample and guarded by actual current-studio admin membership. It now whitelists only ID, display name, role and membership state, preferring canonical role/state where present. It never spreads a peer user document or returns authSubject, raw metadata, profile email or a legacy external email as a fallback. The operations page labels the sample and links to the full paginated team route; no platform authority is implied.

## Evidence and remaining acceptance

- `node tests/team/run-team-lifecycle-contracts.cjs`: real authorization/current-user/account handlers in memory, inactive canonical/legacy owner fallback denial, safe provisioning, owner/admin invitation limits, recipient privacy, hash-only storage/audit, expiry/revocation and issuer recheck, canonical+legacy acceptance/selection with no project grant, replay/restoration, atomic typed handoff/former-owner safety, sole-enabled-project-owner removal blocker, complete paginated roster/workspace deduplication and cursor scoping, retired legacy endpoints.
- `node tests/team/run-team-surfaces.cjs`: secure token/hash format, SSR role/owner controls and pagination, exact-ID/manual-copy language, no owner/email creation fields, hash-only creation payload, exact server-action targets and public landing privacy.
- Existing account, project-library/owner-transfer/template-replay/platform suites are regression checks after their source loaders include the new shared helper. Root and Convex TypeScript plus changed-file ESLint are required.

No live invitations, team messages, DB mutations, deployments, owner transfers, paid/provider calls or email/payment changes were performed by the implementation agent. Actual-Auth fixture invitation/acceptance/handoff/removal and browser fragment/clipboard/workspace-switch acceptance remain coordinator gates. No personal voice/performance assets are involved.

## Opt-in real Auth B04 driver

`tests/team/run-online-team-lifecycle.mjs` uses only existing public Auth/account/team/project APIs and actual bearer sessions. It is pinned to `https://knowing-snail-785.convex.cloud` and never reads real-owner credentials. All three accounts must be freshly created, separate UUID-scoped fixtures with no platform role. Existing account sign-up failure never falls back to treating that account as disposable. The implementation agent only ran syntax, ESLint and `node tests/team/run-online-team-guards.mjs` locally; no online pass is claimed.

The coordinator creates the private environment file locally. This example generates credentials only when the coordinator explicitly runs it; it prints no password/token and performs no network operation:

```bash
export FINALFRAME_TEAM_ENV_FILE=/tmp/finalframe-b04-private.env
python - <<'PY'
import os, secrets, shlex, uuid
run = str(uuid.uuid4())
values = {
    'FINALFRAME_ALLOW_TEAM_ONLINE_TESTS': 'true',
    'NEXT_PUBLIC_CONVEX_URL': 'https://knowing-snail-785.convex.cloud',
    'FINALFRAME_TEAM_RUN_ID': run,
    'FINALFRAME_TEAM_STATE_FILE': '/tmp/finalframe-b04-' + run + '.json',
}
for actor in ('a', 'b', 'c'):
    values['FINALFRAME_TEAM_' + actor.upper() + '_EMAIL'] = 'finalframe-b04-' + actor + '-' + run + '@example.test'
    values['FINALFRAME_TEAM_' + actor.upper() + '_PASSWORD'] = secrets.token_urlsafe(24)
fd = os.open(os.environ['FINALFRAME_TEAM_ENV_FILE'], os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as output:
    output.write('\n'.join(key + '=' + shlex.quote(value) for key, value in values.items()) + '\n')
PY
set -a
. "$FINALFRAME_TEAM_ENV_FILE"
set +a
node tests/team/run-online-team-lifecycle.mjs
```

Run only after the coordinator has deployed B04. Before any Auth attempt, the driver reads `CONVEX_AUTH_EMAIL_ENABLED` through the CLI with `--deployment knowing-snail-785`; unset/false is required, lookup errors abort, and no environment variable is changed. The real test includes an ordinary short-lived invitation expiry, so it can take roughly one extra minute. There is no server-clock override or invitation-test endpoint. It does not send email, call providers or deploy code.

Essential flows: three actual sign-up/sign-in accounts; recipient-ID invitation with hash-only creation and in-memory copied fragment; wrong-recipient denial; acceptance/replay; selected workspace surviving actual sign-out/sign-in/provisioning; stale issuer suspension; revoked and genuinely expired links; typed owner handoff and former-owner promotion denial; member removal with canonical/legacy/current-preference/provisioning tombstone denial; current-owner-only restoration and retained project read. The copy-link parsing exercise is API acceptance, not proof of a browser clipboard click.

Only one small original fixture project is created. Cleanup discovers complete bounded roster/invitation/project pages before mutating status-indexed lists. Every target must belong to a confirmed fresh fixture and match its verified ID/email, with no platform role. If needed, the current fixture owner restores the original fixture project owner solely to read and soft-delete that owner's project through canonical guards. It retains the project record and all audit. It revokes pending links, removes cross-fixture memberships (accepted tokens cannot reinstate tombstones), and only then performs B03 safety preflight/deactivation for the isolated fixtures. No project membership is granted to ease cleanup, no ownership safety blocker is bypassed and the actual owner account is never used.

The mode-0600 state file stores fake fixture emails, confirmed fixture IDs, invitation IDs/hashes, project IDs and planned safe deactivation requests. It stores no passwords, bearer/refresh tokens or raw invitation secrets. Exclusive initial creation prevents accidental reuse. If an interrupted confirmed run needs cleanup, keep the exact private env and state file and run:

```bash
FINALFRAME_TEAM_CLEANUP_ONLY=true node tests/team/run-online-team-lifecycle.mjs
```

Cleanup-only never resumes invitations using guessed or persisted secrets. It finishes only the known fixture relationships and deactivations. A specific disabled-account sign-in response after a persisted planned cleanup deactivation can confirm that fixture already disabled; transport/login errors never count. An ambiguous sign-up before confirmation or a changed/unknown owner/member/ownership safety state requires coordinator review. No ambiguous mutation is automatically retried. Final output reports actual Auth, check count and cleanup status without credentials or links. All created test sessions are signed out.
