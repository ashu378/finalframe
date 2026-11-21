# Bachs sandbox payment acceptance — 21 November 2026

## Boundary and deployment

Owner authorized sandbox integration and creation of the dedicated sandbox key. Live payments remain explicitly disabled in server code; switching Bachs to live, using live credentials, or accepting real money requires owner approval and a separate activation change.

- Website: https://www.usefinalframe.xyz/dashboard/settings
- Backend: existing online Convex `knowing-snail-785` (no local database).
- Initial release: `6ba369b`; settlement/refund/recovery fixes: `86a5be3`.
- Sandbox webhook: `https://knowing-snail-785.convex.site/payments/bachs/webhook`.
- Dedicated endpoint: `whe_mFQ8MvA37QAC4Rea`.
- Dedicated key permissions: account/payment-method reads; payment, product, refund and webhook read/write. No payouts or transfers. Secrets stored outside Git and in server-side Convex environment only.
- Retired sandbox endpoint pointing to `finalframe-nine.vercel.app` disabled reversibly after new deliveries passed. Existing old API key retained; no unrelated account settings changed.

## Implementation

1. Server-owned credit-pack prices and authenticated workspace administrator access, further restricted to platform admins or explicitly allowed test emails.
2. Durable purchase intent before provider submission; stable idempotency key, submission lease, double-click prevention, checkout binding and refusal to resubmit ambiguous requests past the provider's idempotency window.
3. Signed, size-bounded, timestamp-checked raw-body webhook processing. Duplicate receipts checked before provider reconciliation, then rechecked atomically with ledger writes.
4. Successful payment reconciled against the provider's authenticated checkout record: original price/currency/reference, checkout ID, charge ID/status, charged amount/currency, and settlement metadata. Fees and conversion cannot be confused with the original product price.
5. Separate `sandboxPaymentBalances` and `sandboxPaymentLedger`. Test payments never change `credits` or `studios.credits` and cannot buy AI generation.
6. Refunds use the verified settlement amount of the credit purchase (provider fees excluded), stable refund keys and retrieval by charge before retry. Asynchronous pending/success/failure states are retained. Only confirmed paid refunds reverse test credits.
7. Closed legacy public client-priced purchase creation and direct credit-grant endpoints.
8. Website displays sandbox status, separate test and real balances, purchase history, and refund controls for authorized testers.

## Observed provider/browser acceptance

| Case | Result and evidence |
|---|---|
| Saved-account login and delivered verification code | Passed; dashboard opened through ordinary authentication. |
| USD Starter checkout | Passed: checkout `chk_cAEXRKk3W6kpQfPC`, charge `ch_43d2317a9fbb4d02bf095772006f8928`; $5 product + $0.65 simulated provider fee; +100 test credits. |
| Initial fee mismatch | Correctly withheld credits. Fixed server reconciliation and replayed the same signed event; no replacement payment. |
| NGN declined card | Passed: provider decline shown, purchase FAILED, no credits added. |
| Retry same NGN checkout | Passed: `chk_39nYuAUYeUGvJBM9`, charge `ch_4dbf4862cd334a1381b6b4915f9fb79c`; ₦7,500 product + ₦150 simulated fee; exactly +100 credits. |
| USD refund | Passed: `rfnd_LW2rAQG8FB3qGmzS`, provider success, signed refund.paid, exactly −100 test credits. |
| NGN refund | Passed: `rfnd_L8kbn1MGbN01WxJo`, provider success, signed refund.paid, exactly −100 test credits. |
| Cancel and resume | Passed: return URL added no credits; resumed existing `chk_BSRNuqIhtnsXA84I` without another intent. |
| Cameroon XAF mobile-money payment | Passed: same NGN-priced checkout, charge `ch_04f48dafc5674d1888d3beada43aef74`; charged 6,948.83 XAF, settled ₦15,000; exactly +240 test credits. |
| Paid notification replay after refund | Passed: provider resend acknowledged HTTP 200; receipt deduplication prevented a new grant or undoing refund. |
| Direct public credit grant | Denied on online Convex: `A verified payment event is required.` |
| Invalid-signature / signed-stale / oversized HTTP delivery | Denied: safe HTTP 400 / 400 / 413 responses. |
| Real video credit isolation | 344 before and after the above payment/refund tests. |
| Converted mobile-money refund | Passed: `rfnd_4Z3UW1CUmQMn14ht`, signed callback completed while new checkouts were paused; exactly −240 test credits. The first attempt safely rejected insufficient simulated settlement funds; no refund or debit was created. |
| NGN bank transfer | Passed through hosted sandbox checkout, ₦30,000 product + simulated fee; +520 test credits. This supplies simulated merchant funds for the converted refund. Bank-transfer refunds are not supported by the provider route and are not claimed as tested. |
| Pause new checkouts | Passed in the deployed UI: buttons disabled, purchase history retained. Refund processing remains enabled independently. |

