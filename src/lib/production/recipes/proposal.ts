import type { RecipeBinding, RecipeDocument, RecipeStep } from './contract';
import { parseRecipeDocument } from './schema';
import { recipeHash } from './compiler';
export interface LogicalRecipeShot { key: string; sequenceOrderIndex: number; sceneOrderIndex: number; shotOrderIndex: number; descriptorHash: string }
export interface RecipeProposalDocument extends Omit<RecipeDocument, 'kind' | 'binding' | 'steps' | 'dialogueTracks'> { kind: 'finalframe.recipe-proposal'; dialogueTracks?:Array<{stepKey:string;logicalShotKey:string;segmentIndex:number}>; steps: Array<Exclude<RecipeStep, { operation: 'GENERATION' }> | { key: string; operation: 'GENERATION'; logicalShotKey: string; references: Array<{ assetId: string } | { stepKey: string }> }> }
export interface MaterializedRecipeShot { shotId: string; sequenceOrderIndex: number; sceneOrderIndex: number; shotOrderIndex: number; descriptorHash: string }
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const placeholderBinding: RecipeBinding = { projectId: 'proposal-project', productionId: 'proposal-production', productionVersionId: 'proposal-version', snapshotHash: '0'.repeat(64) };
export function parseRecipeProposal(value: unknown): RecipeProposalDocument {
  const raw = JSON.stringify(value); if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > 128 * 1024) throw new Error('Recipe proposal exceeds its JSON bound.');
  const snapshot = object(JSON.parse(raw));
  const allowed = new Set(['kind', 'version', 'videoType', 'fps', 'steps', 'visualOrder', 'narrationStepKey', 'dialogueTracks', 'musicStepKey', 'captionStepKey']);
  if (snapshot.kind !== 'finalframe.recipe-proposal' || Object.keys(snapshot).some(key => !allowed.has(key)) || !Array.isArray(snapshot.steps)) throw new Error('Choose a versioned logical recipe proposal without invented canonical IDs.');
  const steps = snapshot.steps.map(value => { const step = object(value); if (step.operation !== 'GENERATION') return step; if (Object.prototype.hasOwnProperty.call(step, 'shotId') || typeof step.logicalShotKey !== 'string') throw new Error('Proposal generation uses logical shot keys, not canonical IDs.'); const { logicalShotKey, ...rest } = step; return { ...rest, shotId: logicalShotKey }; });
    const dialogueTracks=Array.isArray(snapshot.dialogueTracks)?snapshot.dialogueTracks.map(value=>{const track=object(value);if(Object.prototype.hasOwnProperty.call(track,'shotId')||typeof track.logicalShotKey!=='string')throw new Error('Dialogue proposals use logical shot keys.');const {logicalShotKey,...rest}=track;return {...rest,shotId:logicalShotKey};}):snapshot.dialogueTracks;
  parseRecipeDocument({ ...snapshot, kind: 'finalframe.recipe', binding: placeholderBinding, steps,...(dialogueTracks!==undefined?{dialogueTracks}:{}) });
  return snapshot as unknown as RecipeProposalDocument;
}
export function logicalShotKey(sequence: number, scene: number, shot: number) { return `sequence_${sequence}_scene_${scene}_shot_${shot}`; }
export function canonicalShotDescriptor(value: unknown) { const shot = object(value); return { title: shot.title, prompt: shot.prompt, durationSeconds: shot.durationSeconds, orderIndex: shot.orderIndex, camera: shot.camera ?? {}, requiredAssetIds: shot.requiredAssetIds ?? [], metadata: shot.metadata ?? {} }; }
export async function snapshotLogicalShots(snapshot: unknown): Promise<LogicalRecipeShot[]> {
  const sequences = object(snapshot).sequences; if (!Array.isArray(sequences) || sequences.length > 200) throw new Error('Bounded canonical sequences are required.');
  const result: LogicalRecipeShot[] = []; const unique = (rows: unknown[]) => { const values = rows.map(value => object(value).orderIndex); if (values.some(value => typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 10000) || new Set(values).size !== values.length) throw new Error('Logical shot addresses require unique bounded order indices.'); };
  unique(sequences);
  for (const rawSequence of sequences) { const sequence = object(rawSequence); const scenes = sequence.scenes; if (!Array.isArray(scenes) || scenes.length > 200) throw new Error('Bounded canonical scenes are required.'); unique(scenes);
    for (const rawScene of scenes) { const scene = object(rawScene); const shots = scene.shots; if (!Array.isArray(shots) || shots.length > 200) throw new Error('Bounded canonical shots are required.'); unique(shots);
      for (const rawShot of shots) { const shot = object(rawShot); if (result.length >= 200) throw new Error('Recipe plan exceeds 200 canonical shots.'); const sequenceOrderIndex = sequence.orderIndex as number, sceneOrderIndex = scene.orderIndex as number, shotOrderIndex = shot.orderIndex as number; result.push({ key: logicalShotKey(sequenceOrderIndex, sceneOrderIndex, shotOrderIndex), sequenceOrderIndex, sceneOrderIndex, shotOrderIndex, descriptorHash: await recipeHash(canonicalShotDescriptor(shot)) }); }
    }
  }
  return result;
}
export async function bindRecipeProposal(input: unknown, saved: { sourceDraftHash: string; logicalShots: LogicalRecipeShot[] }, approved: { binding: RecipeBinding; snapshot: unknown; materializedShots: MaterializedRecipeShot[] }): Promise<RecipeDocument> {
  const proposal = parseRecipeProposal(input);
  if (await recipeHash(approved.snapshot) !== saved.sourceDraftHash || approved.binding.snapshotHash !== saved.sourceDraftHash) throw new Error('The approved production differs from the captured draft recipe. Create a revised proposal.');
  const snapshots = await snapshotLogicalShots(approved.snapshot); const savedByKey = new Map(saved.logicalShots.map(row => [row.key, row]));
  if (savedByKey.size !== saved.logicalShots.length) throw new Error('Logical shot proofs must be unique.');
  const steps = proposal.steps.map(step => {
    if (step.operation !== 'GENERATION') return step;
    const proof = savedByKey.get(step.logicalShotKey); const frozen = snapshots.find(row => row.key === step.logicalShotKey);
    const actual = approved.materializedShots.filter(row => row.sequenceOrderIndex === proof?.sequenceOrderIndex && row.sceneOrderIndex === proof.sceneOrderIndex && row.shotOrderIndex === proof.shotOrderIndex);
    if (!proof || !frozen || proof.descriptorHash !== frozen.descriptorHash || actual.length !== 1 || actual[0].descriptorHash !== proof.descriptorHash) throw new Error('Canonical shot binding is missing, ambiguous or changed.');
    const { logicalShotKey: _logicalKey, ...rest } = step; void _logicalKey; return { ...rest, shotId: actual[0].shotId };
  });
  const dialogueTracks=proposal.dialogueTracks?.map(track=>{const visual=proposal.steps.find(step=>step.operation==='GENERATION'&&step.logicalShotKey===track.logicalShotKey);const bound=visual?steps.find(step=>step.key===visual.key):undefined;if(!bound||bound.operation!=='GENERATION')throw new Error('Dialogue needs its exact visual shot.');return {stepKey:track.stepKey,shotId:bound.shotId,segmentIndex:track.segmentIndex};});
  return parseRecipeDocument({ ...proposal, kind: 'finalframe.recipe', binding: approved.binding, steps,...(dialogueTracks?{dialogueTracks}:{}) });
}
