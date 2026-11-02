import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireProjectAccess, requireProjectRole } from "./authorization";
import { ensureResourceState, requireEditable } from "./resourceStates";
import { PREPARATION_MODELS } from "../src/lib/ai/model-registry";

const voiceKind = v.union(v.literal("CLONED"), v.literal("STOCK"), v.literal("RECORDED"));
const voiceStatus = v.union(
  v.literal("DRAFT"), v.literal("CONSENT_REQUIRED"), v.literal("QUEUED"), v.literal("TRAINING"),
  v.literal("READY"), v.literal("FAILED"), v.literal("REVOKING"), v.literal("REVOKED"), v.literal("DELETED"),
);
const consentUse = v.union(v.literal("TRAIN"), v.literal("SYNTHESIZE"), v.literal("AVATAR_LIPSYNC"));
const idempotencyKey = v.string();
type VoiceStatus = "DRAFT" | "CONSENT_REQUIRED" | "QUEUED" | "TRAINING" | "READY" | "FAILED" | "REVOKING" | "REVOKED" | "DELETED";

function cleanText(value: string | undefined, label: string, maxLength: number) {
  if (value === undefined) return undefined;
  const text = value.trim();
  if (text.length > maxLength) throw new Error(`${label} is too long.`);
  return text || undefined;
}

function requireIdempotencyKey(value: string) {
  const key = value.trim();
  if (!key || key.length > 200) throw new Error("A valid idempotency key is required.");
  return key;
}

function publicVoice(voice: Doc<"voices">, includePrivateProjectFields: boolean) {
  return {
    _id: voice._id,
    projectId: voice.projectId,
    productionId: voice.productionId,
    characterId: voice.characterId,
    kind: voice.kind,
    name: voice.name,
    description: voice.description,
    language: voice.language,
    status: voice.status,
    hasConsent: Boolean(voice.currentConsentId) && voice.status !== "REVOKED",
    sampleAssetIds: includePrivateProjectFields ? voice.sampleAssetIds : undefined,
    previewAssetId: includePrivateProjectFields ? voice.previewAssetId : undefined,
    originVoiceId: includePrivateProjectFields ? voice.originVoiceId : undefined,
    createdByUserId: voice.createdByUserId,
    createdAt: voice.createdAt,
    updatedAt: voice.updatedAt,
  };
}

async function requireProjectProduction(
  ctx: Parameters<typeof requireProjectRole>[0],
  projectId: Id<"projects">,
  productionId: Id<"productions">,
) {
  const production = await ctx.db.get(productionId);
  if (!production || production.projectId !== projectId) throw new Error("Production does not belong to this project.");
  return production;
}

async function requireProjectProofAsset(
  ctx: Parameters<typeof requireProjectRole>[0],
  projectId: Id<"projects">,
  assetId: Id<"assets">,
) {
  const asset = await ctx.db.get(assetId);
  if (!asset || asset.deletedAt || asset.scope !== "PROJECT" || asset.projectId !== projectId) {
    throw new Error("Consent evidence must be an active asset owned by this project.");
  }
  return asset;
}

