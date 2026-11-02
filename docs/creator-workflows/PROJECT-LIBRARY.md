# Project library

Route inventory addition: authenticated `/dashboard/projects`, with `mode=active|archived|deleted`, optional `q` (name/description substring, at most 100 characters), and opaque `cursor`. The dashboard preview, desktop navigation, and mobile navigation link to this library. Search and lifecycle changes start at the first page; continuation and first-page links preserve the selected search and mode.

`projects.library` first paginates the verified user's `projectMembers.by_user` records. A second cursor phase scans bounded `projects.by_studio` pages for legacy records with no explicit project membership. Only the exact recorded owner/creator fallback accepted by `requireProjectAccess` is eligible. An explicit inactive membership never falls through to this legacy phase. Ambiguous legacy ownership still requires the additive `migrations/projectOwnership` backfill; this query performs no repair or mutation. Studio owner/admin status alone grants no project access.

Each query reads at most 50 candidates. The server page combines bounded queries until it has approximately 20 matches, reaches the end, or scans 200 candidates (at most 12 calls). Sparse searches retain a continuation and explicitly offer **Continue search** instead of claiming there are no matching projects. The dashboard preview has a smaller scan budget and identifies an incomplete empty preview honestly. No recent-record cutoff defines the full library.

The compatibility `projects.list` retains its document-array shape and now applies the same canonical project access guard. Above 500 scanned studio projects it throws an explicit compatibility-limit error. Legacy consumers should use direct authorized project lookups or move to the cursor API; truncation is never presented as a complete result.

Owners/editors can rename or archive active projects and restore inactive projects. Only owners can soft-delete. Deleted listings are restricted to owners/editors. The server mutations recheck these roles regardless of which controls were rendered. Archive preserves the prior lifecycle state; deleting an archived project and restoring it preserves its archived state and timestamp. A subsequent unarchive restores the pre-archive state. These operations retain project descendants, approved versions, media, jobs, and audit history.

No new schema fields or indexes are required. `savedTemplate*` metadata and the earlier canonical template creation helper remain independent of library pagination.

## Verification

- `node tests/project/run-library-contracts.cjs`: actual handlers and authorization in memory; more than 500 projects, canonical and legacy pagination, searches beyond the first 20 records, membership/isolation/inactive denials, cursor binding, unexpected transport errors, lifecycle restoration, retained descendants, server action effects and SSR role controls.
- `node tests/templates/run-template-contracts.cjs` and `node tests/project/run-project-contract.cjs`: earlier canonical creation and project contract regressions.
- Root TypeScript and changed-file ESLint.

These checks use no database or paid providers. Online Convex pagination semantics, owner/editor/viewer browser flows, responsive layout, and retained-history acceptance require coordinator deployment and the `online-project-library` release gate. No production or online acceptance is claimed here.
