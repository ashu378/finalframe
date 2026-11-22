import type { MutationCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import type { RecipeDocument } from '../src/lib/production/recipes/contract';
import { canonicalRecipeAsset, recipeObject } from './recipeAuthority';
import { recipeSourceNode } from './recipePlanning';
import { resolveFrozenVoiceSynthesisInput } from './voices';

/** Fresh card narration is separate complete speech per reviewed card. Existing
 * recordings/global narration retain their original placement and bytes. */
export async function resolveCardNarration(ctx: MutationCtx, node: Doc<'recipeRunNodes'>, run: Doc<'recipeRuns'>) {
  const request = recipeObject(node.request), recipe = run.boundRecipe as RecipeDocument;
  function fail(): never { throw new Error('RECIPE_NARRATION_BINDING_CHANGED'); }
  if (recipe.videoType !== 'EXPLAINER_STORY' || recipe.narrationStepKey || recipe.dialogueTracks?.length || !recipe.narrationTracks?.length || recipe.narrationTracks.length > 16 || node.runId !== run._id || node.projectId !== run.projectId || node.productionVersionId !== run.productionVersionId || !Array.isArray(request.narrationTracks) || request.narrationTracks.length !== recipe.narrationTracks.length || JSON.stringify(request.visualOrder) !== JSON.stringify(recipe.visualOrder) || request.fps !== recipe.fps) fail();
  const cards = new Map<string, { startFrame: number; durationFrames: number }>(); let elapsed = 0;
  for (const key of recipe.visualOrder) {
    const declared = recipe.steps.find(step => step.key === key);
    const visual = await recipeSourceNode(ctx, node, key), vr = recipeObject(visual.request);
    if (declared?.operation !== 'GRAPHIC' || visual.operation !== 'GRAPHIC' || visual.projectId !== run.projectId || visual.productionVersionId !== run.productionVersionId || vr.durationFrames !== declared.durationFrames || cards.has(key)) fail();
    cards.set(key, { startFrame: elapsed, durationFrames: declared.durationFrames }); elapsed += declared.durationFrames;
  }
  if (elapsed !== request.durationFrames || elapsed > 60 * recipe.fps || recipe.narrationTracks!.length !== cards.size) fail();
  const audioTracks = [], cues = [], seen = new Set<string>();
  for (const binding of recipe.narrationTracks!) {
    const track = request.narrationTracks.find((value: unknown) => recipeObject(value).stepKey === binding.stepKey), card = cards.get(binding.visualStepKey);
    const declared = recipe.steps.find(step => step.key === binding.stepKey);
    if (!track || !card || binding.startFrame !== 0 || seen.has(binding.stepKey) || seen.has('card:' + binding.visualStepKey) || declared?.operation !== 'NARRATION' || declared.mode !== 'GENERATE' || track.visualStepKey !== binding.visualStepKey || track.startFrame !== 0 || track.startSeconds !== card.startFrame / recipe.fps || track.durationSeconds !== card.durationFrames / recipe.fps || track.text !== declared.text) fail();
    seen.add(binding.stepKey); seen.add('card:' + binding.visualStepKey);
    const source = await recipeSourceNode(ctx, node, binding.stepKey), sr = recipeObject(source.request);
    const id = ctx.db.normalizeId('assets', source.resultId!), voiceId = ctx.db.normalizeId('voices', sr.voiceId), voiceVersionId = source.voiceVersionId ?? sr.voiceVersionId;
    const job = source.linkedGenerationJobId ? await ctx.db.get(source.linkedGenerationJobId) : null, jr = recipeObject(job?.request);
    if (!id || !voiceId || !voiceVersionId || source.operation !== 'NARRATION' || source.projectId !== run.projectId || source.productionVersionId !== run.productionVersionId || sr.mode !== 'GENERATE' || sr.text !== declared.text || sr.voiceId !== declared.voiceId || declared.voiceVersionId && declared.voiceVersionId !== voiceVersionId || sr.voiceVersionId && sr.voiceVersionId !== voiceVersionId || !job || job.projectId !== run.projectId || job.productionId !== run.productionId || job.status !== 'COMPLETED' || job.operation !== 'PREPARATION' || jr.preparationKind !== 'NARRATION' || jr.targetVoiceId !== voiceId || jr.voiceVersionId !== voiceVersionId || jr.text !== declared.text || recipeObject(job.response).assetId !== id) fail();
    await resolveFrozenVoiceSynthesisInput(ctx, { projectId: run.projectId, voiceId: voiceId!, voiceVersionId, use: 'SYNTHESIZE', ...(sr.primaryVoiceSampleAssetId ? { primaryVoiceSampleAssetId: sr.primaryVoiceSampleAssetId } : {}) });
    const found = await canonicalRecipeAsset(ctx, run.projectId, id!), duration = found.canonical.durationSeconds;
    if (!found.canonical.mimeType.startsWith('audio/') || !Number.isFinite(duration) || duration! <= 0 || duration! > card!.durationFrames / recipe.fps + .000001) throw new Error('RECIPE_NARRATION_TIMING_REVIEW_REQUIRED');
    const startSeconds = card!.startFrame / recipe.fps;
    // Give complete decoded audio its final partial video frame. The source is
    // neither trimmed nor stretched; the remaining fraction is natural silence.
    const placedDuration = Math.ceil(duration! * recipe.fps) / recipe.fps;
    audioTracks.push({ assetId: id!, startSeconds, durationSeconds: placedDuration, trimStartSeconds: 0, role: 'voiceover' as const, volume: 1 });
    cues.push({ id: 'narration-' + binding.stepKey, startFrame: card!.startFrame, durationInFrames: Math.ceil(duration! * recipe.fps), text: declared.text, source: { kind: 'PLANNED_NARRATION', runId: run._id, nodeId: source._id, productionVersionId: run.productionVersionId, visualStepKey: binding.visualStepKey, voiceVersionId, audioAssetId: id!, audioStorageId: found.canonical.storageId, audioChecksum: found.canonical.checksum, audioDurationSeconds: duration!, generationJobId: job!._id, approvedText: declared.text, sourceRequestHash: source.requestHash } });
  }
  return { audioTracks, cues, durationSeconds: elapsed / recipe.fps };
}
