# FinalFrame storage cleanup — 20 November 2026

## Verified result

Online deployment: `knowing-snail-785`, the current FinalFrame backend.

| Measurement | Before | After |
| --- | ---: | ---: |
| Stored files | 330 | 324 |
| File bytes | 309,580,915 | 309,553,019 |
| Unreferenced reviewed fixtures | 6 | 0 |

Removed exactly **27,896 bytes**: two one-pixel PNG fixtures, two blank PNG fixtures, and two four-second video fixtures. All six were unreferenced in both the earlier November 14 inventory and this inventory. Every remaining storage record has identical metadata to its pre-cleanup record. No application documents were deleted. An audit event was added.

Before cleanup, video files accounted for 272,366,272 bytes, audio for 21,075,057 bytes, and images for 16,139,586 bytes. The largest file was a retained 45,330,000-byte 30-minute movie fixture referenced by movie exports. Saved outputs, archived test projects, immutable manifests, accounts, pending recovery jobs, and all other referenced media were preserved.

The full application metadata snapshot contained 10,451 documents and approximately 8.57 MB of serialized JSON. This is not an exact measurement of billable database storage.

## Safety and evidence

`convex/maintenanceOrphanFiles20261120.ts` is an internal, deployment-specific, idempotent maintenance operation. It permits only the six reviewed IDs with their exact sizes and SHA-256 values. It checks age, scans all schema tables plus scheduled functions for references, and aborts if a reference, metadata mismatch, or scan bound is encountered. Reference checks and deletions run within one transaction. The execution scanned 10,691 documents, including scheduled functions.

A full metadata backup and the six checksum-verified file bodies were saved privately under `/home/ashuboris/.codex/artifacts/finalframe/storage-20261120/`. Private snapshots, file URLs, and credentials are not committed. Files could be reuploaded from these backups if necessary; reuploading does not promise the same storage ID. These removed fixtures had no retained references.

Evidence includes `storage-before.json`, `storage-after.json`, `dry-run.json`, `cleanup-result.json`, and the private reference audit. The before/after comparison confirmed exactly six removals, no additions, and unchanged metadata for all 324 retained files.

Validation passed:

- Cleanup contract tests: dry-run, backup requirement, nested-reference denial, metadata/age/bounds refusal, exact deletion, audit, and idempotency.
- TypeScript check and scoped ESLint.
- Online Convex deployment and dry-run before execution.
- Post-cleanup storage comparison.
- Existing Bachs payment contract tests (mocked; no purchase).

## Storage versus monthly transfer

The **1.28 GB** captured in the November 14 dashboard was monthly data egress, not stored file size. It must not be presented as today's meter. The current dashboard session expired; a new login is needed to read the current monthly totals and billing state. CLI access remained sufficient to inventory and safely clean the files.

Deleting files does not reverse earlier transfer usage. Repeated video downloads, processing and reference fetches can consume transfer even when stored files occupy much less space. Retain representative evidence and avoid redundant downloads; do not purge project-linked media to disguise the transfer problem.

## Upgrade recommendation

The [official pricing page](https://www.convex.dev/pricing), checked November 20, lists Starter at $0/month plus usage and Professional at $25 per developer/month. Starter includes 1 GB file storage and 1 GB data egress; standard US-East additional egress is $0.132/GB. Other usage and regional rates can affect the bill.

The current approximately 310 MB of files alone does not justify Professional. If the free transfer allowance is blocking development, review Starter pay-as-you-go first, after checking the actual account usage and available plans. No subscription was purchased and no spending cap was changed. Team-wide hard spending caps can affect unrelated applications; do not apply one casually.

Sources: [usage definitions](https://docs.convex.dev/production/usage-limits), [team billing and spending controls](https://docs.convex.dev/dashboard/teams/teams).

## Payment handoff

The existing Bachs contract suite passes. This proves mocked adapter behavior, not live checkout readiness. The online Convex deployment currently lacks `BACHS_WEBHOOK_SECRET`; Vercel payment credential presence still needs verification. Local configuration also lacks Bachs credentials. Do not claim these checks prove credentials are absent from every environment.

Next: verify the merchant account and current provider contract, configure sandbox credentials/webhook privately, exercise checkout/cancel/duplicate-webhook/credit settlement/refund behavior, confirm the owner's credit-pack prices and refund terms, then activate live payments after those checks. No customer billing was enabled as part of storage cleanup.
