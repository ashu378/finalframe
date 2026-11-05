import { normalizeSha256 } from '../../../../renderer/src/media/sha256';
import { RECIPE_LIMITS, type CompiledRecipe, type CompiledRecipeNode, type RecipeBinding, type RecipeContext, type RecipeDocument, type RecipeStep, type ExistingRecipeNode } from './contract';
import { parseRecipeDocument } from './schema';

export function stableRecipeJson(value: unknown): string { return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item); }
export async function recipeHash(value: unknown): Promise<string> { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableRecipeJson(value))))).map(byte => byte.toString(16).padStart(2, '0')).join(''); }
export const recipeNodeRequestHash = (binding: RecipeBinding, operation: string, request: Record<string, unknown>) => recipeHash({ binding, operation, request });
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const visual = (step: RecipeStep) => ['GENERATION', 'GRAPHIC', 'SOURCE_RANGE'].includes(step.operation);
const paid = (step: RecipeStep) => step.operation === 'PREPARATION' || step.operation === 'GENERATION' || step.operation === 'NARRATION' && step.mode === 'GENERATE';
const approvalId = (key: string) => `approve:${key}`;
const same = (a: unknown, b: unknown) => stableRecipeJson(a) === stableRecipeJson(b);

/** Compile proposals only. Context MUST be constructed by an authenticated
 * canonical server resolver; a JSON payload claiming these facts is not one.
 * All effects must recheck source/approval/consent/price through existing fences. */
