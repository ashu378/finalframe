import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireMember, requireMemberById } from "./authorization";

export type ReadCtx = QueryCtx | MutationCtx;
export type StudioId = Id<"studios">;
export type UserId = Id<"users">;

/**
 * The workflow vocabulary is shared by Convex functions and adapters. These
 * are intentionally independent of provider/model names so a preset can be
 * implemented by different capabilities over time.
 */
export type WorkflowPreset =
  | "NIGERIAN_CARTOON_COMEDY"
  | "REALISTIC_AI_SKIT"
  | "VOICEOVER_STORY"
  | "AI_PRODUCT_AD"
  | "FACELESS_EXPLAINER"
  | "SHORT_FILM";

export type InputMode =
  | "IDEA"
  | "SCRIPT"
  | "VOICE"
  | "CAST_REFERENCES"
  | "FOOTAGE"
  | "AD_BRIEF"
  | "MIXED_MEDIA";

export type WorkflowStage =
  | "BRIEF"
  | "PERFORMANCE"
  | "PLAN"
  | "BIBLE"
  | "SHOTS"
  | "MAKE"
  | "FINISH"
  | "REVIEW"
  | "EXPORT";

export type QualityGateStatus =
  | "NOT_RUN"
  | "PASS"
  | "PASS_WITH_WARNINGS"
  | "BLOCKED"
  | "REQUIRES_HUMAN_REVIEW";

export type QualityGateEvidence = {
  rule: string;
  result: "PASS" | "WARN" | "FAIL";
  explanation: string;
};

export type QualityGateResult = {
  status: QualityGateStatus;
  continuityScore?: number;
  audioAlignmentScore?: number;
  captionAccuracyScore?: number;
  evidence: QualityGateEvidence[];
};

export type CreateIntent = {
  preset: WorkflowPreset;
  inputMode: InputMode;
  brief?: string;
  script?: string;
  inputAssetIds: Id<"assets">[];
  language: string;
  platform: string;
  aspectRatio: string;
  durationSeconds: number;
  qualityTier: "ECONOMY" | "STANDARD" | "PREMIUM";
};

export type SpeakerSegment = {
  id: string;
  speakerLabel: string;
  characterId?: Id<"characters">;
  startSeconds: number;
  endSeconds: number;
  text: string;
  confidence?: number;
  reviewed: boolean;
};

export type AnchorPack = {
  productionVersionId: Id<"productionVersions">;
  characterAssetIds: Id<"assets">[];
  locationAssetIds: Id<"assets">[];
  styleAssetIds: Id<"assets">[];
  productAssetIds: Id<"assets">[];
  approvalStatus: "DRAFT" | "APPROVED" | "REJECTED";
  continuityRules: string[];
};

export type ShotSpec = {
  sequenceId: Id<"sequences">;
  sceneId: Id<"scenes">;
  orderIndex: number;
  purpose: string;
  durationSeconds: number;
  dialogueSegmentIds: Id<"speakerSegments">[];
  characterIds: Id<"characters">[];
  locationIds: Id<"locations">[];
  productIds: Id<"products">[];
  referencePackIds: Id<"referencePacks">[];
  camera: Record<string, unknown>;
  action: string;
  prompt: string;
  negativePrompt?: string;
  providerCapability: string;
};

/** Return the canonical studio record for a legacy external studio key. */
export async function getStudio(ctx: ReadCtx, studioExternalId: string) {
  return await ctx.db
    .query("studios")
    .withIndex("by_external_id", (q) => q.eq("externalId", studioExternalId))
    .unique();
}

/**
 * Require access to a studio. The external key is only a resource selector;
 * authorization is derived from the verified Convex session in
 * `requireMember`. The legacy third argument is accepted for source
 * compatibility but is deliberately ignored.
 */
export async function requireStudio(
  ctx: ReadCtx,
  studioExternalId: string,
  _legacyOwnerExternalId?: string,
) {
  return (await requireMember(ctx, studioExternalId)).studio;
}

/** Resolve a studio by its internal Convex ID. */
export async function requireStudioById(ctx: ReadCtx, studioId: StudioId) {
  return (await requireMemberById(ctx, studioId)).studio;
}

/**
 * Require an active member. The caller-supplied user key is retained only as
 * a deprecated call-site parameter and never participates in authorization.
 */
export async function requireStudioMember(
  ctx: ReadCtx,
  studioExternalId: string,
  _legacyUserExternalId?: string,
) {
  const member = await requireMember(ctx, studioExternalId);
  const membership = await ctx.db
    .query("members")
    .withIndex("by_studio_user", (q) => q.eq("studioId", member.studio._id).eq("userId", member.user._id))
    .unique();
  return { studio: member.studio, membership };
}

/** Require a member by canonical studio ID; userId is no longer trusted. */
export async function requireStudioMemberById(
  ctx: ReadCtx,
  studioId: StudioId,
  _legacyUserId?: UserId,
) {
  const member = await requireMemberById(ctx, studioId);
  const membership = await ctx.db
    .query("members")
    .withIndex("by_studio_user", (q) => q.eq("studioId", studioId).eq("userId", member.user._id))
    .unique();
  return { studio: member.studio, membership };
}

/** Fetch a production only after enforcing its studio ownership boundary. */
export async function getProduction(ctx: ReadCtx, productionId: string, _legacyOwnerExternalId?: string) {
  const production = await ctx.db.get(productionId as Id<"productions">);
  if (!production) {
    throw new Error("Production not found");
  }
  await requireStudio(ctx, production.studioExternalId);
  return production;
}

/** Type guard for records carrying normalized studio ownership keys. */
export type StudioOwnership =
  | { studioExternalId: string; studioId?: StudioId }
  | { studioExternalId?: string; studioId: StudioId };

export function hasStudioOwnership(record: { studioExternalId?: string; studioId?: StudioId }): record is StudioOwnership {
  return typeof record.studioExternalId === "string" || record.studioId !== undefined;
}

/** Keep timestamps consistent across mutations and append-only events. */
export function now() {
  return Date.now();
}

export type StudioOwnedRecord = Pick<Doc<"assets">, "studioExternalId" | "studioId">;
