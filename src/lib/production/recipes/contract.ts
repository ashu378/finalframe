/** A recipe is an authored proposal, never proof of authorization or approval.
 * The future server resolver must build Context from canonical records again
 * at each effect. This package performs no IO and starts no work. */
export const RECIPE_VIDEO_TYPES = ['ANIMATED_COMEDY_2D', 'REALISTIC_SKIT_UGC', 'PRODUCT_SAAS_LAUNCH', 'MOTION_GRAPHICS', 'EXPLAINER_STORY', 'CINEMATIC_FILM', 'MUSIC_VIDEO', 'SOCIAL_CUTDOWN'] as const;
export type RecipeVideoType = typeof RECIPE_VIDEO_TYPES[number];
export const RECIPE_LIMITS = { maxSteps: 64, maxNodes: 192, maxAssets: 200, maxBytes: 128 * 1024, maxSeconds: 60 } as const;
export interface RecipeBinding { projectId: string; productionId: string; productionVersionId: string; snapshotHash: string; continuityBibleId?: string; continuityHash?: string }
export type RecipeInput = { assetId: string } | { stepKey: string };
interface Step { key: string }
export type RecipeStep =
  | Step & { operation: 'PREPARATION'; kind: 'CHARACTER_REFERENCE' | 'TRANSCRIPT'; text: string; sourceAssetId?: string; sourceStepKey?: string }
  | Step & { operation: 'NARRATION' } & ({ mode: 'GENERATE'; text: string; voiceId: string; voiceVersionId?: string; primaryVoiceSampleAssetId?: string } | { mode: 'RECORDING'; sourceAssetId: string; startFrame: number; durationFrames: number })
  | Step & { operation: 'GENERATION'; shotId: string; references: RecipeInput[] }
  | Step & { operation: 'GRAPHIC'; templateId: 'kinetic-title' | 'brand-card' | 'feature-callout' | 'end-card'; durationFrames: number; title: string; subtitle: string; brandName: string; eyebrow?:string; feature?:string; detail?:string; index?:string; callToAction?:string; url?:string; accentColor?:string; backgroundColor?:string; textColor?:string; logoAssetId?: string }
  | Step & { operation: 'SOURCE_RANGE'; sourceAssetId: string; startFrame: number; durationFrames: number; audioPolicy: 'KEEP_SOURCE' | 'MUTE'; fit?: 'contain' | 'cover' }
  | Step & { operation: 'MUSIC_ANALYSIS'; sourceAssetId: string; trimStartFrame: number; durationFrames: number }
  | Step & { operation: 'CAPTIONS'; transcriptStepKey: string; language: string };
export interface RecipeDialogueTrack { stepKey: string; shotId: string; segmentIndex: number }
export interface RecipeDocument { kind: 'finalframe.recipe'; version: 1; videoType: RecipeVideoType; binding: RecipeBinding; fps: 24 | 25 | 30 | 50 | 60; steps: RecipeStep[]; visualOrder: string[]; narrationStepKey?: string; dialogueTracks?: RecipeDialogueTrack[]; musicStepKey?: string; captionStepKey?: string }
export interface CanonicalRecipeAsset { id: string; projectId: string; storageId: string; checksum: string; byteSize: number; mimeType: string; state: 'APPROVED' | 'LOCKED' | 'DRAFT' | 'REVOKED'; rightsApproved: boolean; durationSeconds?: number }
export interface CanonicalRecipeShot { id: string; productionVersionId: string; prompt: string; durationFrames: number; referenceAssetIds: string[]; approvedRecipeReferenceSlots: string[]; nativeAudioPolicy?:string|null; dialogueSegments?: Array<{ speakerResourceVersionId: string; voiceVersionId: string; startSeconds: number; durationSeconds: number; text: string; delivery?: string }> }
export interface CanonicalRecipeVoice { id: string; voiceVersionId?: string; projectId: string; kind: 'STOCK' | 'CLONED' | 'RECORDED'; approved: boolean; consentCurrent: boolean; sampleAssetIds: string[] }
export interface RecipeQuote { requestHash: string; quoteId: string; model: string; catalogFingerprint: string; providerCeilingUsd: number; creditCeiling: number; checkedAt: number; expiresAt: number }
export interface ExistingRecipeNode { nodeId: string; requestHash: string; idempotencyKey: string; jobId: string; status: 'QUEUED' | 'RUNNING' | 'ACCEPTED' | 'COMPLETED' | 'FAILED' | 'RECONCILIATION_REQUIRED'; providerJobId?: string; resultId?: string }
export interface RecipeContext { binding: RecipeBinding; fps: RecipeDocument['fps']; productionVersionState: 'APPROVED' | 'DRAFT' | 'SUPERSEDED'; continuityApproved: boolean; assets: CanonicalRecipeAsset[]; shots: CanonicalRecipeShot[]; voices: CanonicalRecipeVoice[]; quotes: Record<string, RecipeQuote | undefined>; existingNodes?: ExistingRecipeNode[] }
export type RecipeNodeOperation = RecipeStep['operation'] | 'APPROVAL' | 'TIMELINE' | 'MANIFEST' | 'EXPORT';
export interface CompiledRecipeNode { id: string; operation: RecipeNodeOperation; dependencies: string[]; request: Record<string, unknown>; requestHash: string; idempotencyKey: string; effect: 'PAID' | 'LOCAL' | 'HUMAN'; approvalTarget?: 'ASSET' | 'TRANSCRIPT' | 'TAKE' | 'BEAT_MAP' | 'CAPTION_PLAN' | 'TIMELINE'; quote?: RecipeQuote; existing?: ExistingRecipeNode }
export interface CompiledRecipe { kind: 'finalframe.recipe-plan'; version: 1; recipeHash: string; binding: RecipeBinding; videoType: RecipeVideoType; fps: number; durationFrames: number; nodes: CompiledRecipeNode[]; estimate: { complete: boolean; providerCeilingUsd: number | null; creditCeiling: number | null; blockedNodeIds: string[]; expiresAt: number | null }; activation: 'EXPLICIT_OPT_IN_AFTER_ESTIMATE'; legacyCompatibility: 'APPROVED_PLANS_REMAIN_MANUAL' }
