# MASTER PRODUCT REQUIREMENTS DOCUMENT (PRD)

## Product Name: FinalFrame

### Tagline (Internal)
A studio-grade creative operating system for Hollywood-standard content.

---

## 1. PRODUCT DEFINITION

### What FinalFrame Is

FinalFrame is a professional creative production system, not a prompt-based generator.

It enables users to produce:

- Hollywood-standard videos
- A+ commercials & video ads
- A+ motion graphics
- A+ SaaS hype videos (especially for X / Reels / TikTok)
- Brand-consistent creator videos (including self-video)

FinalFrame replaces an entire studio pipeline by enforcing process, constraints, and validation at every step.

---

### What FinalFrame Is NOT

- Not a “type a prompt and generate” tool
- Not a free-form AI playground
- Not a single-model system
- Not allowed to invent or guess missing inputs

---

## 2. NON-NEGOTIABLE CORE PRINCIPLES

These rules override all other considerations.

### 2.1 Zero Hallucination Policy

- No UI, asset, logo, actor, feature, or content may be invented
- Every output must trace directly to:
  - User-provided input, or
  - Explicitly approved internal libraries
- If required information is missing, the system must stop and ask

---

## 3. CAPABILITY-BASED AI & MEDIA ARCHITECTURE (CRITICAL)

FinalFrame uses a **capability-based execution architecture**, not a vendor-bound one.

The system strictly separates:
- **What needs to be done** (capability)
- **Who performs it** (provider)

Capabilities are stable and permanent.  
Providers are configurable and swappable.

This guarantees:
- Zero vendor lock-in
- Clear role isolation
- Auditable execution
- Future-proof upgrades (e.g. Kling → Veo 3)

---

### 3.1 Core Execution Capabilities

#### AI Brain (Reasoning & Planning)
Responsible for:
- Script writing
- Scene planning
- Motion logic
- Execution plans
- Remix intent parsing
- Text edits

Used in:
- Phase 2 (Blueprint)
- Phase 3 (Execution planning)
- Phase 4 (Remix parsing)

---

#### Image Engine (High-Fidelity Visual Design)
Responsible for:
- Flyers
- Banners
- Thumbnails
- Background images
- Static social visuals
- Motion-graphics still frames

Used in:
- Phase 3 (Image-only renders)
- Phase 4 (Visual remixes)

---

#### Video Engine (Video + Audio Rendering)
Responsible for:
- Commercial videos
- UGC videos
- Motion graphics videos
- Explainer videos
- SaaS hype videos
- Short-form and long-form social videos
- Embedded audio (speech, music, ambience)

Used in:
- Phase 3 (Primary video rendering)
- Phase 4 (Layer-based re-rendering)

---

#### Validator Engine (Safety & Quality Gates)
Responsible for:
- Content validation
- Safety checks
- Moderation
- Export gating

Used in:
- Phase 3 (Post-render validation)
- Phase 4 (Post-remix validation)
- Phase 5 (Export approval)

---

### 3.2 Content Types → Capabilities Mapping

| Content Type           | Capability Used       |
|------------------------|----------------------|
| Flyers / Banners       | Image Engine         |
| Background images      | Image Engine         |
| Commercial videos      | Video Engine         |
| UGC videos             | Video Engine         |
| Motion graphics videos | Video Engine         |
| Explainer videos       | Video Engine         |
| SaaS hype videos       | Video Engine         |
| Avatar / Presenter    | Video Engine (Avatar)|
| Scripts / Planning     | AI Brain             |
| Safety / Validation    | Validator Engine     |

---

### 3.3 Current Providers (Configurable, Not Binding)

The following providers are **current runtime implementations** of the above capabilities.

These are configuration choices, not architectural constraints.

- AI Brain: anthropic/claude-sonnet-4.5 (OpenRouter)
- Image Engine: google/gemini-3-pro-image-preview (OpenRouter)
- Video Engine: RunwayML (Native Audio)
- Validator Engine: google/gemini-3-pro-preview (OpenRouter)

Providers may be replaced in the future (e.g., Kling → Veo 3) by updating configuration and adapter implementations only.

---

### 3.4 Non-Negotiable Architecture Rules

- No vendor APIs may be called directly from feature logic
- All execution must go through abstract capability interfaces
- Providers must be swappable without:
  - Database migrations
  - UI changes
  - Phase logic changes
- Phase responsibilities remain immutable

---