/** Create a project-owned voice profile. This foundation never calls a provider. */
export const create = mutation({
  args: {
    projectId: v.id("projects"),
    productionId: v.optional(v.id("productions")),
    characterId: v.optional(v.id("characters")),
    kind: voiceKind,
    name: v.string(),
    description: v.optional(v.string()),
    language: v.optional(v.string()),
    idempotencyKey,
  },
  returns: v.object({ voiceId: v.id("voices"), status: voiceStatus, replayed: v.boolean() }),
  handler: async (ctx, args) => {
    const access = await requireProjectRole(ctx, args.projectId, ["OWNER", "EDITOR"]);
    const name = cleanText(args.name, "Voice name", 160);
    if (!name) throw new Error("Voice name is required.");
    const description = cleanText(args.description, "Voice description", 4_000);
    const language = cleanText(args.language, "Language", 80);
    const key = requireIdempotencyKey(args.idempotencyKey);

    if (args.productionId) await requireProjectProduction(ctx, args.projectId, args.productionId);
    if (args.characterId) {
      if (!args.productionId) throw new Error("A character-bound voice must belong to a production.");
      const character = await ctx.db.get(args.characterId);
      if (!character || character.productionId !== args.productionId) throw new Error("Character does not belong to this production.");
    }

    const existing = await ctx.db.query("voices").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", key)).unique();
    if (existing) {
      if (existing.projectId !== args.projectId || existing.createdByUserId !== access.user._id || existing.kind !== args.kind || existing.name !== name || existing.description !== description || existing.language !== language || existing.productionId !== args.productionId || existing.characterId !== args.characterId) {
        throw new Error("Idempotency key is already in use for a different voice profile.");
      }
      return { voiceId: existing._id, status: existing.status, replayed: true };
    }

    const timestamp = Date.now();
    const voiceId = await ctx.db.insert("voices", {
      studioExternalId: access.project.studioExternalId,
      studioId: access.project.studioId,
      projectId: args.projectId,
      productionId: args.productionId,
      characterId: args.characterId,
      kind: args.kind,
      name,
      description,
      language,
      status: args.kind === "CLONED" ? "CONSENT_REQUIRED" : "DRAFT",
      sampleAssetIds: [],
      createdByUserId: access.user._id,
      idempotencyKey: key,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await ensureResourceState(ctx, {
      projectId: args.projectId,
      productionId: args.productionId,
      resourceType: "voice",
      resourceId: voiceId.toString(),
    });
    return { voiceId, status: args.kind === "CLONED" ? "CONSENT_REQUIRED" as const : "DRAFT" as const, replayed: false };
  },
});

/** List only bounded, project-scoped public voice fields; provider identifiers stay server-side. */
export const list = query({
  args: { projectId: v.id("projects"), status: v.optional(voiceStatus), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const access = await requireProjectAccess(ctx, args.projectId);
    const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 50)));
    const rows = args.status
      ? await ctx.db.query("voices").withIndex("by_project_status", (q) => q.eq("projectId", args.projectId).eq("status", args.status!)).order("desc").take(limit)
      : await ctx.db.query("voices").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).order("desc").take(limit);
    const includePrivateProjectFields = access.projectRole === "OWNER" || access.projectRole === "EDITOR";
    return rows.filter((voice) => !voice.deletedAt).map((voice) => publicVoice(voice, includePrivateProjectFields));
  },
});

/** Return one voice summary after project authorization, excluding all provider metadata. */
export const get = query({
  args: { projectId: v.id("projects"), voiceId: v.id("voices") },
  handler: async (ctx, args) => {
    const access = await requireProjectAccess(ctx, args.projectId);
    const voice = await ctx.db.get(args.voiceId);
    if (!voice || voice.projectId !== args.projectId || voice.deletedAt) throw new Error("Voice not found.");
    return publicVoice(voice, access.projectRole === "OWNER" || access.projectRole === "EDITOR");
  },
});

