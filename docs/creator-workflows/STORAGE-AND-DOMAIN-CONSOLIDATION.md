# Storage, transfer and domain consolidation

14 November 2026. Owner request: stop unnecessary costs, inspect suspected duplicate projects, preserve accounts/projects, put current FinalFrame on its purchased domain. Redesign, email/recovery and payments remain later. No Yafpay or other project was changed.

## Verified inventory

There is one Vercel project, `finalframe`, and one Convex project, FinalFrame. Convex has standard production (`opulent-parakeet-3`) and development (`knowing-snail-785`) deployments. The former had no stored files and no users. All current testing/account data is in the latter. Different Preview URLs do not constitute duplicated Convex projects or duplicated media.

The inspected current database has **307 files /267,567,285 bytes (~255MiB)**. Its metadata-only snapshot contains115 tables and9,980 documents. A private local snapshot was saved with0600 permissions before lifecycle changes; file bodies were not downloaded again. This is NOT a complete media backup.

A complete snapshot reference scan found **six database-unreferenced objects /27,896 bytes**. Almost all large files have real asset/export/movie/job references. In particular the45,330,000-byte fixture movie is linked through `movieExports`. No physical file was purged. Metadata alone cannot restore a deleted media body, and pending worker recovery references must also be considered. Duplicate content across distinct scoped records is not authority to rewrite immutable references.

The dashboard's **1.28GB** is **monthly data egress**, not disk storage. The free file-storage allowance was not exhausted. Deleting files, archives, Vercel previews, or an empty deployment cannot refund bytes already transferred. Downloads, serving provider references, processing files and backups can consume that transfer allowance. [Official limits](https://docs.convex.dev/production/state/limits), [usage definitions](https://docs.convex.dev/production/usage-limits).

## Applied cleanup and transfer reduction

- **26 clearly named owner-owned acceptance-test projects archived**, using existing authenticated canonical lifecycle mutations. Exact names/IDs/prior statuses and restore instructions are in the private artifact `ARCHIVED-TEST-PROJECTS.json`. A project with pending recovery was excluded. Real named personal projects, account, assets, approvals, jobs, usage and audit records were not deleted. Archive hides clutter; it does not claim to reclaim file storage or historical transfer.
- Closed storyboard comparison panels no longer mount their alternative images. Generated-image result previews load only when opened.
- Source/take video previews load only after deliberate opening; closing removes the media element.
- First-cut sound no longer preloads while its inspector is closed. Explicit Play loads required sources and starts once picture and sound are ready, preserving the same edit clock and approvals.
- The global media library no longer attaches all listed video sources merely by rendering the grid. Each explicit native Preview opens only that card's player; closing unmounts it. Selection, deletion and preset importing are unchanged.
- There is no change to access checks, private review cache restrictions, renderer limits, media lineage or budget authority. No public caching of private review media was introduced.

Root independent review and actual component tests confirm source absence/presence, not a fabricated percentage bandwidth reduction. Before the global-library final patch, the real-domain storyboard showed one visible selected image, zero images in its five closed generated previews, and no hidden comparison images.

## One active application and database

The purchased domain previously served `d5d6cbf` from September. `main` has now been fast-forwarded to the tested current implementation. Production Vercel is configured with:

- `NEXT_PUBLIC_CONVEX_URL=https://knowing-snail-785.convex.cloud` — same existing current data; no media/database copy.
- `NEXT_PUBLIC_SITE_URL=https://usefinalframe.xyz` — replaces invalid old `finalframe-vercel.app` setting.
- `NEXT_PUBLIC_FF_VIDEO_TYPE_ROUTING=true`.
- The existing backend-matching `FINALFRAME_REVIEW_MEDIA_SECRET`, protected as **Secret**. Import initially defaulted to readable Config; this was corrected and its unchanged-value confirmation completed before deploying. The value was not exposed to the browser bundle or printed in evidence. Temporary private import file removed.
- Backend `SITE_URL=https://usefinalframe.xyz`; JWT issuer/cloud endpoint unchanged.

**Prelaunch choice:** the active cloud deployment retains its Development label. Both the real domain and any retained Preview reference that same database. The empty production deployment was not deleted, copied into or represented as migrated. This avoids duplicating255MB or invalidating user/storage IDs while building. Moving its label/data to a different deployment would be a separate controlled migration; it is not needed to use the domain now. No new Convex project, S3 service or subscription was provisioned.

Initial successful Production source **`3167c0e`**, Vercel **`2WGxbBekQ45J5n2Li2UyojiQP13D`**. Actual owner login on `https://www.usefinalframe.xyz/dashboard` passed, with retained projects and the connected creator flow. Apex redirects towww. A signed media-resolver HEAD using a deliberate nonexistent43-character token returned404/private-no-store, rather than503/missing-signing-configuration, without downloading a file. The final library optimization source/deployment is recorded in the release checklist and artifact `FINAL-CHECKS.json`.

## Validation, costs and recovery

- Combined focused suite: **220 passing groups across20 test files** (215 prior focused groups +5 real asset-grid handler groups). Full TypeScript, scoped lint and production build pass; exact final revision/status is retained in artifact `FINAL-CHECKS.json`.
- Online archive/readback confirmed26 restorable projects; no file deletion and no paid provider call.
- Last reconciled cumulative provider spending remains **$15.426448638**, plus retained **$0.188902 uncertain hold**. No inference, new key, top-up, plan upgrade or payment occurred here. Existing caps unchanged.
- Rollback: restore the previous compatible Vercel revision/environment bindings, and use `projects.restore` on the recorded archive IDs. Preserve current data, paid receipts and holds. Do not restore the obsolete Supabase build as a way to recreate missing users. The original signing secret remains in its original private recovery location.

Evidence folder: `/home/ashuboris/.codex/artifacts/finalframe/consolidation-20261113/`. Private snapshots/credential material must never be committed or published. The historical1.28GB meter remains; these changes reduce future unnecessary transfer and do not claim to reset the monthly allowance. The full functional-acceptance checklist remains separate from this successful domain/efficiency checkpoint.