### MODEL SELECTION & EXECUTION PROFILES (MANDATORY)

FinalFrame MUST NOT rely on implicit or default model selection.

For all video generation, the system MUST use an internal,
deterministic “Execution Profile” to select the appropriate model.

Execution Profiles are:
- Internal-only (never user-facing)
- Derived from project intent, content type, and quality tier
- Evaluated before any video generation begins

Examples of Execution Profiles:
- CINEMATIC_REALISM
- COMMERCIAL_STORY
- FAST_SOCIAL
- MOTION_GRAPHICS
- UI_DEMO
- AVATAR_VIDEO

Rules:
- Users NEVER choose models
- UI must NEVER expose model names
- Pipelines must NEVER hardcode model IDs
- All model selection MUST occur inside provider adapters

Video models such as Gen-4, Act-Two, and Veo 3.x are treated as
MODEL VARIANTS under a single Video Engine provider.

Provider Example:
- Provider: Runway
- Models: Gen-4, Act-Two, Veo 3.x

Switching models MUST NOT require:
- Database changes
- UI changes
- Phase logic changes




## 4. TARGET USERS

- SaaS founders
- Startup marketers
- Agencies
- Indie creators
- Solo founders launching on X

---

## 5. REQUIRED USER INFORMATION (STRICT)

The system must collect and validate the following before allowing any project creation or rendering.

### 5.1 Outcome Goal (REQUIRED — ONE ONLY)

User must select exactly one:
- Get attention
- Explain value
- Convert sales
- Go viral on X
- Build authority

This choice drives pacing, scene count, hook strength, and CTA logic.

---

### 5.2 Platform & Context (REQUIRED)

Platform:
- X (Twitter)
- TikTok / Reels
- YouTube
- Website / Landing Page

Context:
- Organic post
- Paid ad
- Product launch
- Profile header
- Pitch loop

---

### 5.3 Creative DNA (REQUIRED & PERSISTENT)

Onboarding values act as defaults and may be overridden per project.

Required fields:
- Brand energy
- Editing pace
- Visual style
- Text personality
- Music energy

---

### 5.4 Identity Presence (REQUIRED)

User must select one:
- Self (user video)
- AI Actor
- No people

Rules:
- Self requires selfie assets
- AI Actor is locked per project
- Identity cannot change mid-project

---

### 5.5 Assets (STRICT)

Required:
- Logo
- At least one product visual

Optional:
- Brand colors (auto-detected if missing)

System may not infer or invent assets.

---

### 5.6 Message Blocks (REQUIRED)

User must provide:
- One-line value proposition
- Emotional promise
- Proof point (optional)

Free-form prompting is not allowed.

---

## 6. PROJECT-LEVEL BRAND INDEPENDENCE (CRITICAL)

Each project represents an independent brand, client, or campaign.

Rules:
- Branding, assets, and identity are project-level
- Users may manage multiple brands
- Onboarding provides defaults only
- Project configuration always overrides defaults

---

## 7. APPLICATION STRUCTURE (FULL SITEMAP)

[UNCHANGED — dashboard, studio, admin, support]

---

## 8. ONBOARDING FLOW (MANDATORY)

[UNCHANGED — 9-step enforced onboarding]

---

## 9. USER FLOW (END-TO-END)

[UNCHANGED]

---

## 10. PROJECT STATES (STRICT STATE MACHINE)

draft → blueprint_ready → approved → rendering → rendered → exported → archived

---

## 11. AI PIPELINE (ZERO-HALLUCINATION)

Each capability:
- Receives structured inputs only
- Is forbidden from acting outside its role

Renderer:
- Executes instructions only
- Cannot invent content

---

## 12. QUALITY GATES (EXPORT BLOCKERS)

[UNCHANGED]

---

## 13. ERROR & EDGE CASE HANDLING

[UNCHANGED]

---

## 14. BILLING & CREDITS

[UNCHANGED]

---

## 15. ANALYTICS & LOGGING

[UNCHANGED]

---

## 16. AI IDE ENFORCEMENT RULE

When building with Antigravity / Gemini / Claude:

“Implement only what is defined in this MASTER PRD.
Do not invent features, screens, or logic.
If required information is missing or unclear, stop and ask.”

---

## 17. DEFINITION OF SUCCESS

FinalFrame succeeds when:
- Users create agency-grade content without prompts
- Output is consistent and auditable
- No hallucinated assets exist
- SaaS founders can confidently launch on X
- Quality feels intentional, not random
