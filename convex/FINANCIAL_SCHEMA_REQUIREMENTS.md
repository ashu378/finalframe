# Finance ledger schema requirements

The finance workstream uses the canonical `credits`, `ledger`, `reservations`, `purchases`, and `refunds` tables. The schema now includes status and idempotency fields for purchase/refund lifecycle handling, while reservation state remains ledger-derived for compatibility with existing generation code.

Current implementation behavior:

- `credits.balance` is available spendable balance and `credits.reserved` is held balance.
- `ledger.amount` is a signed append-only delta; reserve, release/expiry, purchase, refund, and reconciliation entries are idempotent.
- Reservation lifecycle is derived from its ledger entries because `reservations` has no status column.
- Purchase and refund status/idempotency fields are used by the signed Bachs event bridge; successful crediting/refunding is recorded in both the lifecycle record and ledger.
- Legacy `studios.credits` is maintained as a read compatibility projection, never as the authorization source.
- Bachs webhook fulfillment is internal-only and requires raw-body HMAC verification, timestamp freshness, event deduplication, exact amount/currency matching, and quarantine on ambiguity.
- Refunds are only applied after a verified terminal-success refund event. If already-used credits cannot be safely reversed, the refund is quarantined for operator reconciliation rather than creating a negative wallet.

Remaining schema requirements:

- Add a first-class reservation status and terminal timestamps to `reservations`, or retain the documented ledger-derived state contract.
- Add `attemptCount`/reconciliation metadata to financial operations if automated provider variance handling needs bounded retries.
- Add a dedicated financial event table only if provider reconciliation needs immutable raw-event correlation independent of `paymentEvents`; the current payment event table already stores the verified raw payload and processing timestamps.
