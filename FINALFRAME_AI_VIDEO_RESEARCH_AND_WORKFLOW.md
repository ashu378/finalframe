# Final Frame: AI Video Research and Production Workflow

## Executive conclusion

Final Frame should own an opinionated **story-to-publish pipeline** for short-form AI video. The product advantage is not another image or video model. It is a continuity-aware production system that turns an idea, script, or voice recording into a finished, captioned, platform-ready video while preserving characters, locations, voices, style, pacing, and reusable show assets.

The first flagship workflow should be **Nigerian voice-led animated comedy**: import or record a voiceover, identify speakers, create or reuse a cast, generate a visual bible, break the performance into shots, create 2D/cartoon or realistic visuals, assemble to the audio, caption, review, and export to 9:16 feeds. The same engine can later power realistic AI skits, ads, UGC, faceless explainers, and short films.

## What the research shows

### AI Video Bootcamp (AVB)

Public AVB materials describe a paid community and sequential curriculum rather than a single tool. Its public positioning emphasizes:

- beginner-friendly foundations and prompt structure;
- AI image creation and visual engineering;
- AI video generation;
- sound effects and editing;
- character consistency;
- AI ads, social content, filmmaking, cloning, and automation;
- feedback, community, weekly updates, and monetization opportunities.

The important product lesson is sequencing. Character consistency depends on a visual reference system; video depends on a prepared image and shot plan; editing depends on audio and timing; monetization depends on repeatable output. Final Frame should make those dependencies explicit and automate the handoffs.

### Nigerian animated comedy

House of Ajebo/Tegwolo is a strong public reference for the format: an identifiable character universe, everyday Nigerian situations, local speech and cultural specificity, short comic conflicts, memorable recurring personalities, and distribution across YouTube, Facebook, TikTok, and Instagram. Reporting on the studio describes primarily 2D animation and a workflow in which animation is produced in pieces, sound is created/recorded, and the pieces are combined in editing.

The lesson is that “real” does not mean photorealistic. It means believable continuity, clear acting, consistent voices, good comedic timing, culturally specific details, and a stable visual language.

The requested Vincent Ette reference could not be verified reliably from public search results, so it should be treated as a format reference supplied by the user, not as a confirmed production claim. The reusable pattern is still clear: one imported voice performance can be segmented into multiple speakers, each mapped to a distinct character, then animated against a timed shot list.

## Final Frame's canonical workflow

### 1. Choose the input

Create should accept one of six inputs:

1. Idea: “Make a funny 30-second skit about a landlord.”
2. Script: pasted dialogue or screenplay.
3. Voice: uploaded TikTok/voiceover/audio recording.
4. Cast and references: character images, style images, logos, products, locations.
5. Existing footage: trim, transform, caption, add AI scenes or B-roll.
6. Ad brief: product, audience, offer, CTA, brand rules.

The user selects a workflow preset such as **Nigerian Cartoon Comedy**, **Realistic AI Skit**, **Voiceover Story**, **AI Ad**, **Faceless Explainer**, or **Short Film**. Presets change defaults, not the underlying production model.

### 2. AI Director creates a plan

The Director normalizes the input and produces a typed, editable plan:

- hook and payoff;
- script or transcript with speaker labels;
- target duration, language, aspect ratio, and platform;
- scene and shot breakdown with duration and intent;
- cast, location, prop, product, and style entities;
- required assets and what can be reused;
- audio, caption, music, and SFX plan;
- model/provider options and cost estimate;
- quality risks and questions requiring approval.

The Director must not silently spend credits or create irreversible production data. The user approves the plan and estimate before generation.

### 3. Build the Production Bible

The Bible is the continuity contract for the project or series. It stores versioned records for:

- each character: name, age range, face, body, clothing, colors, personality, expressions, gestures, speech style, voice, and reference images;
- each location: geography, architecture, lighting, props, time of day, and recurring details;
- each prop/product: shape, logo, color, orientation, and allowed variants;
- visual style: 2D line quality, shading, palette, camera language, realism level, and negative constraints;
- audio style: narrator, speaker voices, ambience, music, SFX, loudness, and caption rules;
- cultural language: English, Nigerian Pidgin, Yoruba, Igbo, Hausa, code-switching, pronunciation notes, and translations.

Every shot receives a compact snapshot of the relevant Bible entities. This is the mechanism that makes regeneration safer and character continuity measurable.

### 4. Prepare voice and performance

For uploaded audio, Final Frame should:

- transcribe with word/phrase timestamps;
- detect pauses, emphasis, laughter, breaths, and turn-taking;
- split dialogue by speaker when possible;
- let the user correct speaker labels;
- map each speaker to a persistent character;
- calculate shot durations from the performance;
- generate captions and a readable dialogue script.

For generated audio, the user explicitly chooses AI voice. Voice cloning, dubbing, and lip-sync must be opt-in and clearly labeled. Imported third-party voiceovers should carry a rights/permission confirmation before publishing.

### 5. Generate an anchor pack

Before video generation, create a small approved visual pack:

- character turnaround or expression sheet;
- front/three-quarter/side references;
- clothing and prop references;
- location establishing frames;
- style frame and color palette;
- optional mouth/pose references for dialogue animation.

The user approves these anchors once. Subsequent shots reference the anchors and the Bible automatically. If a shot fails continuity, Final Frame should flag it and regenerate the shot rather than forcing the whole project to restart.

### 6. Generate shot versions

The canonical unit is a **shot**, not a whole video. Each shot contains:

- visual prompt and negative prompt;
- Bible snapshot and reference assets;
- camera, action, expression, and timing;
- audio segment and speaker mapping;
- selected model/provider and quality tier;
- cost, status, error, and versions.

For 2D comedy, default to limited animation: pose changes, facial expressions, mouth shapes, camera moves, pans, cuts, and reaction shots. This is more controllable and better aligned with voice timing than asking a generative video model to invent a complete animated performance in one pass.

For realistic AI video, use image-to-video from approved keyframes, short shots, repeated references, and controlled camera motion. Never rely on one long generation for a multi-character scene.

### 7. Assemble and finish automatically

The assembly service creates a deterministic manifest with:

- ordered video clips;
- voice/dialogue track;
- music and ambience;
- SFX cues;
- captions and burned-in subtitle styling;
- title/end card and CTA where applicable;
- safe-area and loudness checks;
- platform-specific crop and duration rules.

The beginner interface should show a shot strip and review player, not a full professional NLE. Users can reorder, replace, regenerate, trim, edit captions, change audio, and approve.

### 8. Quality gates

Block or warn before export when:

- a character identity differs materially from the Bible;
- a required shot is missing or out of order;
- dialogue is not covered by a visual or intentional reaction shot;
- captions exceed safe areas or contain low-confidence transcription;
- audio is clipped, too quiet, or misaligned;
- a logo/product is distorted;
- a source voice or asset lacks permission confirmation;
- the chosen platform preset is invalid.

Continuity should be reported as evidence and confidence, not promised as perfect identity preservation.

### 9. Export once, package everywhere

Generate a master and platform derivatives from the same approved assembly:

- TikTok/Reels/Shorts: 9:16, captions, safe areas;
- Facebook feed: 4:5 or 1:1 derivative when useful;
- YouTube: 9:16 short and optional 16:9 compilation;
- WhatsApp-ready compressed copy;
- caption text, thumbnail frame, title, description, and hashtags.

The project should preserve all shot versions so one approved production can be remixed into a shorter hook, alternate language, new CTA, or different platform crop without rebuilding the entire story.

## Workflow presets to ship

