# FinalFrame Production Canvas and Editing Implementation Plan

## 1. Purpose

This plan adds the complete visual production-control layer to FinalFrame without replacing the existing Convex production model, AI Director, generation jobs, timeline contracts, credit accounting, or renderer foundation.

FinalFrame will provide one production workspace that takes a user from an idea to a finished video while keeping the underlying work visible and controllable:

```text
Idea / script / voice / media
        ↓
AI Director
        ↓
Plan + Creative Guide + storyboard
        ↓
Production Graph
        ↓
Production Canvas + Media + Takes
        ↓
Prompt edits or practical timeline edits
        ↓
Review and approval
        ↓
Locked timeline + Assembly Manifest
        ↓
Remotion / FFmpeg renderer
        ↓
Export and download
```

The Production Canvas is a mandatory part of every production. It is not an optional advanced feature and it is not a separate product. The AI Director creates the graph automatically; the Canvas displays and controls that graph. Beginners receive a guided presentation of the same Canvas, while experienced users receive more direct controls.

## Implementation status

### Chunk 1 — Graph foundation and mandatory Production Workspace — implemented

- Added additive Convex records for production dependencies, production operations, and Canvas layouts.
- Added a studio-authorized `productionGraph` projection over the existing production hierarchy.
- Added shared graph contracts, friendly states, and workspace section definitions.
- Added the canonical workspace routes and a mandatory Canvas entry point with an accessible graph-map surface.
- Updated the project overview CTAs to enter the new video workspace.
- Added workspace loading and error states.
- Verified Convex code generation, TypeScript, ESLint for touched files, and the production build.

### Chunk 2 — Production Canvas and dependency control — implemented

- Added the production graph map, Canvas surface, desktop inspector, mobile dependency-list alternative, graph action list, and accessible workspace navigation.
- Added studio-authorized dependency impact preview and auditable production-operation commands.
- Added the mandatory Canvas route and preserved clear empty, loading, unavailable, and error states.
- Verified the Canvas source-contract suite and the protected workspace route smoke check.

### Chunk 3 — Prompt editing and practical Timeline Editor — foundation implemented

- Added `convex/timelineEditor.ts` with authorized draft loading, validated trim/split/reorder/replace/text/caption/audio/transition commands, immutable draft versions, undo/redo, locking, and idempotency.
- Added the plain-language prompt editing panel with target context, dependency impact preview, explicit confirmation, and a clear no-credits-used boundary before regeneration.
- Added the practical timeline editor with clip selection, trim, split, reorder, replace affordance, transitions, audio level controls, undo/redo events, save state, and locked/read-only presentation.
- Connected the workspace Edit route to the Convex operations and timeline mutations without writing arbitrary client state or starting provider work silently.
- Added focused editing contract tests and registered `test:edit`.
- Verified Convex code generation, TypeScript, ESLint, Canvas tests, editing tests, `git diff --check`, the production build, and the protected workspace route smoke check.

### Chunk 4 — Review, rendering, export, and production verification — implementation foundation complete

- Assembly now requires an approved/locked timeline and persists the exact timeline version, source IDs, checksums, caption/audio references, preset, and correlation data.
- Assembly blocks missing canonical media, failed or unreviewed takes, outdated dependencies, invalid rights/consent, unsupported presets, and unconfirmed older-take selection.
- Added Convex review/export operations for review requests, comments, approvals, revision requests, export requests, and authorized download resolution with idempotency boundaries.
- Hardened renderer manifest validation, source policy, callback signing/idempotency, ffprobe verification hooks, and explicit unavailable/failure states.
- Added responsive review, version, stale-dependency, render-readiness, renderer-status, and download UI, then wired it into the workspace Review and Download sections.
- Added the Chunk 4 release-gate test suite. Canvas, editing, renderer, and Chunk 4 tests pass; the production build and protected review/export route smoke checks pass.

External completion remains: deploy the renderer worker, configure its authenticated URL/secret, provide FFmpeg/ffprobe in that worker environment, and run a real provider-backed MP4 end-to-end test. Until that is configured, the product honestly shows an unavailable renderer state and never fabricates a download.

## 2. Locked product decisions

### 2.1 Canvas is first-class and always present

Every production includes this workspace navigation:

```text
Overview · Plan · Storyboard · Canvas · Media · Takes · Edit · Review · Export
```

The Canvas is always visible in the production navigation and always reachable from the project overview. A new user does not have to build nodes manually. FinalFrame creates the graph from the approved plan and keeps it synchronized with scenes, shots, assets, audio, versions, reviews, and exports.