/** Record explicit, versioned consent. Authorized-speaker consent requires project-owned evidence. */
export const grantConsent = mutation({
  args: {
    projectId: v.id("projects"),
    voiceId: v.id("voices"),
    subjectType: v.union(v.literal("SELF"), v.literal("AUTHORIZED_SPEAKER")),
    subjectDisplayName: v.optional(v.string()),
    consentVersion: v.string(),
    permittedUses: v.array(consentUse),
    proofAssetId: v.optional(v.id("assets")),
    consentConfirmed: v.boolean(),
    thirdPartyDisclosureAccepted: v.boolean(),
    idempotencyKey,
  },
  returns: v.object({ consentId: v.id("voiceConsents"), voiceId: v.id("voices"), status: voiceStatus, replayed: v.boolean() }),
  handler: async (ctx, args) => {
    const access = await requireProjectRole(ctx, args.projectId, ["OWNER", "EDITOR"]);
    if (!args.consentConfirmed) throw new Error("Explicit voice consent is required.");
    if (!args.thirdPartyDisclosureAccepted) throw new Error("The third-party processing disclosure must be accepted.");
    const voice = await ctx.db.get(args.voiceId);
    if (!voice || voice.projectId !== args.projectId || voice.deletedAt) throw new Error("Voice not found.");
    if (voice.kind !== "CLONED") throw new Error("Consent-based cloning applies only to cloned voices.");
    if (voice.status === "REVOKED" || voice.revokedAt) throw new Error("Revoked voice consent cannot be reused; create a new voice profile.");
    const key = requireIdempotencyKey(args.idempotencyKey);
    const existing = await ctx.db.query("voiceConsents").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", key)).unique();
    if (existing) {
      const sameUses = existing.permittedUses.length === args.permittedUses.length && existing.permittedUses.every((use) => args.permittedUses.includes(use));
      if (existing.projectId !== args.projectId || existing.voiceId !== voice._id || existing.grantedByUserId !== access.user._id || existing.subjectType !== args.subjectType || existing.consentVersion !== args.consentVersion.trim() || !sameUses) {
        throw new Error("Idempotency key is already in use for different consent.");
      }
      return { consentId: existing._id, voiceId: voice._id, status: voice.status as VoiceStatus, replayed: true };
    }
    if (voice.currentConsentId) throw new Error("This voice already has active consent.");

    const uses = new Set(args.permittedUses);
    if (!uses.has("TRAIN") || !uses.has("SYNTHESIZE")) throw new Error("Consent must explicitly cover voice training and synthesis.");
    if (args.permittedUses.length !== uses.size) throw new Error("Consent uses must not contain duplicates.");
    const consentVersion = cleanText(args.consentVersion, "Consent version", 100);
    if (!consentVersion) throw new Error("A consent text version is required.");
    const subjectDisplayName = cleanText(args.subjectDisplayName, "Speaker name", 160);
    let proofAsset: Doc<"assets"> | undefined;
    if (args.subjectType === "SELF") {
      if (args.proofAssetId) proofAsset = await requireProjectProofAsset(ctx, args.projectId, args.proofAssetId);
    } else {
      if (!subjectDisplayName || !args.proofAssetId) throw new Error("Authorized-speaker consent requires a speaker name and project-owned evidence.");
      proofAsset = await requireProjectProofAsset(ctx, args.projectId, args.proofAssetId);
    }

    const timestamp = Date.now();
    const consentId = await ctx.db.insert("voiceConsents", {
      projectId: args.projectId,
      voiceId: voice._id,
      subjectType: args.subjectType,
      subjectUserId: args.subjectType === "SELF" ? access.user._id : undefined,
      subjectDisplayName,
      grantedByUserId: access.user._id,
      consentVersion,
      permittedUses: args.permittedUses,
      projectScope: "PROJECT",
      grantedAt: timestamp,
      proofAssetId: proofAsset?._id,
      proofChecksum: proofAsset?.checksum,
      thirdPartyDisclosureAcceptedAt: timestamp,
      idempotencyKey: key,
    });
    await ctx.db.insert("voiceConsentEvents", {
      projectId: args.projectId,
      voiceId: voice._id,
      consentId,
      event: "GRANTED",
      actorUserId: access.user._id,
      idempotencyKey: `grant:${key}`,
      createdAt: timestamp,
    });
    const status = (voice.status === "CONSENT_REQUIRED" ? (voice.sampleAssetIds.length ? "READY" : "DRAFT") : voice.status) as VoiceStatus;
    await ctx.db.patch(voice._id, { currentConsentId: consentId, status, updatedAt: timestamp });
    return { consentId, voiceId: voice._id, status, replayed: false };
  },
});

/** Revoke future use and preserve the original consent as an immutable record. */
export const revokeConsent = mutation({
  args: {
    projectId: v.id("projects"),
    voiceId: v.id("voices"),
    reason: v.string(),
    idempotencyKey,
  },
  returns: v.object({ voiceId: v.id("voices"), status: voiceStatus, replayed: v.boolean() }),
  handler: async (ctx, args) => {
    const access = await requireProjectRole(ctx, args.projectId, ["OWNER", "EDITOR"]);
    const reason = cleanText(args.reason, "Revocation reason", 2_000);
    if (!reason) throw new Error("A reason is required to revoke voice consent.");
    const key = requireIdempotencyKey(args.idempotencyKey);
    const voice = await ctx.db.get(args.voiceId);
    if (!voice || voice.projectId !== args.projectId || voice.deletedAt) throw new Error("Voice not found.");
    const priorEvent = await ctx.db.query("voiceConsentEvents").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", key)).unique();
    if (priorEvent) {
      if (priorEvent.projectId !== args.projectId || priorEvent.voiceId !== voice._id || priorEvent.event !== "REVOKED") {
        throw new Error("Idempotency key is already in use for a different consent event.");
      }
      return { voiceId: voice._id, status: voice.status as VoiceStatus, replayed: true };
    }
    if (voice.status === "REVOKED") throw new Error("Voice consent has already been revoked.");
    if (!voice.currentConsentId) throw new Error("This voice has no active consent to revoke.");

    const timestamp = Date.now();
    await ctx.db.insert("voiceConsentEvents", {
      projectId: args.projectId,
      voiceId: voice._id,
      consentId: voice.currentConsentId,
      event: "REVOKED",
      actorUserId: access.user._id,
      reason,
      idempotencyKey: key,
      createdAt: timestamp,
    });
    await ctx.db.patch(voice._id, { status: "REVOKED", revokedAt: timestamp, updatedAt: timestamp });
    return { voiceId: voice._id, status: "REVOKED" as const, replayed: false };
  },
});