| Preset | Primary input | Continuity emphasis | First release scope |
|---|---|---|---|
| Nigerian Cartoon Comedy | Voice or script | Cast, accents, poses, recurring locations | Yes |
| Realistic AI Skit | Idea/script | Face, clothing, lighting, location | Yes |
| Voiceover Story | Voice | Timing, captions, visual coverage | Yes |
| AI Product Ad | Brief/assets | Product/logo, brand style, CTA | Yes |
| Faceless Explainer | Script/voice | Visual motif, stock/AI B-roll | Later |
| Short Film | Script | Bible, shot versions, long-form continuation | Later |

## Recommended product architecture mapping

Final Frame already has the right direction in its implementation plan: evolve the current blueprint/editor into `Production -> Version -> Bible -> Sequence -> Scene -> Shot -> Shot Version -> Assembly -> Export`. Prioritize the following in order:

1. Production Bible, persistent characters, locations, props, styles, and asset roles.
2. Voice upload/transcription/timing/speaker mapping/captions.
3. Shot-level generation jobs with retries, idempotency, leases, and credit reservations.
4. Anchor-pack approval and continuity validation.
5. Automatic assembly and 9:16 social export.
6. Comedy and ad templates with reusable cast/style libraries.
7. Long-form continuation, multilingual dubbing, lip-sync, and advanced provider routing.

This matches the current repository audit: the project already contains useful blueprint, scene, asset, continuity, render, assembly, review, remix, and export primitives, but voice/timing, durable shot production, first-class Bible entities, and finished assembly need to become first-class product flows.

## What “best in the industry” should mean

Final Frame should compete on five measurable promises:

- **Time to first review:** idea or voice to a reviewable short in one guided flow.
- **Continuity pass rate:** percentage of shots passing character/location/style checks on first generation.
- **Audio alignment:** dialogue, captions, reactions, and cuts aligned to the actual performance.
- **Recovery:** a failed shot can be regenerated independently without losing completed work.
- **Reuse:** a cast, style, location, and voice can power an entire series, not one disposable video.

The strategic moat is the production memory: every approved character, shot correction, caption edit, and export preference makes the next video faster and more consistent.

## Sources

