# Video type routing

FinalFrame assigns each new project one of eight stable production types: 2D comedy, realistic skit/UGC, product/SaaS launch, motion graphics, explainer/story, cinematic film, music video, or social cutdown. New shot-generation jobs carry the type, requested task, output ratio, duration, optional resolution, project reference IDs, audio IDs, finish tier, chosen route, route reason, catalog/config version, and cost estimate. They retain the project asset IDs; signed media URLs are resolved server-side only when the worker runs.

## Safe activation

The feature flag is off by default. Keep `NEXT_PUBLIC_FF_VIDEO_TYPE_ROUTING=false` until an administrator has refreshed the video catalog, reviewed each model's supported controls, and saved route preferences. Enabling the flag without route policies intentionally causes generation to stop with a safe explanation instead of falling back to an unreviewed model.

In **Admin → Video routing**:

1. Refresh the OpenRouter video catalog.
2. Review availability, text-to-video, image-reference, first/last-frame, and audio-output support. Duration, resolution, aspect-ratio, supported output sizes, pricing SKUs, and provider passthrough facts come from OpenRouter's video catalog and are checked again against the live catalog before every new route.
3. Save model preferences for each type and finish tier. Economy chooses the lowest-cost compatible model; Standard follows the reviewed preference order when possible; Premium requires a preferred model and a per-shot cost cap.
4. Keep a model out of a route if its catalog facts or supported controls are unclear.
5. Enable the feature flag only in the target environment after reviewing the policies.

The initial candidates from the product plan (Seedance 2.5, Veo 3.1 Lite, Veo 3.1, Seedance 2.0 Mini, and MiniMax H3) are suggestions to verify in the current catalog, not pinned defaults. The model list is never hardcoded into video-type feature code.

## Supported request boundary

Text-to-video and image-to-video can route when the selected model supports every requested duration, aspect ratio, resolution, reference image, and first/last frame. Uploaded audio remains project-owned and is not sent as a video-model input; add it as a music/audio track in the editor for assembly. Audio generation is explicitly disabled unless requested. Per-second and resolution-specific catalog rates are estimated directly; per-video-token rates use the closest catalog output size matching the request and OpenRouter's published token formula. Routes without a usable price/size estimate fail closed, and the estimate is not a guaranteed provider quote.

The shared OpenRouter video request currently has no verified portable contract for editing an existing video or extending it, so those tasks and video-reference inputs are rejected before provider submission. They must remain unavailable until a provider-specific request mapping and tests are added. Voice cloning and lip sync are separate capabilities and are not implied by video audio output.

Motion graphics, exact titles, charts, product UI, and logos use renderer compositing. The renderer now supports `kinetic-title`, `brand-card`, `feature-callout`, and `end-card`; graphic clips can store their template ID and exact text in timeline clip metadata. Logo images are resolved from project assets during assembly, not from generated footage.

## Cost and failure behavior

Cost ceilings apply to one shot. A configured ceiling requires a known model price; missing prices fail closed. Resolution-specific OpenRouter pricing SKUs are used where available. A dynamically selected model is submitted without an implicit fallback. Once OpenRouter accepts the request, FinalFrame records its provider job ID before polling and will not automatically submit a second provider job after a later failure.

No paid generation is part of the static test suite. The controlled provider samples from the implementation plan require a separate development key and a verifiable $10 phase limit; skip them until that isolation and cap are confirmed. The real MP4 render remains owner-run.