/** Attach an uploaded recording without training or calling a paid provider.
 * Reference cloning sends approved samples per synthesis request; it never
 * invents a persistent provider enrollment identifier. */
export const attachSample = mutation({
  args: { projectId: v.id("projects"), voiceId: v.id("voices"), assetId: v.id("assets") },
  returns: v.object({ voiceId: v.id("voices"), status: voiceStatus, sampleCount: v.number() }),
  handler: async (ctx, args) => {
    await requireEditable(ctx, args.projectId, "voice", args.voiceId.toString());
    const voice = await ctx.db.get(args.voiceId);
    if (!voice || voice.projectId !== args.projectId || voice.deletedAt) throw new Error("Voice not found.");
    if (voice.revokedAt || voice.status === "REVOKED") throw new Error("Revoked voices cannot receive new samples.");
    if (voice.kind === "STOCK") throw new Error("Stock voices do not accept reference recordings.");
    const asset = await requireProjectProofAsset(ctx, args.projectId, args.assetId);
    if (!asset.storageId || !asset.mimeType?.startsWith("audio/")) throw new Error("A project-owned uploaded audio asset is required.");
    const stored = await ctx.db.system.get("_storage", asset.storageId);
    if (!stored || !stored.contentType?.startsWith("audio/") || stored.size < 1 || stored.size > 15 * 1024 * 1024) throw new Error("Reference audio must be a non-empty recording no larger than 15 MiB.");
    const sampleAssetIds = Array.from(new Set([...voice.sampleAssetIds, asset._id]));
    if (sampleAssetIds.length > 3) throw new Error("A voice can have at most three reference recordings.");
    const status: VoiceStatus = voice.kind === "RECORDED" || voice.currentConsentId ? "READY" : "CONSENT_REQUIRED";
    await ctx.db.patch(voice._id, { sampleAssetIds, status, updatedAt: Date.now() });
    return { voiceId: voice._id, status, sampleCount: sampleAssetIds.length };
  },
});

/** Internal-only resolution. The authenticated job creator owns authorization;
 * this rechecks project, immutable consent, sample ownership, and approval at
 * execution time, so consent revocation also blocks already-queued work. */
/** Approval cannot make a missing recording, expired consent or unconfigured
 * provider ready. Rechecked independently of the approval state itself. */
export async function validateVoiceForApproval(ctx: QueryCtx | MutationCtx, projectId: Id<"projects">, voiceId: Id<"voices">) {
  const voice = await ctx.db.get(voiceId);
  if (!voice || voice.projectId !== projectId || voice.deletedAt || voice.revokedAt || voice.status !== "READY") throw new Error("Voice must have ready recordings and current consent before approval.");
  if (voice.kind === "STOCK") {
    if (voice.provider !== "openrouter" || !voice.providerVoiceId || (voice.settingsSnapshot as { modelId?: string } | undefined)?.modelId !== PREPARATION_MODELS.narration.id) throw new Error("Select a verified stock voice for the configured narration model before approval.");
    return;
  }
  if (voice.kind === "CLONED") {
    const consent = voice.currentConsentId ? await ctx.db.get(voice.currentConsentId) : null;
    if (!consent || consent.projectId !== projectId || consent.voiceId !== voiceId || !consent.permittedUses.includes("SYNTHESIZE") || (consent.expiresAt !== undefined && consent.expiresAt <= Date.now())) throw new Error("Current synthesis consent is required before voice approval.");
  }
  if (!voice.sampleAssetIds.length || voice.sampleAssetIds.length > 3) throw new Error("Add project voice recordings before approval.");
  for (const id of voice.sampleAssetIds) {
    const asset = await ctx.db.get(id);
    if (!asset || asset.projectId !== projectId || asset.scope !== "PROJECT" || asset.deletedAt || !asset.storageId || !asset.mimeType?.startsWith("audio/")) throw new Error("Voice recordings must be active audio owned by this project.");
    const stored = await ctx.db.system.get("_storage", asset.storageId);
    if (!stored || stored.size < 1 || stored.size > 15 * 1024 * 1024 || !stored.contentType?.startsWith("audio/")) throw new Error("A voice recording is unavailable or exceeds the upload limit.");
  }
}

