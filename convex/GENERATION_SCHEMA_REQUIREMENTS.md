# Durable generation schema requirements

The durable job implementation intentionally does not edit `convex/schema.ts`.

Existing fields used now:

- `requestHash`, `attemptCount`, `leaseId`, `leaseExpiresAt`, `nextAttemptAt`, and `providerJobId` on `generationJobs`.
- `attempts` records for attempt number, retryability, provider task IDs, and errors.
- Existing status values mapped as `QUEUED`, `PROCESSING`, `SUBMITTED`, `PENDING`, `RETRYING`, `COMPLETED`, `FAILED`, and `CANCELED`.

Future schema work should add dedicated lifecycle values (`LEASED`, `POLLING`, `DOWNLOADING`, `INGESTING`, `QC_PENDING`, `TIMED_OUT`, and `RECONCILIATION_REQUIRED`), an indexed `nextAttemptAt`, and an explicit worker/service identity for auditability. Scheduled hooks are currently internal Convex functions; public job operations always require verified Convex identity and studio membership.

