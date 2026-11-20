# FinalFrame email sending verification — 20 November 2026

This records the earlier sending-only checkpoint. It is superseded for activation status by [the completed live authentication report](EMAIL-AUTH-ACTIVATION-2026-11-20.md).

- Owner associated the already verified `usefinalframe.com` domain with the existing `mail_agent_1`.
- Existing DKIM and bounce CNAME both show Verified. No DNS or mailbox records were changed in this check.
- Two controlled messages from `support@usefinalframe.com` to the owner's authorized Gmail inbox show **Delivered** in Zoho: one dashboard test and one test through the exact application sending helper using the credentials stored in online Convex.
- The agent sends successfully. An accessibility-tree shutdown label was misleading; it is not evidence of a current sending block.
- Stored the existing sending token privately in online Convex (`knowing-snail-785`) as `CONVEX_AUTH_ZEPTOMAIL_TOKEN`, configured `CONVEX_AUTH_FROM_EMAIL=FinalFrame <support@usefinalframe.com>` and `CONVEX_AUTH_EMAIL_API_URL=https://cpaas.zoho.com/v1.1/email`. No key was placed in Git or chat, no new credential generated, and the temporary private copy was removed.
- Updated the authentication email transport to support the account's actual CPaaS endpoint. Retains the legacy ZeptoMail endpoint by default. Restricts endpoints, rejects redirects, bounds requests to 15 seconds, hides raw errors, includes plain text and disables open/click tracking for authentication messages.
- Five pure delivery test groups, TypeScript and scoped lint pass. Online Convex deployment checked separately.
- `CONVEX_AUTH_EMAIL_ENABLED` remains `false`: this milestone certifies sending, **not** complete signup-code/password-recovery activation. Current auth still uses the inherited one-hour verification provider and needs the planned OTP, resend, expiry, recovery and browser tests before activation. No user was unexpectedly locked out and no password was changed.
- Evidence: `/home/ashuboris/.codex/artifacts/finalframe/email-2026-11-20/delivery.png` and `api-delivery.json`. The API accepted the message with HTTP 201; its matching request is marked Delivered in the Zoho log.
- Website .com cutover and mailbox receiving behavior are separate from verified transactional sending; they are not certified by these tests.