“Guided first” means:

- the default landing view explains what is happening;
- the graph is auto-laid out;
- recommended next actions are prominent;
- technical provider details are hidden until requested;
- advanced controls are progressively disclosed.

It does not mean that Canvas is hidden, disabled, or reserved for advanced users.

### 2.2 Canvas and editor have different jobs

The Canvas answers: “How is this video being produced?”

It exposes relationships between the plan, creative guide, references, scenes, shots, takes, audio, and downstream outputs.

The Editor answers: “How should the finished video look and sound?”

It supports practical editing: trim, split, reorder, replace, prompt-based changes, text, captions, audio levels, transitions, motion-graphic settings, undo, and versions. It is not a full professional NLE in this phase.

### 2.3 User control and regeneration

Changing an upstream item marks affected downstream work as outdated. FinalFrame must not silently spend credits regenerating everything.

The user sees:

- what changed;
- which takes are affected;
- what can remain valid;
- the estimated cost of regeneration;
- an explicit confirmation before paid work begins.

The user may intentionally keep an older take after seeing the warning.

### 2.4 Responsive behavior

Desktop and tablet use a visual node Canvas. Mobile uses the same graph as a readable dependency list with inspect, approve, replace, edit, and regenerate actions. Mobile is not a cut-down page that removes production control.

### 2.5 Collaboration scope

This phase includes autosave, immutable versions, comments, review links, approvals, and recovery. Live multiplayer cursors and simultaneous editing are deferred.

### 2.6 Existing architecture remains authoritative

Convex remains the source of truth. The UI uses typed adapters and commands; it never writes arbitrary graph state directly. Existing production, shot, shot-version, asset, generation-job, timeline, review, credit, and render records remain reusable.

## 3. Repository-grounded starting point

The repository already contains most of the production primitives required for this work:

- Convex records for productions, plans, production Bibles, references, sequences, scenes, shots, shot versions, assets, provenance, generation jobs, audio, transcripts, captions, timelines, render jobs, manifests, reviews, exports, estimates, reservations, credits, payments, feature flags, and audit events.
- `convex/timeline.ts` for initial timeline creation from an assembly manifest.
- `src/lib/render/contracts.ts` for timeline tracks, clips, transitions, captions, audio mix, render presets, manifests, and exports.
- `convex/generationJobs.ts` for durable job state, leases, retries, provider tasks, idempotency, canonical assets, QC, and actual cost.
- Existing project routes for overview, blueprint/plan, production/takes, and editor.
- Existing creation modes for idea, script, voice, images, footage, and advertising.
- Existing OpenRouter capability and workflow registries.
- A renderer foundation under `renderer/`, with the deployed renderer URL and worker secret still required for real MP4 verification.

Current gaps this plan addresses:

- There is no first-class Canvas route or persisted graph layout.
- The current editor is primarily a preview/layer surface and does not apply real timeline edits.
- Dependency invalidation and downstream impact are not represented explicitly.
- The old remix path still reports an unsupported operation and must be replaced with auditable production operations.
- A timeline can be created from a manifest, but direct edit, undo/redo, locking, and version commands are incomplete.

## 4. Target architecture

```text
CreateIntent
    ↓
AI Director
    ↓
DirectorPlan + Script + Creative Guide + storyboard
    ↓
User approves plan and cost
    ↓
ProductionVersion
    ↓
Canonical Production Graph in Convex
    ├── Plan / script / creative guide
    ├── Characters / locations / products / references
    ├── Sequences / scenes / shots
    ├── Images / image edits / video takes
    ├── Voice / audio / transcripts / captions
    ├── Timeline versions / edit operations
    ├── Reviews / comments / approvals
    └── Assembly manifests / renders / exports
    ↓
Production Workspace
    ├── Overview
    ├── Plan
    ├── Storyboard
    ├── Canvas
    ├── Media
    ├── Takes
    ├── Edit
    ├── Review
    └── Export
    ↓
Locked TimelineVersion
    ↓
AssemblyManifest with exact source versions
    ↓
Remotion / FFmpeg
    ↓
Verified Export
```

Financial accounting runs alongside operations:

```text
Approved operation
    ↓
Estimate snapshot
    ↓
Credit reservation
    ↓
Generation or render
    ├── success → commit actual usage
    ├── failure → release unused reservation
    └── uncertain provider result → reconciliation required
```