- [AI Video Bootcamp on Skool](https://www.skool.com/aivideobootcamp/about?sgi=f579a335499a4f3ba039f7352bd02886)
- [AI Video Bootcamp public site](https://aivideobootcamp.com/)
- [AVB curriculum overview](https://aivideobootcamp.com/blog/best-generative-ai-course-ai-video-bootcamp-2026/)
- [AVB overview and 9-phase curriculum](https://aivideobootcamp.com/blog/what-is-ai-video-bootcamp/)
- [Techpoint: Ajebo’s animated comedy niche](https://techpoint.africa/feature/comedian-ajebo-animation-skits/)
- [House of Ajebo / Tegwolo reference](https://www.youtube.com/watch?v=Wz4VhmLYFb0)
- [Tribune: lessons from building Tegwolo](https://tribuneonlineng.com/five-lessons-i-learned-building-a-comedy-brand-from-a-character-named-tegwolo/amp/)
- [TEDx Anthony: Ajebo and House of Ajebo](https://tedxanthony.com/portfolio/ajebo/)
- [Research on character-stable AI video pipelines](https://arxiv.org/abs/2512.16954)

## Full Final Frame capability audit

The repository and product documents describe Final Frame as a structured creative production system, not a single-purpose cartoon generator. The current content model includes:

- commercial and social ads;
- UGC and testimonial videos;
- explainer videos;
- motion graphics and launch/hype videos;
- SaaS/product demos;
- avatar or presenter videos;
- Nigerian 2D comedy/cartoon content;
- voice-led story videos;
- existing-footage transformation;
- cinematic/short-film workflows represented in the data model but intentionally deferred;
- static companion outputs such as flyers, banners, thumbnails, backgrounds, and other image assets.

The current implementation has project/onboarding requirements, content type and workflow fields, AI blueprint generation, editable scenes, camera and motion configuration, asset upload/library, image and video generation strategies, render jobs, snapshots/layers, remix operations, review links/comments, templates, export jobs, a workflow stepper, and a Remotion assembly worker foundation.

The implementation plan correctly identifies the major missing production primitives: persistent Production Bible entities, sequences and shots, voice transcription/timing, captions, music/SFX, durable assembly, resumable jobs, stronger continuity, and social output presets. These are not cosmetic improvements; they are the stages required for the product to behave like a studio.

## One studio shell, different workflow recipes

Final Frame should not create a separate application for every content type. All workflows should use the same visible production stages, with different required cards and defaults. The user should always know where they are:

`Brief → Script/Performance → Plan → Assets & Bible → Shot design → Generate → Assemble → Review → Export`

The system can skip a stage only when it has an approved artifact already available. It should never silently skip a required decision or start expensive generation before the user approves the plan and estimate.

### Stage 1 — Brief

User selects the content recipe, desired outcome, platform, duration, language, aspect ratio, and source mode. The brief must show the minimum required inputs for the selected recipe.

### Stage 2 — Script or performance

The user writes or imports the script, records/uploads voice, imports footage, or supplies a product/ad brief. AI can draft or restructure content, but the user approves the actual words, speakers, and timing.

### Stage 3 — Plan

The AI Director turns the brief into an approved sequence of scenes and shots. Each shot explains its purpose, dialogue, visual action, camera, duration, dependencies, required assets, and estimated cost.

### Stage 4 — Assets and Bible

Users upload or approve the required logo, product, people, characters, voice, location, style, UI screens, and reference media. The system records source, role, permissions, and continuity rules. No missing product, identity, or brand asset should be invented.

### Stage 5 — Shot design

Users review anchor frames, shot cards, dialogue mapping, camera movement, motion intensity, text overlays, and continuity warnings. This is where a creator fixes a character outfit, product angle, UI state, or scene order before spending generation credits.

### Stage 6 — Generate

Final Frame generates independent shot versions. A completed shot remains valid if another shot fails. The user can regenerate one shot, compare versions, and understand the credit impact.

### Stage 7 — Assemble

The system places approved shots, voice, music, ambience, SFX, captions, overlays, and CTA elements into a deterministic assembly manifest. The user sees a shot strip and playback review rather than a premature complex NLE.

### Stage 8 — Review

The Validator checks narrative coverage, visual continuity, audio sync, caption quality, safe areas, product/logo integrity, missing media, rights confirmations, and platform constraints. Review comments should attach to a shot or track.

### Stage 9 — Export

The user selects one or more platform presets. Final Frame creates the master plus derivatives, captions, thumbnail, title/description suggestions, and an export history. Export should never destroy or overwrite the approved master.

## Workflow recipe by video type

### A. Commercial / social ad

**Best for:** paid ads, product launches, offers, service promotion.

1. Capture product, audience, offer, proof, CTA, brand rules, and destination.
2. Director drafts several hook/benefit/proof/CTA structures.
3. User approves one script and a 15–45 second shot plan.
4. Build a product and brand Bible: exact logo, packaging, colors, typography, claims, and forbidden changes.
5. Approve product anchor frames and key benefit scenes.
6. Generate independent shots with product/brand references attached.
7. Assemble voice, music, SFX, captions, benefit text, and CTA.
8. Validate claims, product fidelity, brand safe area, and first-two-second hook.
9. Export vertical, square, and landing-page variants.

**Current status:** strong project, message-block, branding, blueprint, asset, render, review, and export foundations. **Needs improvement:** first-class product/brand entities, ad-specific shot templates, claim validation, audio/caption assembly, and true platform derivatives.

### B. UGC / testimonial / creator video

**Best for:** reviews, founder clips, creator ads, phone-shot testimonials.

1. Upload or record the creator footage/voice and select the speaker identity.
2. Transcribe, remove unusable sections, and approve the final spoken performance.
3. Director maps hook, proof, objection, and CTA beats.
4. Upload product references, creator reference, logos, B-roll, and disclosure text.
5. Plan talking-head coverage, cutaways, captions, emphasis words, and B-roll shots.
6. Generate or select B-roll and supported avatar/video transformations.
7. Assemble the creator track, B-roll, captions, music, and disclosures.
8. Review authenticity, pacing, lip/voice alignment where applicable, and ad-policy text.
9. Export multiple hooks and platform crops.

**Current status:** identity onboarding, asset upload, avatar-video strategy, video-to-video strategy, scene planning, render, review, and export exist. **Needs improvement:** transcription, speaker/timing records, caption tracks, UGC-specific templates, disclosure handling, and actual media assembly.

### C. Explainer / educational video

**Best for:** product education, tutorials, process explanations, thought leadership.

1. Define audience, learning outcome, misconception, and desired action.
2. Approve a structured script: hook, problem, explanation, example, recap, CTA.
3. Director creates a visual teaching plan with one concept per scene.
4. Add UI screenshots, diagrams, product assets, presenter/voice, and style references.
5. Approve storyboard frames and on-screen text before motion generation.
6. Generate short visual shots, UI motion, diagrams, or presenter segments.
7. Assemble narration, captions, callouts, music, and cursor/screen emphasis.
8. Validate terminology, text legibility, caption timing, and that visuals support the narration.
9. Export short social cut, full explainer, and landing-page version.

**Current status:** AI Brain planning, scenes, camera/motion fields, image/video engines, and export foundations exist. **Needs improvement:** typed narration-to-visual coverage, screen/UI asset roles, text-safe rendering, caption/timeline tracks, and duration-aware assembly.

### D. SaaS demo / launch hype video

**Best for:** X, Reels, product launches, feature announcements, pitch loops.

1. Import product screenshots, screen recording, URL or feature brief.
2. Define the single feature or moment the viewer must understand.
3. Director creates a beat sheet: pain, reveal, interaction, outcome, CTA.
4. Create a product/UI Bible with approved screens, states, cursor behavior, brand motion, and typography.
5. Approve screen choreography and text overlays.
6. Generate motion graphics, transitions, device mockups, and supporting visual shots.
7. Assemble UI footage, kinetic text, SFX, music, and CTA.
8. Validate that screens are accurate, text is readable, and the product is never visually fabricated.
9. Export 9:16, 1:1, 16:9, and pitch-loop versions.

**Current status:** SaaS content type, motion fields, image/video generation, templates, and export types exist. **Needs improvement:** first-class UI/screen assets, deterministic motion-graphics assembly, screen text fidelity, and a dedicated SaaS workflow rather than generic blueprint prompting.

### E. Motion graphics / announcement

**Best for:** launches, events, sale announcements, title cards, brand moments.

1. Collect message hierarchy, dates, numbers, CTA, logo, and brand kit.
2. Approve a short copy deck and timing map.
3. Select a motion language: kinetic type, shape system, logo reveal, collage, or product-led.
4. Lock typography, colors, safe areas, transition rules, and music/SFX direction.
5. Approve still keyframes and the complete text layout before animation.
6. Generate bounded deterministic motion-graphics shots and any supporting AI visuals.
7. Assemble text, logo, music, SFX, and optional voiceover.
8. Validate every character, date, number, logo, and safe-area placement.
9. Export social and presentation variants.

**Current status:** motion graphics feature flag, motion configuration, image engine, renderer foundation, and fixture support exist. **Needs improvement:** a real deterministic motion-graphics production path, text-safe composition, audio tracks, and export validation. The existing Remotion foundation should be used here instead of relying entirely on generative video.

### F. Avatar / presenter video

**Best for:** announcements, lessons, sales messages, onboarding, multilingual presenter content.

1. Choose an approved self, avatar, or presenter asset and language.
2. Write or upload the script and approve pronunciation/emphasis.
3. Director divides the script into presenter beats and supporting cutaways.
4. Lock presenter identity, wardrobe, background, logo placement, and disclosure requirements.
5. Approve presenter framing and anchor reference.
6. Generate presenter segments and optional B-roll separately.
7. Assemble presenter, cutaways, captions, music, and CTA.
8. Validate identity, pronunciation, sync, captions, and disclosure.
9. Export platform variants.

**Current status:** identity presence, AI actor selection, avatar-video render strategy, assets, and review exist. **Needs improvement:** persistent presenter records, voice/TTS controls, transcript timing, lip-sync capability checks, and explicit synthetic-media labeling.

### G. Nigerian 2D comedy / cartoon

**Best for:** voiceover-driven skits, recurring characters, local comedy, serialized social content.

1. Upload or record the voiceover, or write the dialogue.
2. Transcribe, detect speakers, and let the user map each speaker to a character.
3. Approve the joke structure: hook, setup, escalation, reversal, punchline, reaction.
4. Create/reuse a show Bible with characters, accents, outfits, expressions, poses, locations, props, and cultural language notes.
5. Approve character sheets, location frames, and a limited animation style.
6. Split the performance into short dialogue and reaction shots.
7. Generate 2D poses, mouth/face changes, camera moves, and backgrounds; avoid asking one model to invent an entire episode.
8. Assemble to the original voice, add SFX, music, captions, and reaction timing.
9. Validate speaker assignment, comedy timing, character continuity, subtitle spelling, and cultural language.
10. Export short-form cuts and preserve the cast for the next episode.

**Current status:** comedy workflow type, Nigerian comedy marketing concept, scene blueprint, asset library, continuity contracts, generation, assembly foundation, and export exist in pieces. **Needs improvement:** voice-first entry, transcription/speaker mapping, persistent show Bible, 2D pose/rig asset roles, limited-animation shot templates, and real assembly.

### H. Voice-led story / narrated montage

**Best for:** TikTok narration, folktales, documentaries, motivational stories, commentary, faceless channels.

1. Upload/record narration and confirm usage rights.
2. Transcribe and approve the exact narration with timestamps.
3. Director identifies story beats, visual nouns, emotional shifts, and shot durations.
4. Add people, places, archival images, products, or style references.
5. Approve anchor images and visual coverage plan.
6. Generate or select B-roll shots independently.
7. Assemble narration first, then visuals, captions, ambience, music, and SFX around it.
8. Validate that visual changes follow the narration and avoid unsupported factual imagery.
9. Export captioned platform variants.

**Current status:** audio assets, general planning, video-to-video/image-to-video strategies, review, and export foundations exist. **Needs improvement:** transcription, timing, rights metadata, narrative coverage validation, caption tracks, and assembly.

### I. Existing footage transformation

**Best for:** polishing phone footage, repurposing interviews, adding B-roll, reframing, captioning, and social cutdowns.

1. Upload footage and validate format, duration, audio, and ownership/permission.
2. Transcribe and mark selects, pauses, speakers, and usable moments.
3. Define the transformation: trim, reframe, caption, clean audio, add B-roll, opening, ending, or CTA.
4. Create a treatment and approve the edit plan before generation.
5. Link product, logo, style, and supporting assets.
6. Generate only the missing B-roll/opening/ending or supported video-to-video transformations.
7. Assemble original footage, generated clips, captions, music, SFX, and overlays.
8. Validate source integrity, edit continuity, caption accuracy, and crop safety.
9. Export derivatives without changing the original source.

**Current status:** FOOTAGE input mode, video-to-video strategy, asset upload, scene editing, remix, review, and export are present. **Needs improvement:** real trim/select/timeline semantics, transcription, media metadata, assembly worker integration, and source/derived asset lineage.

### J. Cinematic short film / serialized story

**Best for:** narrative shorts, episodic stories, dramatic scenes, longer productions.

1. Develop premise, characters, world, episode/film goal, and audience rating.
2. Approve treatment, screenplay, dialogue, and scene order.
3. Build a versioned story Bible with characters, locations, props, wardrobe, tone, and visual language.
4. Break scenes into sequences and shots with dependencies and continuity snapshots.
5. Approve keyframes, casting/voice, and production estimate.
6. Generate shot versions incrementally and preserve completed work.
7. Assemble by sequence, then by episode/film; add dialogue, score, SFX, and captions.
8. Review continuity, pacing, story coverage, and unresolved shots.
9. Export a proof, social trailer, and final master.

**Current status:** the data model and implementation plan acknowledge sequences, long-form continuation, snapshots, and resumable production as future direction. **Needs improvement:** nearly the entire long-form UX and durable continuation path. This should be represented now in the model but released after short-form economics and assembly are reliable.

## Implementation readiness matrix

| Capability | Current evidence | Readiness | Required next move |
|---|---|---:|---|
| Content type selection | `ProjectContentType`, workflow enums, onboarding and creation UI | Partial | Make recipe selection drive required stages |
| Step-by-step shell | `workflowStepper`, create flow, blueprint/editor/review/export routes | Partial | Make stage completion persisted and blocking |
| AI planning | Blueprint Director with structured scene output | Partial | Evolve into typed DirectorPlan and approval boundary |
| Scene planning | Scene CRUD, camera/motion fields, editor | Partial | Add sequence/shot hierarchy and stable versions |
| Image generation | Image engine and provider adapter | Partial | Add anchor-pack and asset-role workflow |
| Video generation | Runway strategies and generation actions | Partial | Add capability routing and independent shot jobs |
| Character continuity | Continuity contracts and references | Early | Add persistent characters, locations, props, style entities |
| Voice/transcription | Audio upload/assets only | Missing | Add transcript, timestamps, speaker mapping, captions |
| Music/SFX | Not confirmed as a first-class workflow | Missing | Add audio tracks and optional generation/asset selection |
| Assembly | Remotion worker foundation and assembly action | Early | Produce verified manifest/export artifacts |
| Review/validation | Review links, comments, status/validation patterns | Partial | Attach findings to shots/tracks and add export blockers |
| Export | Export jobs, platform/resolution fields | Partial | Add presets, safe areas, captions, signed artifacts |
| Credits/jobs | Credits and async job concepts | Partial | Add reservations, leases, idempotency, retry safety |
| Templates | Template storage/listing and marketing examples | Partial | Turn recipes into stage-aware templates |
| Long form | Model/planning intent only | Deferred | Keep data model, defer rich UX until short form works |

## Recommended achievable release sequence

### Release 1 — Studio foundation

Support three deeply reliable recipes: **Voice-led Nigerian Cartoon Comedy**, **Commercial/Social Ad**, and **Existing Footage Transformation**. All three share the same nine stages. Add persisted stage status, plan approval, cost approval, shot records, anchor assets, and a reviewable assembly.

### Release 2 — Audio and continuity

Add transcription, speaker mapping, captions, audio tracks, character/location/product entities, and continuity warnings. This release is the most important for the user’s requested “real” and consistent output.

### Release 3 — Product and motion workflows

Add SaaS demos, explainers, UGC, motion graphics, and presenter videos as recipe-specific stage configurations. Use Remotion for deterministic text/UI/motion layers and generative video only where it adds value.

### Release 4 — Scale and reuse

Add series/show libraries, reusable casts, multilingual versions, platform derivatives, shot-level retries, usage analytics, and team review.

### Release 5 — Long-form

Add episodic and cinematic continuation after the short-form pipeline can reliably preserve completed shots, resume failed sequences, and assemble verified masters.

## Final product principle

The user should feel like they are operating a small production studio:

`Choose the production → prepare the words/performance → approve the plan → lock the world → approve shots → generate in controlled passes → assemble → review → publish`

“Generate everything” may exist as a convenience for advanced users later, but it should be a shortcut over completed stage contracts—not the primary product experience. The primary experience must make creative decisions visible, preserve user control, show progress and cost, and keep every approved asset reusable.
