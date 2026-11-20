# Live email verification and password recovery — 20 November 2026

## Activation

Enabled on `https://www.usefinalframe.xyz` (the apex redirects here), using the existing online Convex deployment `knowing-snail-785`. `CONVEX_AUTH_EMAIL_ENABLED=true`; the temporary three-address test allowlist was removed after staged testing. The public availability query returns `enabled: true`.

Application revisions: `9572f29` and follow-up `2e3c0d9`. Vercel reports the latter deployment successful: `BFdbdsnmQD2zBDn8xFYVawJ9rpMk`. Convex's matching functions were deployed at 21:34 Africa/Douala before global activation. These changes do not activate payments or certify the outstanding video-quality checklist.

Sender: `FinalFrame <support@usefinalframe.com>` through the account's verified Zoho CPaaS agent. Secrets remain server-side in Convex. The website's `.com` cutover and the business mailbox's inbound behavior are separate; these tests certify outgoing account mail and account recovery on the live `.xyz` website.

## Behavior and fixes

- Separate six-digit signup-verification and password-reset codes, ten-minute expiry and single use. Email links open the appropriate form without embedding credentials in URLs.
- Existing unverified accounts can verify during their next password login or recover access through the reset flow. No address is automatically marked verified. Existing passwords and active sessions are preserved unless that account resets its password or signs out.
- Server-side resend limit: one message per recipient per minute, five per hour, and 100 messages globally per hour. Recipient limiter keys are hashed. Throttled resends do not replace the current code.
- Failed verification/password attempts use Convex Auth's five-per-hour replenishing limit. User-facing forms show safe messages. Unknown-account reset requests have the same HTTP response as ordinary reset requests.
- Password resets revoke other sessions. Added an active-session check to middleware's authentication query, the current-user query and shared backend identity authorization so an otherwise unexpired JWT cannot retain access after its session is revoked.
- Fixed the custom users schema's missing Convex Auth `email` index. Renamed `by_email` to `email`, updated the sole application caller, and added the required `phone` index. No user records were deleted or rewritten.
- Fixed provider materialization: Convex Credentials keeps its real callback in `options`; flattening before wrapping prevents the library from replacing our staged activation and send-limit checks. A regression uses the actual installed Password provider.
- Recovery forms now use backend availability, so activation does not require a second Vercel environment flag. Verification/resend and recovery are available in the existing auth design, including phone-sized layouts.

## Verified results

Tests used controlled Gmail aliases belonging to the owner. No password for the owner's primary account was changed. No paid AI request was made.

| Test | Result and evidence |
| --- | --- |
| Signup on live `/api/auth` | Pass: no session issued before verification; six-digit message delivered. Repeated after global activation with an address outside the former allowlist. |
| Actual delivery | Pass: Zoho delivery log records both verification and reset messages as Delivered to the controlled Gmail destination. This proves destination mail-server delivery, not guaranteed inbox placement. |
| Wrong code / wrong purpose / used code | Pass: rejected. A verification code cannot reset a password; consumed verification and reset codes cannot be reused. |
| Real expiry | Pass: untouched delivered code rejected after 614 seconds; no artificial clock/database expiry changes. |
| Resend | Pass: immediate second request rejected by the server. Earlier code rejected after a successful resend; latest code remained usable despite a throttled resend. |
| Attempt limiting | Pass: repeated bad codes rejected; persisted online `authRateLimits` record had less than one remaining attempt after the configured limit. |
| Browser verification | Pass: wrong code shows safe copy; latest delivered code reaches the new account's dashboard. Name survives verification. |
| Public forgot-password form | Pass: submitted through browser, showed generic confirmation and disabled resend button; matching email delivered. Link opens the code/new-password/confirmation form. |
| Password change | Pass through live website auth API: delivered reset code sets a new test password; replay fails, former password fails, new password logs in. Repeated after global activation. |
| Other-session revocation | Pass: saved pre-reset cookie session redirects to login immediately after reset. |
| Browser login/logout | Pass: new test password reaches dashboard; sign-out returns to public site. |
| Unknown account | Pass: reset returns the same HTTP 200/no-session shape without disclosing existence. |
| Mobile recovery | Pass: 390px viewport inspection; document width 381px and scroll width 381px, no horizontal overflow. |

The password change itself was exercised through the live HTTP auth endpoint, not browser automation; browser coverage includes verification, login/logout, reset request, navigation and reset form rendering. This distinction is intentional and does not claim a browser password-change submission was performed.

## Automated checks

- `node tests/auth/run-email-policy.cjs`: five groups passed.
- `node tests/auth/run-email-delivery.cjs`: five groups passed, including provider rejection, timeout, missing secrets, untrusted endpoints, no tracking and no duplicate retry.
- `node tests/auth/run-session-revocation.cjs`: active versus revoked/expired/mismatched/invalid/anonymous session checks passed.
- `node tests/auth/run-password-provider.cjs`: actual installed provider materialization passed.
- Existing account lifecycle and legacy-bootstrap security contracts passed.
- TypeScript, scoped ESLint and production build passed. Vercel's final code deployment succeeded.

## Evidence and operational notes

Local evidence folder: `/home/ashuboris/.codex/artifacts/finalframe/email-2026-11-20/` (`verified-dashboard.png`, `recovery-request.png`, `recovery-mobile.png`, plus prior sending proof). Authentication codes, passwords, tokens and cookies are not included in Git or these reports.

Convex deployment emitted an **above Free plan limits** warning. Tests and deployment succeeded, but quota cleanup or an owner-selected upgrade is still required to avoid a later service interruption. No paid plan was purchased or quota raised.

If the email provider fails, keep the current verified-user sessions and records intact; restore the last compatible code if required. Setting `CONVEX_AUTH_EMAIL_ENABLED=false` is an emergency rollback that also disables the verification requirement and recovery UI, so it must be a deliberate incident decision rather than an automatic fallback. Never clear verification/session/ledger tables as rollback. Keep the new session-revocation guard when reverting unrelated frontend changes.