No Canvas action may bypass the existing reservation, idempotency, provenance, authorization, or audit rules.

## 5. Shared contracts

Create shared types under the existing contract/type boundary rather than scattering string literals through the UI.

### 5.1 Graph types

```ts
type ProductionGraphNodeKind =
  | "plan"
  | "script"
  | "creativeGuide"
  | "character"
  | "location"
  | "product"
  | "reference"
  | "sequence"
  | "scene"
  | "shot"
  | "image"
  | "imageEdit"
  | "videoTake"
  | "voice"
  | "audio"
  | "transcript"
  | "captions"
  | "timeline"
  | "review"
  | "export";

type ProductionGraphEdgeKind =
  | "contains"
  | "references"
  | "derivedFrom"
  | "feeds"
  | "placedOn"
  | "reviewedBy"
  | "rendersTo";

type ProductionGraphNodeState =
  | "ready"
  | "working"
  | "needsApproval"
  | "outdated"
  | "failed"
  | "blocked"
  | "locked";
```

Every graph node must identify its canonical Convex record, production version, current artifact/version, state, user-facing label, and available actions. Provider IDs and raw prompts are inspector details, not primary node labels.

### 5.2 Operation contracts

```ts
type ProductionOperationKind =
  | "editPrompt"
  | "replaceReference"
  | "regenerateTake"
  | "replaceTake"
  | "trimClip"
  | "splitClip"
  | "moveClip"
  | "replaceAudio"
  | "editText"
  | "editCaptions"
  | "setTransition"
  | "setAudioMix";
```

Each operation records the actor, target version, input, output versions, request hash, impact analysis, estimate/reservation where required, status, undo relationship, correlation ID, and audit information.

### 5.3 Required backend commands

Add typed Convex query/mutation/action boundaries similar to:

- `productionGraph.get({ productionId, versionId? })`
- `productionGraph.getLayout({ productionId, versionId })`
- `productionGraph.saveLayout({ productionId, versionId, layout })`
- `productionGraph.previewImpact({ productionId, targetId, proposedChange })`
- `productionOperations.create({ productionId, operation })`
- `productionOperations.approve({ operationId, estimateApproval? })`
- `productionOperations.cancel({ operationId })`
- `productionOperations.acknowledgeOutdated({ nodeId, keepVersionId })`
- `timelineEditor.apply({ timelineId, operation, idempotencyKey })`
- `timelineEditor.undo({ timelineId, operationId })`
- `timelineEditor.redo({ timelineId, operationId })`
- `timelineEditor.createVersion({ productionId, sourceTimelineId })`
- `timelineEditor.lockVersion({ timelineId })`

All commands must enforce verified identity and studio membership inside Convex.

## 6. Additive data model changes

The schema owner should add only the records needed to make graph state and edit intent durable. Existing records remain authoritative for their domain.

### 6.1 `productionDependencies`

Stores explicit directed edges between canonical records:

- production and version ownership;
- source node and dependent node;
- edge kind;
- source version ID and dependent version ID;
- validity state;
- stale reason;
- created/updated timestamps;
- studio and production ownership.

### 6.2 `productionOperations`

Stores every prompt edit, replacement, regeneration request, and practical edit as an auditable command:

- operation type;
- target record/version;
- input payload and validated schema version;
- actor and correlation ID;
- estimate and reservation IDs where applicable;
- status and retryability;
- produced asset, shot, timeline, or version IDs;
- undo/redo relationship;
- user-safe error;
- created/completed timestamps.

### 6.3 `canvasLayouts`

Stores user layout preferences separately from production meaning:

- production/version ownership;
- desktop node positions;
- collapsed groups;
- selected node;
- viewport zoom and center;
- layout version;
- mobile ordering preferences.

Canvas layout must never become the source of truth for production ordering or dependencies.

### 6.4 Timeline edit history

Use existing timeline versions and tracks/clips. Add an append-only operation/history record only if the existing timeline schema cannot represent undo/redo and conflict-safe autosave. A locked timeline is immutable; later changes create a new timeline version.

## 7. Four implementation chunks

### Chunk 1 — Graph foundation and mandatory Production Workspace

Objective: create one stable workspace shell and expose the automatically generated graph everywhere.

Repository areas:

- `convex/schema.ts`
- new graph queries/mutations under `convex/`
- shared production contracts under `src/lib/`
- `src/app/(dashboard)/dashboard/projects/[id]/`
- dashboard navigation and feature-flag configuration

Work:

