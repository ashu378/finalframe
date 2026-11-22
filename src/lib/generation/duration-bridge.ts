import { selectVideoRoute, type VideoRoutingRequest, type VideoModelCapabilities, type VideoRoutePolicy } from '../ai/video-routing';

/** An execution-only handle: approved content/timeline lengths stay unchanged.
 * Never round speech, source operations, frame anchors or required audio. */
export function canBridgeSilentDuration(request: VideoRoutingRequest, hasPlannedDialogue = false) {
  return request.operation === 'GENERATE' && request.task === 'GENERATE' && request.audioPolicy === 'SILENT'
    && request.hasImageReferences === true && Number.isSafeInteger(request.imageReferenceCount) && request.imageReferenceCount! > 0
    && !hasPlannedDialogue && !request.hasVideoReference && !request.hasAudioReference && !request.requiresAudio
    && !request.requiresFirstFrame && !request.requiresLastFrame && !request.requiresMask && !request.requiresSourceAudioPreservation
    && !request.previousJobId && !request.previousModelId && request.upscaleFactor === undefined && request.creativity === undefined
    && !request.upscaleSource && !request.editSource && !request.motionSource && !request.lipSyncSource && !request.lipSyncPortrait;
}
export function selectGenerationDuration(request: VideoRoutingRequest, models: readonly VideoModelCapabilities[], policy?: VideoRoutePolicy, hasPlannedDialogue = false) {
  const bridgeAllowed = canBridgeSilentDuration(request, hasPlannedDialogue) && Number.isFinite(request.durationSeconds) && request.durationSeconds > 0 && request.durationSeconds < 60;
  // An exact compatible duration takes priority over a preferred model that
  // needs longer footage. Live UGC exposed the risk: its action finished in
  // provider-only handles and disappeared from the approved shorter edit.
  // Route policy still controls quality/caps (including Premium's allowlist).
  let original: unknown;
  try { return { request, selection: selectVideoRoute(request, models, policy) }; } catch (error) { original = error; }
  if (!bridgeAllowed) throw original;
  const durations = [...new Set(models.filter(model => model.available).flatMap(model => model.supportedDurations))]
    .filter(duration => Number.isFinite(duration) && duration > request.durationSeconds && duration <= 60).sort((a,b)=>a-b);
  for (const durationSeconds of durations) {
    const candidate = { ...request, durationSeconds };
    try { return { request: candidate, selection: selectVideoRoute(candidate, models, policy) }; } catch { /* Continue only through fully compatible larger lengths. */ }
  }
  throw original;
}
