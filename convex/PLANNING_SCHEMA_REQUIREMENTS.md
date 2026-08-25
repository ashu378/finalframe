# Planning persistence schema requirements

`convex/planning.ts` is intentionally implemented against the current schema without editing `convex/schema.ts`.

The current schema has no dedicated idempotency-key columns on `createIntents`, `directorPlans`, or `productionVersions`. Planning stores its idempotency metadata in `createIntents.metadata.planning` and `directorPlans.approval`. This is safe for the current deployment, but a later schema-owned migration should add indexed fields:

- `createIntents.idempotencyKey`
- `directorPlans.idempotencyKey`
- `directorPlans.supersedesPlanId`
- `productionVersions.approvalIdempotencyKey`

The migration should add `by_studio_idempotency`, `by_production_idempotency`, and `by_source_plan` indexes, backfill values from the existing metadata, and retain the metadata envelope for backward compatibility.