1. Create this implementation document and maintain its phase checklist.
2. Add `productionDependencies`, `productionOperations`, and `canvasLayouts` after schema review.
3. Build a graph projection from existing production, sequence, scene, shot, shot-version, asset, audio, timeline, review, and export records.
4. Create the canonical workspace route:

   - `/dashboard/projects/[id]/workspace`
   - `/dashboard/projects/[id]/workspace/overview`
   - `/dashboard/projects/[id]/workspace/plan`
   - `/dashboard/projects/[id]/workspace/storyboard`
   - `/dashboard/projects/[id]/workspace/canvas`
   - `/dashboard/projects/[id]/workspace/media`
   - `/dashboard/projects/[id]/workspace/takes`
   - `/dashboard/projects/[id]/workspace/edit`
   - `/dashboard/projects/[id]/workspace/review`
   - `/dashboard/projects/[id]/workspace/export`

5. Preserve existing URLs with redirects or compatibility shells:

   - `/blueprint` → workspace/plan;
   - `/production` → workspace/takes;
   - `/editor` → workspace/edit.

6. Make Canvas a visible navigation item for every production. The default landing screen may be Overview or Storyboard, but Canvas must be one click away and never hidden behind an “advanced” switch.
7. Add workspace loading, empty, failed, unavailable, missing-plan, and incomplete-production states.
8. Keep all async jobs visible so users can continue working while generation or rendering runs.

Acceptance:

- Every production with an approved or in-progress plan has a graph projection.
- Every production workspace visibly includes Canvas.
- Existing project URLs remain functional.
- Graph reads are studio-authorized and do not trust client ownership parameters.
- No fake nodes or fake successful outputs are created.

### Chunk 2 — Production Canvas and dependency control

Objective: make the graph visual, understandable, inspectable, and actionable.

Repository areas:

- `src/app/(dashboard)/dashboard/projects/[id]/workspace/canvas/`
- new `src/components/production-canvas/`
- shared graph contracts
- Convex graph and operation modules

Work:

1. Use a maintained node-canvas library such as `@xyflow/react`, with automatic layout using a graph-layout utility such as Dagre. Lazy-load the visual canvas because it is not part of the initial project-shell critical path.
2. Implement node types for plan/script, creative guide, references, sequences/scenes/shots, image/image edit, video take, voice/audio/transcript/captions, timeline, review, and export.
3. Use semantic cards with:

   - plain-language title;
   - thumbnail/poster or honest placeholder;
   - status and progress;
   - source/version label;
   - available next action;
   - accessible connection description.

4. Add a right-side inspector on desktop and a bottom sheet on mobile.
5. Add auto-layout, fit-to-production, zoom controls, minimap only where useful, keyboard navigation, and a list alternative.
6. Implement mobile as the same graph represented in dependency order. It must support inspect, approve, replace, edit, acknowledge outdated, and regenerate without requiring a desktop canvas.
7. Add impact preview:

   - upstream change;
   - directly affected nodes;
   - potentially affected nodes;
   - unaffected nodes;
   - estimated cost and approval requirement.

8. Add node actions:

   - inspect;
   - replace reference;
   - edit prompt;
   - open takes;
   - open editor;
   - regenerate affected output;
   - keep existing version;
   - compare versions.

9. Do not expose raw provider/model nodes as the main mental model. Provider information is available in an advanced details panel.
10. Keep layout persistence separate from production state.

Acceptance:

- The AI-created graph appears without manual node construction.
- A user can trace a character/reference/scene/shot/take relationship.
- A changed upstream node produces a truthful impact report.
- Regeneration never starts from a silent click and never duplicates an operation.
- Desktop and mobile retain equivalent production control.
- Keyboard users can inspect and activate every node action.

### Chunk 3 — Prompt editing and practical Timeline Editor

Objective: allow users to change individual creative decisions and make practical edits without introducing a full NLE.

Repository areas:

- `src/app/(dashboard)/dashboard/projects/[id]/workspace/edit/`
- `src/components/editor/*`
- `src/lib/render/contracts.ts`
- `convex/timeline.ts`
- new `convex/productionOperations.ts`
- existing generation and credit modules

Work:

1. Replace the unsupported legacy remix submission path with `productionOperations.create` and a real async operation flow. Retire technical copy such as “directive,” “manifest,” and “Director_Command” from the customer UI.
2. Support prompt edits against a selected node or take:

   - user describes the desired change in plain language;
   - FinalFrame shows the target and source references;
   - impact analysis identifies downstream outputs;
   - cost estimate appears before paid regeneration;
   - user confirms;
   - a new shot version/asset is generated with provenance;
   - affected nodes are marked outdated until refreshed.

