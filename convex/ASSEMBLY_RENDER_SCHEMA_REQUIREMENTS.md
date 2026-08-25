# Assembly and render schema requirements

This workstream uses the current Convex schema without editing `convex/schema.ts`.

Implemented against existing tables:

- `manifests` is the canonical ordered assembly record. Its JSON payload carries the idempotency key and ordered shot-version/asset references because the table has no dedicated idempotency column.
- `timelines`, `timelineTracks`, and `timelineClips` provide immutable version records and ordered media clips.
- `renderJobs` stores idempotency, request hash, lease, renderer task ID, progress, failure state, and completion state.
- `exports` stores canonical Convex Storage output records; successful completion does not persist a remote renderer URL.
- Legacy `assemblyJobs` is retained as a compatibility projection pointing to the canonical manifest.

Future schema work should add:

- `manifests.idempotencyKey` with a production/idempotency index.
- `renderJobs.attemptCount`, `nextAttemptAt`, and a dedicated callback/event table.
- Dedicated render statuses such as `LEASED`, `RENDERING`, `UPLOADING`, `VERIFYING`, `TIMED_OUT`, and `RECONCILIATION_REQUIRED`.
- A service/worker identity or signed callback record for auditable renderer callbacks that do not run under an interactive studio member session.
- `assemblyJobs.studioExternalId`, `manifestId`, and `idempotencyKey`; after migration, the legacy projection can be removed.

