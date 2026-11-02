# Planning persistence schema requirements

`convex/planning.ts` is a read-only compatibility surface. New plan and approval writes belong to `convex/productions.ts` and the canonical `productionVersions` table.

The canonical schema now stores optional idempotency and snapshot fields while legacy rows remain readable. Old records may still carry idempotency metadata inside `createIntents.metadata.planning` and `directorPlans.approval`; canonical reads use those envelopes as a migration fallback.

Canonical fields and indexes are:

- `directorPlans.idempotencyKey` with `by_idempotency`.
- `productionVersions.idempotencyKey` with `by_idempotency`.
- `productionVersions.snapshot` for the plan snapshot.
- `productionVersions.sourcePlanId` with `by_source_plan`.

Draft production versions are created through `productions.createPlan`. Approval transitions that draft to an immutable approved snapshot. Later changes create a new director plan and draft production version; an approved version is never overwritten.