3. Implement practical timeline edits:

   - trim clip;
   - split clip;
   - reorder clips;
   - replace a take;
   - change text and motion-graphic values;
   - edit captions;
   - replace or level audio;
   - set supported transitions;
   - undo and redo;
   - save draft timeline version;
   - lock an approved timeline version.

4. Apply edits through validated server commands, not client-only state.
5. Make autosave debounced and idempotent. Show save state and recovery if it fails.
6. Keep drafts mutable. Once locked for render, the timeline and source version IDs are immutable.
7. Every undo/redo creates a traceable relationship to the prior operation. Never mutate history invisibly.
8. Preserve the existing preview and export components where useful, but replace placeholder success states and unsupported actions.

Acceptance:

- A user can change a shot by prompt and receive a new version without losing the old one.
- A user can trim, split, reorder, replace, caption, mix audio, and set transitions in a draft timeline.
- The user sees what changed and can undo it.
- Regeneration and editing are financially gated and idempotent.
- The locked timeline is reproducible from exact source version IDs.

### Chunk 4 — Review, rendering, export, and production verification

Objective: connect Canvas and editing to trustworthy review and real final output.

Repository areas:

- render manifest and export modules;
- `renderer/`;
- review and share components;
- admin operations and audit modules;
- browser and integration tests;
- deployment configuration.

Work:

1. Build the Assembly Manifest only from a locked timeline version.
2. Include exact source asset/version IDs, checksums, caption track versions, audio versions, transition values, render preset, and graph/operation correlation IDs.
3. Block or explain:

   - missing media;
   - failed or unreviewed takes where approval is required;
   - rights/consent problems;
   - outdated dependencies;
   - unsupported codecs or render parameters.

4. Permit an explicit “use older version” confirmation when the user intentionally keeps an outdated take.
5. Connect review comments to a target graph node, take, or timeline range.
6. Support review approval, revision requests, comparison, version history, and download states.
7. Ensure renderer callbacks are authenticated and idempotent.
8. Verify real MP4 output with ffprobe once the renderer worker is deployed. Until then, show an honest unavailable state and keep deterministic fixture tests separate from production output.
9. Add operational views for failed operations, stale dependencies, renderer failures, and reconciliation-required jobs.

Acceptance:

- A completed export is always tied to a locked timeline and real media.
- The final MP4 has correct order, duration, dimensions, codec, audio, captions, and poster metadata.
- Review and regeneration preserve prior versions and correct credit behavior.
- Renderer failure is recoverable and visible to the user/operator.
- No successful export contains sample, placeholder, or remote-only media.

## 8. Multi-agent implementation waves

Agents work in parallel only across disjoint ownership boundaries. The principal agent owns integration and final verification.

### Wave 1 — Contracts and graph foundation

- Agent A: Convex schema, dependency records, operation records, indexes, authorization.
- Agent B: shared graph contracts, adapters, status mapping, feature-flag rollout controls.
- Agent C: workspace route shell and compatibility redirects.
- Agent J: contract tests and authorization tests.

### Wave 2 — Canvas

- Agent D: graph projection, impact analysis, operation commands.
- Agent E: desktop Canvas, node types, inspector, auto-layout.
- Agent F: mobile dependency-list experience, accessibility, keyboard behavior.
- Agent J: graph correctness, responsive, performance, and accessibility verification.

### Wave 3 — Editing

- Agent G: prompt-edit operations and generation/version integration.
- Agent H: practical timeline editor and timeline-operation history.
- Agent I: editor UX, save/recovery states, version comparison, terminology cleanup.
- Agent J: edit idempotency, undo/redo, stale-warning, and credit-gate tests.

### Wave 4 — Render and release integration

- Agent K: manifest locking, review/export integration, renderer callbacks.
- Agent L: renderer worker integration and ffprobe verification.
- Agent M: admin/observability/read models for Canvas and edit operations.
- Agent J: full browser E2E, security, accessibility, and release checklist.

The principal agent integrates each wave before the next wave changes dependent contracts.

## 9. Testing requirements

### Graph and authorization

- Unauthenticated graph queries fail.
- User A cannot inspect User B’s graph.
- All graph nodes map to real canonical records.
- No orphan dependency edge can produce a successful export.
- Layout changes cannot mutate production meaning.