export async function compileRecipe(input: unknown, context: RecipeContext, now: number): Promise<CompiledRecipe> {
  const recipe = parseRecipeDocument(input);
  context = structuredClone(context);
  assert(Number.isFinite(now) && now > 0, 'Use a finite compilation time.');
  assert(recipe.fps === context.fps, 'Recipe frame rate must match its canonical shot timing context.');
  assert(context.productionVersionState === 'APPROVED' && same(recipe.binding, context.binding), 'Recipe must bind the exact approved production version and snapshot.');
  assert(Boolean(recipe.binding.continuityBibleId) === Boolean(recipe.binding.continuityHash), 'Continuity identity and hash must be paired.');
  assert(!recipe.binding.continuityBibleId || context.continuityApproved, 'Approve the exact continuity bible first.');
  assert(context.assets.length <= RECIPE_LIMITS.maxAssets && context.shots.length <= 200 && context.voices.length <= 100, 'Canonical recipe context exceeds its bounds.');
  for (const rows of [context.assets, context.shots]) assert(new Set(rows.map(row => row.id)).size === rows.length, 'Canonical context identities must be unique.');
  assert(new Set(context.voices.map(voice => `${voice.id}/${voice.voiceVersionId ?? ''}`)).size === context.voices.length, 'Canonical voice versions must be unique.');
  const steps = new Map(recipe.steps.map(step => [step.key, step]));
  assert(steps.size === recipe.steps.length, 'Recipe step keys must be unique.');
  assert(new Set(recipe.visualOrder).size === recipe.visualOrder.length && recipe.visualOrder.every(key => steps.has(key) && visual(steps.get(key)!)), 'Visual order must contain exact unique visual steps.');
  assert(recipe.steps.filter(visual).every(step => recipe.visualOrder.includes(step.key)), 'Every visual step must have an explicit timeline occurrence.');
  const selected = (key: string | undefined, operation: string) => { if (key) assert(steps.get(key)?.operation === operation, `Choose an exact ${operation} step.`); };
  selected(recipe.narrationStepKey, 'NARRATION'); selected(recipe.musicStepKey, 'MUSIC_ANALYSIS'); selected(recipe.captionStepKey, 'CAPTIONS');
  if (recipe.videoType === 'MOTION_GRAPHICS') assert(recipe.steps.filter(visual).every(step => step.operation === 'GRAPHIC'), 'Motion graphics recipes require structured graphics, not generated footage.');
  if (recipe.videoType === 'PRODUCT_SAAS_LAUNCH') assert(recipe.steps.some(step => step.operation === 'GRAPHIC'), 'Product launch needs exact structured copy and CTA graphics.');
  if (recipe.videoType === 'EXPLAINER_STORY') assert(recipe.narrationStepKey, 'Narrated explainers need an explicitly approved narration step.');
  if (recipe.videoType === 'MUSIC_VIDEO') assert(recipe.musicStepKey, 'Music videos need a supplied approved soundtrack and reviewed beat map.');
  if (recipe.videoType === 'SOCIAL_CUTDOWN') assert(recipe.steps.some(step => step.operation === 'SOURCE_RANGE'), 'Social cutdowns need explicit measured source ranges.');
  const usedAssets = new Map<string, unknown>();
  const asset = (id: string, kind?: 'audio' | 'image' | 'visual') => {
    const row = context.assets.find(value => value.id === id);
    assert(row && row.projectId === recipe.binding.projectId && ['APPROVED', 'LOCKED'].includes(row.state) && row.rightsApproved && row.storageId && normalizeSha256(row.checksum) && Number.isSafeInteger(row.byteSize) && row.byteSize > 0, 'Recipe source asset must have current canonical project approval, rights and stored bytes.');
    assert(!kind || (kind === 'visual' ? /^(video|image)\//.test(row.mimeType) : row.mimeType.startsWith(`${kind}/`)), 'Recipe asset modality does not match its operation.');
    const snapshot = { id: row.id, projectId: row.projectId, storageId: row.storageId, checksum: normalizeSha256(row.checksum)!, byteSize: row.byteSize, mimeType: row.mimeType, ...(row.durationSeconds !== undefined ? { durationSeconds: row.durationSeconds } : {}) };
    usedAssets.set(id, snapshot); return snapshot;
  };
  const dependencies = new Map<string, string[]>(); const requests = new Map<string, Record<string, unknown>>(); const durations = new Map<string, number>();
  for (const step of recipe.steps) {
    const deps: string[] = []; let request: Record<string, unknown> = { ...step }; delete request.key;
    if (step.operation === 'PREPARATION') {
      if (step.kind === 'TRANSCRIPT') {
        assert(Boolean(step.sourceAssetId) !== Boolean(step.sourceStepKey), 'Transcription needs exactly one explicit audio source.');
        assert(!step.text.trim(), 'Transcription cannot silently treat text as an audio source.');
        if (step.sourceAssetId) { const source = asset(step.sourceAssetId, 'audio'); assert(Number.isFinite(source.durationSeconds) && source.durationSeconds! > 0 && source.durationSeconds! <= 60, 'Transcription needs measured audio of at most sixty seconds.'); request = { ...request, source }; }
        else { assert(steps.get(step.sourceStepKey!)?.operation === 'NARRATION', 'Generated transcript sources must be narration audio; video audio extraction is a separate workflow.'); deps.push(approvalId(step.sourceStepKey!)); request = { ...request, sourceMeasurementPolicy: 'DECODED_AUDIO_MAX_60S_FRESH_QUOTE_BEFORE_POST' }; }
      }
      else assert(step.text.trim() && !step.sourceAssetId && !step.sourceStepKey, 'Reference preparation requires a prompt; source-image editing is a separate operation.');
    }
    if (step.operation === 'NARRATION' && step.mode === 'RECORDING') {
      const source = asset(step.sourceAssetId, 'audio');
      assert(Number.isFinite(source.durationSeconds) && source.durationSeconds! > 0 && step.durationFrames <= RECIPE_LIMITS.maxSeconds * recipe.fps && (step.startFrame + step.durationFrames) / recipe.fps <= source.durationSeconds! + 0.000001, 'Recorded narration needs a measured in-bounds source range of at most sixty seconds.');
      request = { ...request, source, audioPolicy: 'PRESERVE_RECORDING_NO_SYNTHESIS_FALLBACK' };
    }
    if (step.operation === 'NARRATION' && step.mode === 'GENERATE') {
      assert(step.text.trim(), 'Narration needs explicit script text.');
      const voice = context.voices.find(value => value.id === step.voiceId && (step.voiceVersionId ? value.voiceVersionId === step.voiceVersionId : value.voiceVersionId === undefined));
      assert(voice && voice.projectId === recipe.binding.projectId && voice.approved && voice.kind !== 'RECORDED', 'Narration needs a current approved stock or consented reference voice.');
      if (voice.kind === 'CLONED') { assert(voice.consentCurrent && step.primaryVoiceSampleAssetId && voice.sampleAssetIds.includes(step.primaryVoiceSampleAssetId) && step.text.length <= 3000, 'Reference narration needs explicit approved primary sample and current consent.'); asset(step.primaryVoiceSampleAssetId, 'audio'); }
      else assert(!step.primaryVoiceSampleAssetId, 'Stock narration cannot silently become reference cloning.');
      request = { ...request, voice: { id: voice.id, projectId: voice.projectId, kind: voice.kind, ...(step.voiceVersionId ? {voiceVersionId:step.voiceVersionId} : {}) } };
    }
    if (step.operation === 'GENERATION') {
      const shot = context.shots.find(value => value.id === step.shotId);
      assert(shot && shot.productionVersionId === recipe.binding.productionVersionId && shot.prompt.trim() && Number.isSafeInteger(shot.durationFrames) && shot.durationFrames > 0, 'Generation needs an exact approved snapshot shot.');
      const direct = step.references.filter(ref => 'assetId' in ref).map(ref => 'assetId' in ref ? ref.assetId : '');
      const slots = step.references.filter(ref => 'stepKey' in ref).map(ref => 'stepKey' in ref ? ref.stepKey : '');
      assert(new Set([...direct, ...slots]).size === direct.length + slots.length && same(direct, shot.referenceAssetIds) && same(slots, shot.approvedRecipeReferenceSlots), 'Recipe cannot rewrite approved shot references or invent dynamic reference slots. Create a revised plan.');
      for (const id of direct) { const source = asset(id); assert(!source.mimeType.startsWith('video/'), 'Generic video references lack a bounded input billing certificate.'); }
      for (const key of slots) { const reference = steps.get(key); assert(reference?.operation === 'PREPARATION' && reference.kind === 'CHARACTER_REFERENCE', 'Dynamic shot slots must refer to approved reference-image preparation.'); deps.push(approvalId(key)); }
      durations.set(step.key, shot.durationFrames); request = { ...request, shot };
    }
    if (step.operation === 'GRAPHIC') { assert(step.title.trim(), 'Graphics need an explicit readable title.'); if (step.logoAssetId) { asset(step.logoAssetId, 'image'); assert(step.templateId !== 'kinetic-title', 'This template has no logo slot.'); } durations.set(step.key, step.durationFrames); }
    if (step.operation === 'SOURCE_RANGE') { const source = asset(step.sourceAssetId, 'visual'); if (source.mimeType.startsWith('video/')) { assert(step.fit === undefined, 'Still-image fit cannot be applied to video.'); assert(Number.isFinite(source.durationSeconds) && source.durationSeconds! > 0 && (step.startFrame + step.durationFrames) / recipe.fps <= source.durationSeconds! + 0.000001, 'Source range must fit the measured canonical video.'); } else assert(step.startFrame === 0 && step.audioPolicy === 'MUTE', 'Still images have no source-audio or media trim.'); durations.set(step.key, step.durationFrames); request = { ...request, source }; }
    if (step.operation === 'MUSIC_ANALYSIS') { const source = asset(step.sourceAssetId, 'audio'); assert(Number.isFinite(source.durationSeconds) && source.durationSeconds! > 0 && (step.trimStartFrame + step.durationFrames) / recipe.fps <= source.durationSeconds! + 0.000001, 'Soundtrack must fit measured canonical audio.'); request = { ...request, source }; }
    if (step.operation === 'CAPTIONS') { const transcript = steps.get(step.transcriptStepKey); assert(transcript?.operation === 'PREPARATION' && transcript.kind === 'TRANSCRIPT', 'Caption timing must come from reviewed transcript evidence, never invented timestamps.'); deps.push(approvalId(transcript.key)); request = { ...request, timingPolicy: 'VALIDATED_TIMED_SEGMENTS_OR_REVIEWED_CUES' }; }
    dependencies.set(step.key, deps); requests.set(step.key, request);
  }
  const durationFrames = recipe.visualOrder.reduce((sum, key) => sum + durations.get(key)!, 0);
  assert(durationFrames > 0 && durationFrames <= RECIPE_LIMITS.maxSeconds * recipe.fps, 'Recipe timeline remains within the sixty-second production bound.');
  const dialogueTracks: Array<{stepKey:string;shotId:string;segmentIndex:number;speakerResourceVersionId:string;voiceVersionId:string;startSeconds:number;durationSeconds:number;text:string}> = [];
  const dialogueSteps = new Set<string>(), dialogueSegments = new Set<string>();
  for (const track of recipe.dialogueTracks ?? []) {
    const narration = steps.get(track.stepKey);
    const visualKeys = recipe.visualOrder.filter(key => { const step=steps.get(key)!; return step.operation==='GENERATION'&&step.shotId===track.shotId; });
    const shot=context.shots.find(value=>value.id===track.shotId), segment=shot?.dialogueSegments?.[track.segmentIndex];
    assert(narration?.operation==='NARRATION'&&narration.mode==='GENERATE'&&segment&&visualKeys.length===1, 'Dialogue needs one exact canonical shot and a generated speech step.');
    assert(!dialogueSteps.has(track.stepKey)&&track.stepKey!==recipe.narrationStepKey&&!dialogueSegments.has(`${track.shotId}/${track.segmentIndex}`), 'Each dialogue segment and speech output may occur only once.');
    assert(shot!.nativeAudioPolicy==='SILENT', 'Exact planned dialogue requires explicitly SILENT picture audio; revise and approve the shot instead of replacing native sound.');
    assert(narration.voiceVersionId===segment.voiceVersionId&&narration.text===segment.text, 'Dialogue speech must use the exact approved words and immutable speaker voice.');
    assert(Number.isFinite(segment.startSeconds)&&Number.isFinite(segment.durationSeconds)&&segment.startSeconds>=0&&segment.durationSeconds>0&&(segment.startSeconds+segment.durationSeconds)*recipe.fps<=shot!.durationFrames+0.000001, 'Dialogue timing must stay inside its approved shot.');
    const before=recipe.visualOrder.slice(0,recipe.visualOrder.indexOf(visualKeys[0])).reduce((sum,key)=>sum+durations.get(key)!,0);
    dialogueTracks.push({...track,speakerResourceVersionId:segment.speakerResourceVersionId,voiceVersionId:segment.voiceVersionId,startSeconds:before/recipe.fps+segment.startSeconds,durationSeconds:segment.durationSeconds,text:segment.text});
    dialogueSteps.add(track.stepKey);dialogueSegments.add(`${track.shotId}/${track.segmentIndex}`);
  }
  if (recipe.narrationStepKey) { const narration = steps.get(recipe.narrationStepKey)!; if (narration.operation === 'NARRATION' && narration.mode === 'RECORDING') assert(narration.durationFrames <= durationFrames, 'Recorded narration cannot overrun the proposed picture; revise the timeline.'); }
  if (recipe.musicStepKey) { const music = steps.get(recipe.musicStepKey)!; assert(music.operation === 'MUSIC_ANALYSIS' && music.durationFrames === durationFrames, 'Soundtrack window must exactly cover the proposed timeline.'); }
  const targets = new Map<string, CompiledRecipeNode['approvalTarget']>();
  for (const step of recipe.steps) { if (step.operation === 'GENERATION') targets.set(step.key, 'TAKE'); if (step.operation === 'PREPARATION') targets.set(step.key, step.kind === 'TRANSCRIPT' ? 'TRANSCRIPT' : 'ASSET'); if (step.operation === 'NARRATION') targets.set(step.key, 'ASSET'); if (step.operation === 'MUSIC_ANALYSIS') targets.set(step.key, 'BEAT_MAP'); if (step.operation === 'CAPTIONS') targets.set(step.key, 'CAPTION_PLAN'); }
  const raw: Array<Omit<CompiledRecipeNode, 'requestHash' | 'idempotencyKey'>> = [];
  for (const step of recipe.steps) { raw.push({ id: step.key, operation: step.operation, dependencies: dependencies.get(step.key)!, request: requests.get(step.key)!, effect: paid(step) ? 'PAID' : 'LOCAL' }); const target = targets.get(step.key); if (target) raw.push({ id: approvalId(step.key), operation: 'APPROVAL', dependencies: [step.key], request: { sourceNodeId: step.key, decisionPolicy: 'EXPLICIT_OWNER_APPROVAL_OF_EXACT_RESULT' }, approvalTarget: target, effect: 'HUMAN' }); }
  const terminal = (key: string) => targets.has(key) ? approvalId(key) : key;
  const roots = [...recipe.visualOrder, ...dialogueTracks.map(track=>track.stepKey), recipe.narrationStepKey, recipe.musicStepKey, recipe.captionStepKey].filter((key): key is string => !!key);
  raw.push({ id: 'timeline', operation: 'TIMELINE', dependencies: roots.map(terminal), request: { visualOrder: recipe.visualOrder, narrationStepKey: recipe.narrationStepKey ?? null, ...(dialogueTracks.length?{dialogueTracks}:{}), musicStepKey: recipe.musicStepKey ?? null, captionStepKey: recipe.captionStepKey ?? null, durationFrames, fps: recipe.fps, narrationTiming: 'MEASURE_BEFORE_PLACEMENT_REVISE_IF_OVERFLOW', preserveApprovedSources: true }, effect: 'LOCAL' });
  raw.push({ id: 'approve:timeline', operation: 'APPROVAL', dependencies: ['timeline'], request: { sourceNodeId: 'timeline', decisionPolicy: 'EXPLICIT_OWNER_APPROVAL_AND_LOCK_OF_EXACT_VERSION' }, approvalTarget: 'TIMELINE', effect: 'HUMAN' });
  raw.push({ id: 'manifest', operation: 'MANIFEST', dependencies: ['approve:timeline'], request: { contractVersion: 5, timelineNodeId: 'timeline' }, effect: 'LOCAL' });
  raw.push({ id: 'export', operation: 'EXPORT', dependencies: ['manifest'], request: { manifestNodeId: 'manifest', completionPolicy: 'SIGNED_CALLBACK_STORED_SHA_VERIFIED_DOWNLOAD', reviewPolicy: 'CANONICAL_REVIEW_REQUIREMENTS_NO_AUTO_APPROVAL' }, effect: 'LOCAL' });
  assert(raw.length <= RECIPE_LIMITS.maxNodes && new Set(raw.map(node => node.id)).size === raw.length, 'Recipe node identities collide with reserved terminal keys.');
  const byId = new Map(raw.map(node => [node.id, node])); const visited = new Set<string>(); const visiting = new Set<string>(); const ordered: typeof raw = [];
  const visit = (id: string) => { if (visited.has(id)) return; assert(!visiting.has(id) && byId.has(id), 'Recipe dependencies are missing or cyclic.'); visiting.add(id); const node = byId.get(id)!; node.dependencies.forEach(visit); visiting.delete(id); visited.add(id); ordered.push(node); };
  visit('export'); assert(visited.size === raw.length, 'Unused preparation or operations cannot purchase work outside the selected recipe.');
  const hash = await recipeHash({ recipe, assets: [...usedAssets.entries()].sort(([a], [b]) => a.localeCompare(b)), requests: ordered.map(node => ({ id: node.id, operation: node.operation, request: node.request })) });
  const nodes: CompiledRecipeNode[] = [];
  const existingById = new Map((context.existingNodes ?? []).map(node => [node.nodeId, node])); assert(existingById.size === (context.existingNodes ?? []).length && existingById.size <= raw.length, 'Existing node references must be unique and bounded.');
  for (const node of ordered) {
    const dependencyRequests = node.dependencies.map(id => { const dependency = nodes.find(value => value.id === id); assert(dependency, 'Compile dependencies before consumers.'); return { nodeId: id, requestHash: dependency.requestHash }; });
    const boundRequest = { ...node.request, dependencyRequests, fps: recipe.fps, canonicalSourceBindings: [...usedAssets.entries()].sort(([a], [b]) => a.localeCompare(b)) };
    const requestHash = await recipeNodeRequestHash(recipe.binding, node.operation, boundRequest); const idempotencyKey = 'recipe-v1:' + await recipeHash({ recipeHash: hash, nodeId: node.id }); const existing = existingById.get(node.id);
    if (existing) { assert(node.effect !== 'HUMAN' && existing.jobId && existing.requestHash === requestHash && existing.idempotencyKey === idempotencyKey, 'Existing job reference does not bind this exact node.'); assert(existing.status !== 'COMPLETED' || existing.resultId, 'Completion needs an actual retained result.'); existingById.delete(node.id); }
    const candidate = context.quotes[node.id];
    const quote = candidate && candidate.requestHash === requestHash && candidate.quoteId && candidate.model && candidate.catalogFingerprint && Number.isFinite(candidate.providerCeilingUsd) && candidate.providerCeilingUsd > 0 && candidate.providerCeilingUsd <= 1000000 && Number.isSafeInteger(candidate.creditCeiling) && candidate.creditCeiling > 0 && candidate.creditCeiling <= 1000000000 && Number.isFinite(candidate.checkedAt) && candidate.checkedAt <= now + 1000 && now - candidate.checkedAt <= 30000 && Number.isFinite(candidate.expiresAt) && candidate.expiresAt > now && candidate.expiresAt > candidate.checkedAt ? { ...candidate } : undefined;
    nodes.push({ ...node, request: boundRequest, requestHash, idempotencyKey, ...(node.effect === 'PAID' && quote ? { quote } : {}), ...(existing ? { existing: { ...existing } } : {}) });
  }
  assert(existingById.size === 0, 'Existing job belongs to an unknown recipe node.');
  const paidNodes = nodes.filter(node => node.effect === 'PAID'); const blockedNodeIds = paidNodes.filter(node => !node.quote).map(node => node.id); const complete = blockedNodeIds.length === 0;
  return { kind: 'finalframe.recipe-plan', version: 1, recipeHash: hash, binding: { ...recipe.binding }, videoType: recipe.videoType, fps: recipe.fps, durationFrames, nodes, estimate: { complete, providerCeilingUsd: complete ? Math.ceil(paidNodes.reduce((sum, node) => sum + node.quote!.providerCeilingUsd, 0) * 1e6) / 1e6 : null, creditCeiling: complete ? paidNodes.reduce((sum, node) => sum + node.quote!.creditCeiling, 0) : null, blockedNodeIds, expiresAt: complete && paidNodes.length ? Math.min(...paidNodes.map(node => node.quote!.expiresAt)) : null }, activation: 'EXPLICIT_OPT_IN_AFTER_ESTIMATE', legacyCompatibility: 'APPROVED_PLANS_REMAIN_MANUAL' };
}

export type RecipeNodeAction = 'COMPLETE' | 'WAIT_APPROVAL' | 'WAIT_DEPENDENCIES' | 'WAIT_ESTIMATE' | 'READY_AFTER_OPT_IN' | 'OBSERVE_EXISTING' | 'POLL_EXISTING' | 'RECONCILE_EXISTING' | 'STOP_FAILED' | 'CANCEL_UNACCEPTED' | 'CANCELED';
/** Read-only decision helper, not a runner or authorization gate. Approval IDs
 * must come from canonical resource-state receipts resolved by the server. */
export function recipeNodeActions(plan: CompiledRecipe, approvedNodeIds: readonly string[], now: number, canceled = false): Record<string, RecipeNodeAction> {
  const approved = new Set(approvedNodeIds); assert(approved.size === approvedNodeIds.length && approvedNodeIds.every(id => plan.nodes.some(node => node.id === id && node.effect === 'HUMAN')), 'Only exact approval nodes may carry canonical approval receipts.');
  const actions: Record<string, RecipeNodeAction> = {};
  for (const node of plan.nodes) {
    const existing: ExistingRecipeNode | undefined = node.existing;
    if (existing?.status === 'COMPLETED') actions[node.id] = 'COMPLETE';
    else if (existing && (existing.providerJobId || ['ACCEPTED', 'RECONCILIATION_REQUIRED'].includes(existing.status))) actions[node.id] = canceled || existing.status === 'RECONCILIATION_REQUIRED' || existing.status === 'FAILED' ? 'RECONCILE_EXISTING' : 'POLL_EXISTING';
    else if (canceled) actions[node.id] = existing ? 'CANCEL_UNACCEPTED' : 'CANCELED';
    else if (existing) actions[node.id] = existing.status === 'FAILED' ? 'STOP_FAILED' : 'OBSERVE_EXISTING';
    else if (!node.dependencies.every(id => actions[id] === 'COMPLETE')) actions[node.id] = 'WAIT_DEPENDENCIES';
    else if (node.effect === 'HUMAN') actions[node.id] = approved.has(node.id) ? 'COMPLETE' : 'WAIT_APPROVAL';
    else if (node.effect === 'PAID' && (!plan.estimate.complete || !node.quote || node.quote.expiresAt <= now || now - node.quote.checkedAt > 30000)) actions[node.id] = 'WAIT_ESTIMATE';
    else actions[node.id] = 'READY_AFTER_OPT_IN';
  }
  return actions;
}
