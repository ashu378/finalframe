# Checkpoint 13 — recipes on approved plans and deliberate project-media reuse

Scope: FinalFrame functional completion. Redesign, email and payment remain deferred. Database-backed verification targets online development Convex knowing-snail-785. No Yafpay resource or production database is included.

## Verified blockers and changes

The recipe form was available only while planning was DRAFT. An existing approved project with no captured recipe could not start recipe execution without creating another production draft. New execution instructions can now attach to the exact current approved plan using its immutable productionVersions.snapshot. This creates a separate recipeProposals record; it does not rewrite the plan, shots, approvals or production version. New writes require the canonical current plan, and approved writes additionally require the current approved production version and approved source plan. Exact authorized historical proposal receipts remain readable; a stale plan cannot create a new proposal or execute against a newer version.

Draft reference-slot editing remains draft-only. An approved-plan form cannot add or remove prepared-reference slots. An attempted change asks for a revised canonical draft instead of mutating approved shots. Creating a proposal or preview never starts generation; existing estimate, consent, source-authority, review and lock gates remain required.

Footage recipes previously always compiled GENERATION nodes except for social cutdowns, even when the creator wanted to use existing project media. The Picture source control now allows an explicit Use approved project media selection for the seven footage-based types. It emits the existing SOURCE_RANGE contract with the exact selected asset/window/audio policy. The default remains Generate the planned shots. Missing media fails closed; no fallback purchases footage. Motion graphics remains deterministic graphics. Narrated explainers still require narration; music videos still require a soundtrack. This is not automatic reuse of global/studio defaults, nor a claim that one source clip completes an entire creative recipe.

No schema or migration change. The backend and frontend must be deployed together. Rollback restores the prior compatible functions/frontend and retains new proposals, previews, approved versions, outputs, receipts and holds.

## Verification

Frozen root packet v2: application-handler UI8, backend20, compiler20, binding and stored-actor suites passed. Independent review verified all five SHA-256 hashes, reran those suites, tested nine additional current/stale/status/role cases, and passed nonincremental application TypeScript. Pure handler seams are contract evidence; online and browser acceptance are recorded after deployment rather than inferred.

Checkpoint12 is Ready at revision00298224eb8446b8e8c72fd725b3ad066f0b2377. All eight template creation journeys and online owner/membership/default readbacks passed. The SaaS missing-title defect was repaired in a new immutable timeline2 and completed real API export:10seconds,300frames,1920x1080 at30fps, silent, SHA256877f0e72ef1da41b14d43b6df30cd3d5a275a2ed13e2f02a134514aa7b03f374. Independent sampled OCR/manual review confirmed all copy/logo/UI content. On the ordinary Preview Review page the current Assembly v2 shows Finished file verified and Download video; no second render or download was submitted for that browser observation.

## Remaining release gates and spending

Do not certify the whole launch from template creation, contract tests or short supporting clips. Complete creative prompt-to-download recipes, social/explainer creative failures, exact comedy dialogue, unverified operation routes, broader role/mobile/action coverage and live interruption proof remain separate checklist gates.

Provider aggregate was read through GET/key at09:37:27UTC on3November:5.965715632USD, unchanged; provider key limit15USD. Retain0.188902USD uncertain holds and the10USD application working ceiling. Conservative working authority remains3.845382368USD. No new paid submission is included in this packet. OpenRouter browser login is unnecessary.

## Browser integration correction

The first live localhost13 Takes visit loaded the current approved project but showed no Recipe to finished video panel. The route had a separate frontend environment predicate, while the authoritative online Convex recipe flag was already enabled. The workspace now renders the client shell on Storyboard/Takes and lets the existing authenticated recipeWorkspace.get.enabled value control rollout. Disabled Convex rollout still returns no controls; project access, worker enablement, estimates and explicit starts are unchanged. The executable component suite now includes this disabled state and passes9cases. No new provider call occurs on a page visit.
