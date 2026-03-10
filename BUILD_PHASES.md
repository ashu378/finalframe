# FinalFrame — Build Phases

## GLOBAL MODEL & PROVIDER ABSTRACTION RULE (NON-NEGOTIABLE)

FinalFrame must remain vendor-agnostic at all times.

No phase, UI, service, or business logic is allowed to call vendor APIs directly.

All AI and media execution MUST go through abstract capability adapters.

This applies to:
- Video engines (Kling, Veo, future engines)
- Image engines (Gemini Image, future models)
- LLMs (Claude, Gemini, others)
- Validation / moderation engines

Switching providers MUST NOT require:
- Database migrations
- UI changes
- Phase logic changes
- State machine changes

Providers are configuration, not architecture.

---

## PURPOSE OF THIS DOCUMENT

This document defines the **build order and enforcement boundaries** for FinalFrame.

It does NOT redefine product features.  
All feature requirements come from **MASTER_PRD.md**.

If there is any conflict, **MASTER_PRD.md always wins**.

---

## Phase 0 — Foundation

Purpose: Establish a secure, gated, non-bypassable application shell.

Includes:
- App shell
- Routing (Public / Dashboard / Admin)
- Authentication
- Global layouts
- Project state machine
- Error handling
- Global guards & feature locks:
  - No dashboard access before onboarding
  - No project creation before onboarding
  - No editor, render, or export access without proper state

Exit Rule:
Phase 1 MUST NOT begin until:
- Routing works correctly
- Authentication is enforced
- Global guards correctly block all restricted routes

---

## Phase 1 — Onboarding & Studio Setup
(Reference: MASTER_PRD.md → Onboarding)

Purpose: Collect all required defaults and constraints before any project work.

Includes:
- Welcome & expectation setting
- Studio creation (name + role)
- Outcome goal selection (exactly one)
- Platform & context selection
- Creative DNA setup (persistent defaults)
- Identity selection (Self / AI Actor / No People)
- Asset intake:
  - Logo
  - Product visuals
- Message blocks:
  - Value proposition
  - Emotional promise
  - Proof point (optional)
- Final confirmation

Exit Rules:
- Onboarding completion state MUST be persisted
- Dashboard, project creation, editor, render, and export routes MUST remain blocked unless onboarding = completed

---

## Phase 2 — Project Creation & AI Director Blueprint
(Reference: MASTER_PRD.md → Creative Studio)

Purpose: Planning and intent definition only. No media generation.

Includes:
- New project creation flow
- Inheritance of Studio defaults:
  - Creative DNA
  - Identity preference
  - Platform preference
- Explicit project-level overrides:
  - Branding
  - Assets
  - Colors
  - Identity (allowed only before lock)
- AI Director blueprint screen
- Scene-by-scene storyboard
- Editable structured text blocks
- Actor lock enforcement
- Scene reordering
- Blueprint approval

Clarifications:
- Blueprint is planning-only
- No image, video, or audio generation is allowed in this phase

Exit Rule:
Rendering MUST be impossible unless:
- Blueprint is explicitly approved
- Project state transitions to `approved`

---

## Phase 3 — Render Pipeline (“Magic Oven”)
(Reference: MASTER_PRD.md → AI Pipeline)

Purpose: Deterministic execution of an approved blueprint.

Includes:
- Execution planning via AI Brain (reasoning only)
- Media execution via capability engines:
  - Image Engine
  - Video Engine
- Render queue
- Progress UI
- Credit deduction
- Failure handling
- Retry and refund logic
- Validation via Validator Engine

Critical Rules:
- No single model may perform multiple roles
- Renderer engines MUST NOT make creative decisions
- All execution must follow the approved blueprint exactly

Exit Rule:
Rendered output MUST:
- Pass validation and moderation
- Preserve actor identity and Creative DNA
- Transition project state to `rendered`

---

Additional Enforcement:

- Phase 3 MUST determine an Execution Profile before rendering.
- Model selection is delegated exclusively to the Video Engine adapter.
- The render pipeline may not reference provider model names directly.



## Phase 4 — Editor & AI Remix
(Reference: MASTER_PRD.md → Editor)

Purpose: Controlled, partial modification of rendered output.

Includes:
- Video / image preview
- Chat-based micro edits
- Strict intent parsing
- Timeline scene reordering
- Layer-based diff re-rendering (not full re-render)

Critical Rules:
- Actor identity may never change
- Creative DNA must remain consistent
- Renderer may only re-execute affected layers
- Full re-render is forbidden unless explicitly requested by the user

Exit Rules:
- Remix must not violate consistency rules
- Invalid or ambiguous edits must be rejected or clarified

---

## Phase 5 — Export & Quality Gates
(Reference: MASTER_PRD.md → Quality Gates)

Purpose: Controlled delivery of validated content.

Includes:
- Export modal
- Platform-ready aspect ratios
- Metadata handling
- Download and share options
- Credit enforcement
- Export blocking if quality gates fail

Exit Rule:
Only outputs that pass ALL quality gates may be exported.

---

## Phase 6 — Asset Management & Consistency
(Reference: MASTER_PRD.md → Asset Management)

Purpose: Reuse, consistency, and scale.

Includes:
- Media library
- Brand kit
- Creative DNA editor
- Actor / persona library

Rules:
- Assets are reusable
- Deleting assets must not break existing renders or snapshots

---

## Phase 7 — Billing & Credits
(Reference: MASTER_PRD.md → Billing)

Purpose: Monetization and usage control.

Includes:
- Credit system
- Plan limits
- Upgrade flows
- Admin credit adjustments

Rules:
- Credits are consumed deterministically
- Refunds must be auditable

---

## Phase 8 — Admin Panel
(Reference: MASTER_PRD.md → Admin)

Purpose: Platform control and safety.

Includes:
- User management
- Content moderation
- System health monitoring
- Support inbox

---

## Phase 9 — Polish & Launch Readiness

Purpose: Production hardening.

Includes:
- UX polish
- Performance optimization
- Logging & monitoring
- Edge-case handling
- Production configuration checks