### Canvas behavior

- Graph auto-generates after plan approval.
- Auto-layout is deterministic for the same graph version.
- Large graphs remain navigable and do not block the initial page shell.
- Node selection, inspector, keyboard navigation, zoom, fit, list view, and mobile controls work.
- Stale impact analysis identifies direct and downstream dependencies correctly.

### Prompt operations

- Same idempotency key cannot create duplicate generation or charge.
- Invalid prompt-edit targets fail clearly.
- New output creates a new version and preserves the previous version.
- Cost approval is required before paid work.
- Failed work releases or reconciles the correct reservation.
- Provider timeout becomes recoverable rather than falsely successful.

### Timeline editor

- Trim, split, reorder, replace, text, captions, audio, transitions, undo, redo, autosave, draft versioning, and lock behavior are tested.
- Concurrent stale drafts are detected and recoverable.
- Locked timelines reject mutation and require a new version.
- Exact source versions remain in the render manifest.

### Review and render

- Comments point to the correct node, take, or timeline range.
- A review revision request returns to the right workspace action.
- Missing, outdated, failed, unapproved, or rights-blocked sources show the correct recovery state.
- Renderer callbacks reject invalid signatures and duplicate completion.
- Real output passes ffprobe and download verification when the worker is connected.

### UX quality

- Verify 1440×900 and 390×844.
- Test 375px, 768px, 1024px, and 1440px layouts.
- Test keyboard-only Canvas and editor use.
- Check visible focus, semantic headings, screen-reader labels, contrast, target sizes, and reduced motion.
- Check long titles, missing thumbnails, many nodes, failed jobs, empty productions, narrow widths, and horizontal overflow.
- Lazy-load the visual Canvas and secondary media; reserve media dimensions to avoid layout shift.
- Check console errors and initial network requests.

## 10. Rollout and rollback

The Canvas is mandatory in the final product contract. A feature flag may control rollout while development is underway, but it is a safety switch, not an architectural option. The finished flag configuration must enable Canvas for every eligible production.

Rollout order:

1. Local Convex development with deterministic graph fixtures.
2. Authenticated preview deployment.
3. Internal production projects.
4. Renderer-connected staging.
5. Invite-only creator testing.
6. Paid workflow enablement only after quality and accounting gates pass.

Rollback:

- Disable new edit/generation operations if a provider or renderer is unsafe.
- Keep read-only Canvas available so users can inspect and recover projects.
- Preserve all graph, asset, version, credit, review, and render records.
- Do not delete or roll back financial ledger mutations.
- Reconcile orphaned operations before re-enabling paid work.

## 11. External inputs still required

Implementation can proceed with fixtures and mocked provider boundaries. Real production verification still requires:

- deployed renderer worker URL and shared secret;
- FFmpeg/ffprobe availability in the renderer environment;
- OpenRouter credentials and approved spend limit for real generation;
- Convex deployment configuration for the target environment;
- final legal, consent, and media-rights policy;
- approved brand assets and showcase media if current assets are replaced.

No new external backend is required for Canvas. No React Flow/Dagre dependency should be added until the implementation agent confirms the existing package and bundle impact; the visual Canvas may be lazy-loaded.

## 12. Definition of done

This phase is complete when:

- Every production automatically has a durable Production Graph.
- Every production workspace exposes a mandatory Canvas.
- Beginners get a guided view without losing access to the full graph.
- Desktop has a visual node Canvas and mobile has equivalent list-based graph control.
- Users can inspect relationships, edit by prompt, compare versions, and regenerate with explicit cost approval.
- Users can practically edit the timeline and undo changes.
- Outdated downstream work is visible, explainable, and confirmable.
- Locked timelines render from exact source versions.
- Review, assembly, rendering, export, and download use real records and real media.
- Existing routes remain compatible.
- Authorization, idempotency, credit safety, provenance, accessibility, responsive behavior, and failure recovery pass their tests.
- No primary customer flow uses technical terms such as directive, manifest, registry, signal, or provider name.
- The workspace is ready for the next workflow-quality and production-launch gates.

## 13. Product-design source note

The interaction approach uses the product reasoning from Sanvithi Saya’s expert workbench cases and Amy La’s creative-iteration case studies: keep the primary work surface central, expose asynchronous status, explain AI inputs and consequences, preserve user authorship, and make experimentation reversible. Sources: [Explora](https://sanvithi.com/explora) and [Untitled x Lyrics](https://amylalai.com/untitledlyrics-fromhome).