export async function resolveVoiceSynthesisInput(ctx: QueryCtx | MutationCtx, args: {
  projectId: Id<"projects">; voiceId: Id<"voices">; use: "SYNTHESIZE" | "AVATAR_LIPSYNC";
}) {
  const [project, voice] = await Promise.all([ctx.db.get(args.projectId), ctx.db.get(args.voiceId)]);
  if (!project || project.deletedAt || !voice || voice.projectId !== project._id || voice.deletedAt || voice.revokedAt || voice.status !== "READY") throw new Error("VOICE_NOT_READY");
  const state = await ctx.db.query("resourceStates").withIndex("by_project_resource", (q) => q.eq("projectId", project._id).eq("resourceType", "voice").eq("resourceId", voice._id.toString())).unique();
  if (!state || (state.state !== "APPROVED" && state.state !== "LOCKED")) throw new Error("VOICE_APPROVAL_REQUIRED");
  if (voice.kind === "STOCK") {
    if (voice.provider !== "openrouter" || !voice.providerVoiceId || (voice.settingsSnapshot as { modelId?: string } | undefined)?.modelId !== PREPARATION_MODELS.narration.id) throw new Error("VOICE_PROVIDER_REQUIRED");
    return { projectId: project._id, voiceId: voice._id, mode: "STOCK" as const, provider: voice.provider, providerVoiceId: voice.providerVoiceId, references: [], consentId: undefined };
  }
  let consentId: Id<"voiceConsents"> | undefined;
  if (voice.kind === "CLONED") {
    const consent = voice.currentConsentId ? await ctx.db.get(voice.currentConsentId) : null;
    if (!consent || consent.projectId !== project._id || consent.voiceId !== voice._id || !consent.permittedUses.includes(args.use) || (consent.expiresAt !== undefined && consent.expiresAt <= Date.now())) throw new Error("VOICE_CONSENT_REQUIRED");
    consentId = consent._id;
  }
  if (voice.sampleAssetIds.length < 1 || voice.sampleAssetIds.length > 3) throw new Error("VOICE_SAMPLE_REQUIRED");
  const references = [];
  for (const assetId of voice.sampleAssetIds) {
    const asset = await ctx.db.get(assetId);
    if (!asset || asset.projectId !== project._id || asset.scope !== "PROJECT" || asset.deletedAt || !asset.storageId || !asset.mimeType?.startsWith("audio/")) throw new Error("VOICE_SAMPLE_UNAVAILABLE");
    const metadata = await ctx.db.system.get("_storage", asset.storageId);
    if (!metadata || metadata.size < 1 || metadata.size > 15 * 1024 * 1024 || !metadata.contentType?.startsWith("audio/")) throw new Error("VOICE_SAMPLE_UNAVAILABLE");
    const url = await ctx.storage.getUrl(asset.storageId);
    if (!url) throw new Error("VOICE_SAMPLE_UNAVAILABLE");
    references.push({ assetId: asset._id, url, format: asset.mimeType.split("/")[1] });
  }
  return { projectId: project._id, voiceId: voice._id, mode: voice.kind === "RECORDED" ? "RECORDED" as const : "REFERENCE_CLONE" as const, references, consentId, provider: undefined, providerVoiceId: undefined };
}

export const resolveForSynthesis = internalQuery({
  args: { projectId: v.id("projects"), voiceId: v.id("voices"), use: v.union(v.literal("SYNTHESIZE"), v.literal("AVATAR_LIPSYNC")) },
  returns: v.any(),
  handler: resolveVoiceSynthesisInput,
});