All money in these cases is simulated. No live card, real transfer, paid AI request or payout was used.

Final state: all three card/mobile-money credit purchases refunded. The additional sandbox bank-transfer funding purchase remains as **520 non-spendable test credits**. The real video balance remains **344**. Four sandbox purchases and their small audit/ledger records are retained; no media files were created. New sandbox checkout was re-enabled after the pause/recovery test.

## Automated checks

Passed: TypeScript, scoped ESLint, Next.js production build, Bachs provider/signature contracts, finance contracts, and the new checkout-intent, sandbox-ledger and webhook-action suites.

Commands:

```sh
pnpm exec tsc --noEmit
node tests/payments/run-bachs-contract-tests.cjs
node tests/payments/run-checkout-intent-tests.cjs
node tests/payments/run-sandbox-ledger-tests.cjs
node tests/payments/run-webhook-action-tests.cjs
node tests/finance/run-finance-tests.cjs
pnpm run build
```

Contract coverage includes unauthorized/non-test accounts, wrong workspace, client price rejection, duplicate confirmation, lease/retry, stale ambiguous submission, checkout binding, bad amount/currency, missing provider proof, cross-currency settlement, unknown purchase retry, receipt replay, late failure, different charge, once-only refund, excess-refund denial and production-mode denial. Pure tests use stubs; real browser/provider tests and persisted records use online Convex.

## Configuration and rollback

Convex-only secrets/settings: `BACHS_API_KEY`, `BACHS_WEBHOOK_SECRET`, `BACHS_ENVIRONMENT=sandbox`, `BACHS_SANDBOX_ENABLED=true`, existing HTTPS `SITE_URL`. Optional `BACHS_SANDBOX_TEST_EMAILS`, `BACHS_ALLOWED_CURRENCIES` (USD,NGN product pricing), `BACHS_WEBHOOK_TOLERANCE_SECONDS` (300), `BACHS_SANDBOX_CHECKOUT_PAUSED`.

To stop new test checkouts while preserving payment/refund notifications, set `BACHS_SANDBOX_CHECKOUT_PAUSED=true`. Keep the key, webhook, environment and records intact. Do not disable receipt processing while accepted refunds are pending. Roll back frontend only to a compatible sandbox revision; never restore the unsafe legacy public credit-grant behavior. New tables are additive; no project/media migration or deletion was performed.

## Before live activation

- Owner approves switching to live and real-money smoke-test amount.
- Confirm final credit-pack pricing, refund/fee policy and merchant display identity (Bachs currently displays Monetra).
- Implement/review the explicit live ledger fulfillment path and live refund permissions; sandbox has deliberately separate non-spendable credits.
- Configure live key and live webhook separately, repeat a bounded real payment/refund only with authorization.
- No subscription, payout, outbound money-transfer, crypto-refund address flow or real bank settlement is certified by these one-time credit-purchase tests.

## Evidence

Local evidence directory: `/home/ashuboris/.codex/artifacts/finalframe/payments-sandbox-20261121/`. Secrets and private response files must not be published. Safe screenshots and sanitized acceptance-ledger/provider-delivery summaries are retained separately. The provider documents used were Bachs' checkout sessions, sandbox, webhook signing/replay and refunds guides at https://docs.bachs.io/.