/** UI-safe availability: never return signed sample URLs or provider IDs. */
export const readiness = query({
  args: { projectId: v.id("projects"), voiceId: v.id("voices"), use: v.optional(v.union(v.literal("SYNTHESIZE"), v.literal("AVATAR_LIPSYNC"))) },
  returns: v.object({ ready: v.boolean(), reason: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    try {
      await resolveVoiceSynthesisInput(ctx, { ...args, use: args.use ?? "SYNTHESIZE" });
      return { ready: true };
    } catch {
      return { ready: false, reason: "Approve the voice, add project-owned recordings, and confirm current consent before use." };
    }
  },
});


/** Authorization check before a no-cost catalog fetch. No provider secrets or
 * profile bindings are returned to the browser. */
export const stockBindingContext = internalQuery({
  args: { projectId: v.id("projects"), write: v.boolean() }, returns: v.null(),
  handler: async (ctx, args) => {
    if (args.write) await requireProjectRole(ctx, args.projectId, ["OWNER", "EDITOR"]);
    else await requireProjectAccess(ctx, args.projectId);
    return null;
  },
});

/** Called only by the server action after resolving an opaque selection
 * against the current public catalog. Ordinary users cannot supply arbitrary
 * provider IDs to a public mutation. Stock binding does not approve the voice. */
export const bindStockSelection = internalMutation({
  args: { projectId: v.id("projects"), voiceId: v.optional(v.id("voices")), name: v.string(), selectionKey: v.string(), providerVoiceId: v.string(), modelId: v.string(), fingerprint: v.string(), checkedAt: v.number(), idempotencyKey: v.string() },
  returns: v.object({ voiceId: v.id("voices"), status: voiceStatus, replayed: v.boolean() }),
  handler: async (ctx, args) => {
    const access = await requireProjectRole(ctx, args.projectId, ["OWNER", "EDITOR"]);
    const name = cleanText(args.name, "Voice name", 160); const key = requireIdempotencyKey(args.idempotencyKey);
    if (!name || args.modelId !== PREPARATION_MODELS.narration.id || !/^[A-Za-z0-9_.:-]{1,200}$/.test(args.providerVoiceId) || !/^[a-f0-9]{64}$/.test(args.selectionKey) || !/^[a-f0-9]{64}$/.test(args.fingerprint) || !Number.isFinite(args.checkedAt) || args.checkedAt > Date.now() + 30_000 || Date.now() - args.checkedAt > 5 * 60_000) throw new Error("A current verified stock voice selection is required.");
    const existing = args.voiceId ? await ctx.db.get(args.voiceId) : await ctx.db.query("voices").withIndex("by_idempotency", q => q.eq("idempotencyKey", key)).unique();
    if (existing) {
      if (existing.projectId !== args.projectId || existing.deletedAt || existing.kind !== "STOCK") throw new Error("Stock voice does not belong to this project.");
      if (existing.revokedAt || existing.status === "REVOKED") throw new Error("Revoked voices cannot be rebound.");
      if (!args.voiceId) {
        if (existing.createdByUserId !== access.user._id || existing.name !== name || existing.provider !== "openrouter" || existing.providerVoiceId !== args.providerVoiceId) throw new Error("Idempotency key is already in use for another stock selection.");
        return { voiceId: existing._id, status: existing.status, replayed: true };
      }
      await requireEditable(ctx, args.projectId, "voice", existing._id.toString());
    }
    const timestamp = Date.now();
    const fields = { name, provider: "openrouter", providerVoiceId: args.providerVoiceId, status: "READY" as const, settingsSnapshot: { modelId: args.modelId, selectionKey: args.selectionKey }, providerMetadata: { catalogFingerprint: args.fingerprint, verifiedAt: args.checkedAt }, updatedAt: timestamp };
    const voiceId = existing ? existing._id : await ctx.db.insert("voices", { studioExternalId: access.project.studioExternalId, studioId: access.project.studioId, projectId: args.projectId, kind: "STOCK", sampleAssetIds: [], createdByUserId: access.user._id, idempotencyKey: key, createdAt: timestamp, ...fields });
    if (existing) await ctx.db.patch(existing._id, fields);
    await ensureResourceState(ctx, { projectId: args.projectId, resourceType: "voice", resourceId: voiceId.toString() });
    await ctx.db.insert("audit", { studioExternalId: access.project.studioExternalId, studioId: access.project.studioId, actorUserId: access.user._id, action: "STOCK_VOICE_SELECTED", entityType: "voice", entityId: voiceId.toString(), metadata: { projectId: args.projectId, selectionKey: args.selectionKey, catalogFingerprint: args.fingerprint, noProviderGeneration: true }, createdAt: timestamp });
    return { voiceId, status: "READY" as const, replayed: false };
  },
});
