import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const timestamp = v.number();
const json = v.any();

// Persisted application state is constrained to known lifecycle values.
const status = v.union(
  v.literal("DRAFT"), v.literal("PLANNING"), v.literal("READY"), v.literal("SUBMITTED"),
  v.literal("REQUESTED"), v.literal("CHANGES_REQUESTED"), v.literal("APPROVED"), v.literal("ACTIVE"),
  v.literal("IN_PROGRESS"), v.literal("REVIEW"), v.literal("QUEUED"), v.literal("PROCESSING"),
  v.literal("RETRYING"), v.literal("COMPLETED"), v.literal("FAILED"), v.literal("CANCELLED"),
  v.literal("CANCELED"), v.literal("ARCHIVED"), v.literal("DELETED"), v.literal("SUPERSEDED"),
  v.literal("PENDING"), v.literal("QUARANTINED"), v.literal("REFUNDED"), v.literal("RESERVED"),
  v.literal("COMMITTED"), v.literal("RELEASED"), v.literal("EXPIRED"), v.literal("CONVERTED"),
  v.literal("REJECTED"), v.literal("REVERSED"), v.literal("active"), v.literal("disabled"),
  v.literal("invited"), v.literal("suspended"), v.literal("removed"), v.literal("healthy"),
  v.literal("degraded"), v.literal("unhealthy"),
);

// Keep the legacy external key during migration while making studio ownership
// explicit on every private canonical record.
const studioOwned = {
  studioExternalId: v.string(),
  studioId: v.optional(v.id("studios")),
};

export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()), image: v.optional(v.string()), email: v.optional(v.string()),
    emailVerificationTime: v.optional(timestamp), phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(timestamp), isAnonymous: v.optional(v.boolean()),
    externalId: v.optional(v.string()), authSubject: v.optional(v.string()),
    status: v.optional(status), metadata: v.optional(json), createdAt: v.optional(timestamp),
    updatedAt: v.optional(timestamp),
  }).index("by_external_id", ["externalId"]).index("by_auth_subject", ["authSubject"]).index("by_email", ["email"]).index("email", ["email"]),

  studios: defineTable({
    externalId: v.string(), ownerExternalId: v.string(), ownerId: v.optional(v.id("users")), ownerUserId: v.optional(v.id("users")),
    name: v.string(), credits: v.number(), status: v.optional(status), metadata: v.optional(json),
    createdAt: timestamp, updatedAt: timestamp,
  }).index("by_external_id", ["externalId"]).index("by_owner", ["ownerExternalId"]).index("by_owner_id", ["ownerId"]).index("by_owner_user", ["ownerUserId"]),

  studioMembers: defineTable({
    studioExternalId: v.string(), studioId: v.optional(v.id("studios")), userExternalId: v.string(),
    userId: v.optional(v.id("users")),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
    status: v.union(v.literal("active"), v.literal("invited"), v.literal("suspended")),
    invitedByExternalId: v.optional(v.string()), invitedAt: v.optional(timestamp), joinedAt: v.optional(timestamp),
    createdAt: timestamp, updatedAt: timestamp,
  }).index("by_studio", ["studioExternalId"]).index("by_studio_id", ["studioId"])
    .index("by_user", ["userExternalId"]).index("by_user_id", ["userId"])
    .index("by_studio_user", ["studioExternalId", "userExternalId"])
    .index("by_studio_user_id", ["studioId", "userId"]),

  // Temporary internal-ID membership name used by the authorization adapter.
  members: defineTable({
    studioId: v.id("studios"), userId: v.id("users"),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")), status: v.union(v.literal("active"), v.literal("invited"), v.literal("suspended"), v.literal("removed")),
    createdAt: v.optional(timestamp), updatedAt: v.optional(timestamp),
  }).index("by_studio_user", ["studioId", "userId"]).index("by_studio", ["studioId"]),

  projects: defineTable({
    externalId: v.string(), studioExternalId: v.string(), studioId: v.optional(v.id("studios")), name: v.string(),
    description: v.optional(v.string()), status: v.optional(status), metadata: v.optional(json),
    createdByExternalId: v.optional(v.string()), createdByUserId: v.optional(v.id("users")),
    createdAt: timestamp, updatedAt: timestamp,
  }).index("by_external_id", ["externalId"]).index("by_studio", ["studioExternalId"]).index("by_studio_id", ["studioId"]),

  productions: defineTable({
    externalProjectId: v.string(), projectId: v.optional(v.id("projects")), studioExternalId: v.string(),
    studioId: v.optional(v.id("studios")), workflow: v.string(), inputMode: v.string(),
    requestedDurationSeconds: v.number(), language: v.string(), outputPreset: v.string(), status,
    currentVersionId: v.optional(v.id("productionVersions")), currentPlanId: v.optional(v.id("directorPlans")),
    createdByExternalId: v.optional(v.string()), createdByUserId: v.optional(v.id("users")), metadata: v.optional(json),
    createdAt: timestamp, updatedAt: timestamp,
  }).index("by_project", ["externalProjectId"]).index("by_project_id", ["projectId"])
    .index("by_studio", ["studioExternalId"]).index("by_studio_id", ["studioId"]).index("by_status", ["status"]),

  createIntents: defineTable({
    ...studioOwned, projectId: v.optional(v.id("projects")), productionId: v.optional(v.id("productions")),
    createdByExternalId: v.optional(v.string()), createdByUserId: v.optional(v.id("users")), inputMode: v.string(),
    brief: v.string(), inputAssetIds: v.optional(v.array(v.id("assets"))), metadata: json, status,
    createdAt: timestamp, updatedAt: timestamp,
  }).index("by_studio", ["studioExternalId"]).index("by_studio_id", ["studioId"])
    .index("by_project", ["projectId"]).index("by_production", ["productionId"]).index("by_status", ["status"]),

  directorPlans: defineTable({
    // Optional while the existing approval mutation is migrated; ownership is
    // still enforced through the required production relation.
    studioExternalId: v.optional(v.string()), studioId: v.optional(v.id("studios")), productionId: v.id("productions"),
    versionNumber: v.optional(v.number()), input: json, plan: json, estimate: json, status,
    approval: v.optional(json), createdByExternalId: v.optional(v.string()), createdByUserId: v.optional(v.id("users")),
    createdAt: timestamp, updatedAt: v.optional(timestamp), approvedAt: v.optional(timestamp),
  }).index("by_production", ["productionId"]).index("by_studio", ["studioExternalId"]).index("by_status", ["status"]),

  productionBibles: defineTable({
    studioExternalId: v.optional(v.string()), studioId: v.optional(v.id("studios")), productionId: v.optional(v.id("productions")),
    productionVersionId: v.id("productionVersions"), versionNumber: v.optional(v.number()), projectContext: json,
    characters: json, locations: json, products: json, style: json, story: json, entities: v.optional(json), createdAt: v.optional(timestamp),
  }).index("by_version", ["productionVersionId"]).index("by_production", ["productionId"]).index("by_studio", ["studioExternalId"]),

  referencePacks: defineTable({
    ...studioOwned, projectId: v.optional(v.id("projects")), productionId: v.optional(v.id("productions")), name: v.string(),
    description: v.optional(v.string()), assetIds: v.array(v.id("assets")), purpose: v.optional(v.string()), metadata: v.optional(json),
    createdByUserId: v.optional(v.id("users")), createdAt: timestamp, updatedAt: v.optional(timestamp),
  }).index("by_studio", ["studioExternalId"]).index("by_studio_id", ["studioId"])
    .index("by_project", ["projectId"]).index("by_production", ["productionId"]),

  sequences: defineTable({
    studioExternalId: v.optional(v.string()), studioId: v.optional(v.id("studios")), productionId: v.optional(v.id("productions")),
    productionVersionId: v.id("productionVersions"), title: v.string(), description: v.string(), orderIndex: v.number(),
    status: v.optional(status), metadata: v.optional(json),
  }).index("by_version", ["productionVersionId"]).index("by_production", ["productionId"])
    .index("by_studio", ["studioExternalId"]).index("by_order", ["productionVersionId", "orderIndex"]),

  scenes: defineTable({
    studioExternalId: v.optional(v.string()), studioId: v.optional(v.id("studios")), productionId: v.optional(v.id("productions")),
    sequenceId: v.id("sequences"), title: v.string(), purpose: v.string(), visualDirection: v.string(), orderIndex: v.number(),
    status: v.optional(status), metadata: v.optional(json),
  }).index("by_sequence", ["sequenceId"]).index("by_production", ["productionId"])
    .index("by_studio", ["studioExternalId"]).index("by_order", ["sequenceId", "orderIndex"]),

  shots: defineTable({
    studioExternalId: v.optional(v.string()), studioId: v.optional(v.id("studios")), productionId: v.optional(v.id("productions")),
    sequenceId: v.optional(v.id("sequences")), sceneId: v.id("scenes"), title: v.string(), prompt: v.string(), durationSeconds: v.number(),
    orderIndex: v.number(), camera: json, requiredAssetIds: v.array(v.string()), referencePackIds: v.optional(v.array(v.id("referencePacks"))),
    status, metadata: v.optional(json),
  }).index("by_scene", ["sceneId"]).index("by_production", ["productionId"])
    .index("by_studio", ["studioExternalId"]).index("by_order", ["sceneId", "orderIndex"]),

  shotVersions: defineTable({
    studioExternalId: v.optional(v.string()), studioId: v.optional(v.id("studios")), productionId: v.optional(v.id("productions")),
    shotId: v.id("shots"), versionNumber: v.number(), status, assetId: v.optional(v.id("assets")),
    promptSnapshot: v.optional(v.string()), contextSnapshot: json, model: v.optional(v.string()), provider: v.optional(v.string()),
    actualCost: v.optional(v.number()), createdAt: v.optional(timestamp),
  }).index("by_shot", ["shotId"]).index("by_shot_version", ["shotId", "versionNumber"])
    .index("by_production", ["productionId"]).index("by_studio", ["studioExternalId"]),

  assets: defineTable({
    ...studioOwned, externalId: v.optional(v.string()), projectId: v.optional(v.id("projects")), productionId: v.optional(v.id("productions")),
    source: v.string(), roles: v.array(v.string()), name: v.optional(v.string()), mimeType: v.optional(v.string()), byteSize: v.optional(v.number()),
    storageUrl: v.optional(v.string()), storageKey: v.optional(v.string()), storageId: v.optional(v.id("_storage")), checksum: v.optional(v.string()),
    width: v.optional(v.number()), height: v.optional(v.number()), durationSeconds: v.optional(v.number()), frameRate: v.optional(v.number()),
    channels: v.optional(v.number()), sampleRate: v.optional(v.number()), accessLevel: v.optional(v.string()), lifecycle: v.optional(v.string()),
    moderation: v.optional(json), provenance: v.optional(json), rights: v.optional(json), retention: v.optional(json), metadata: json,
    createdAt: timestamp, updatedAt: v.optional(timestamp), deletedAt: v.optional(timestamp),
  }).index("by_external_id", ["externalId"]).index("by_studio", ["studioExternalId"])
    .index("by_studio_id", ["studioId"]).index("by_project", ["projectId"]).index("by_production", ["productionId"])
    .index("by_checksum", ["studioExternalId", "checksum"]),

  derivatives: defineTable({
    ...studioOwned, sourceAssetId: v.id("assets"), derivedAssetId: v.id("assets"), kind: v.string(), transform: json,
    checksum: v.optional(v.string()), createdAt: timestamp,
  }).index("by_source", ["sourceAssetId"]).index("by_derived", ["derivedAssetId"])
    .index("by_studio", ["studioExternalId"]).index("by_studio_source", ["studioExternalId", "sourceAssetId"]),

  provenance: defineTable({
    ...studioOwned, assetId: v.id("assets"), sourceType: v.string(), sourceAssetIds: v.optional(v.array(v.id("assets"))),
    provider: v.optional(v.string()), model: v.optional(v.string()), modelVersion: v.optional(v.string()), generationJobId: v.optional(v.id("generationJobs")),
    promptSnapshot: v.optional(v.string()), requestSnapshot: v.optional(json), rights: v.optional(json), metadata: v.optional(json), createdAt: timestamp,
  }).index("by_asset", ["assetId"]).index("by_generation_job", ["generationJobId"]).index("by_studio", ["studioExternalId"]),

  generationJobs: defineTable({
    ...studioOwned, productionId: v.id("productions"), shotId: v.id("shots"), shotVersionId: v.id("shotVersions"), operation: v.optional(v.string()),
    capability: v.optional(v.string()), modality: v.string(), provider: v.string(), model: v.string(), modelVersion: v.optional(v.string()), request: json,
    response: v.optional(json), status, progress: v.number(), estimatedCost: v.number(), estimateId: v.optional(v.id("estimates")),
    idempotencyKey: v.string(), requestHash: v.optional(v.string()), reservationId: v.optional(v.id("creditReservations")), canonicalReservationId: v.optional(v.id("reservations")),
    correlationId: v.optional(v.string()), leaseId: v.optional(v.string()), leaseExpiresAt: v.optional(timestamp), nextAttemptAt: v.optional(timestamp),
    actualCost: v.optional(v.number()), providerJobId: v.optional(v.string()), errorCode: v.optional(v.string()), errorMessage: v.optional(v.string()),
    attemptCount: v.number(), createdAt: timestamp, startedAt: v.optional(timestamp), completedAt: v.optional(timestamp), updatedAt: timestamp,
  }).index("by_idempotency", ["idempotencyKey"]).index("by_production", ["productionId"]).index("by_shot", ["shotId"])
    .index("by_status", ["status"]).index("by_studio", ["studioExternalId"]).index("by_provider_job", ["provider", "providerJobId"]),

  attempts: defineTable({
    ...studioOwned, generationJobId: v.id("generationJobs"), attemptNumber: v.number(), status, provider: v.string(),
    providerJobId: v.optional(v.string()), requestHash: v.optional(v.string()), response: v.optional(json), errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()), retryable: v.optional(v.boolean()), startedAt: v.optional(timestamp), completedAt: v.optional(timestamp), createdAt: timestamp,
  }).index("by_job", ["generationJobId"]).index("by_job_attempt", ["generationJobId", "attemptNumber"]).index("by_studio", ["studioExternalId"]),

  audio: defineTable({
    ...studioOwned, projectId: v.optional(v.id("projects")), productionId: v.optional(v.id("productions")), assetId: v.optional(v.id("assets")), kind: v.string(),
    language: v.optional(v.string()), speaker: v.optional(v.string()), durationSeconds: v.optional(v.number()), sampleRate: v.optional(v.number()), channels: v.optional(v.number()),
    metadata: v.optional(json), createdAt: timestamp, updatedAt: v.optional(timestamp),
  }).index("by_studio", ["studioExternalId"]).index("by_project", ["projectId"]).index("by_production", ["productionId"]).index("by_asset", ["assetId"]),

  transcripts: defineTable({
    ...studioOwned, audioId: v.id("audio"), productionId: v.optional(v.id("productions")), language: v.string(), provider: v.optional(v.string()), model: v.optional(v.string()),
    status, segments: json, checksum: v.optional(v.string()), createdAt: timestamp, updatedAt: v.optional(timestamp),
  }).index("by_audio", ["audioId"]).index("by_production", ["productionId"]).index("by_studio", ["studioExternalId"]),

  captions: defineTable({
    ...studioOwned, productionId: v.optional(v.id("productions")), transcriptId: v.optional(v.id("transcripts")), language: v.string(), format: v.string(), cues: json,
    style: v.optional(json), status, createdAt: timestamp, updatedAt: v.optional(timestamp),
  }).index("by_transcript", ["transcriptId"]).index("by_production", ["productionId"]).index("by_studio", ["studioExternalId"]),

  timelines: defineTable({
    ...studioOwned, productionId: v.id("productions"), versionNumber: v.number(), durationSeconds: v.number(), tracks: json, outputPreset: v.string(),
    status, createdByUserId: v.optional(v.id("users")), createdAt: timestamp, updatedAt: v.optional(timestamp),
  }).index("by_production", ["productionId"]).index("by_production_version", ["productionId", "versionNumber"]).index("by_studio", ["studioExternalId"]),

  timelineTracks: defineTable({
    ...studioOwned, timelineId: v.id("timelines"), kind: v.string(), name: v.optional(v.string()), orderIndex: v.number(), metadata: v.optional(json),
  }).index("by_timeline", ["timelineId"]).index("by_studio", ["studioExternalId"]),

  timelineClips: defineTable({
    ...studioOwned, timelineId: v.id("timelines"), trackId: v.id("timelineTracks"), assetId: v.optional(v.id("assets")), shotVersionId: v.optional(v.id("shotVersions")),
    startSeconds: v.number(), durationSeconds: v.number(), trimStartSeconds: v.optional(v.number()), trimEndSeconds: v.optional(v.number()), volume: v.optional(v.number()),
    transition: v.optional(json), metadata: v.optional(json),
  }).index("by_timeline", ["timelineId"]).index("by_track", ["trackId"]).index("by_studio", ["studioExternalId"]),

  renderJobs: defineTable({
    ...studioOwned, productionId: v.id("productions"), timelineId: v.optional(v.id("timelines")), manifestId: v.optional(v.id("manifests")), operation: v.string(), preset: v.string(),
    status, idempotencyKey: v.string(), requestHash: v.optional(v.string()), progress: v.number(), estimatedCost: v.optional(v.number()), actualCost: v.optional(v.number()),
    providerJobId: v.optional(v.string()), leaseId: v.optional(v.string()), leaseExpiresAt: v.optional(timestamp), errorCode: v.optional(v.string()), errorMessage: v.optional(v.string()),
    createdAt: timestamp, startedAt: v.optional(timestamp), completedAt: v.optional(timestamp), updatedAt: timestamp,
  }).index("by_idempotency", ["idempotencyKey"]).index("by_production", ["productionId"]).index("by_status", ["status"]).index("by_studio", ["studioExternalId"]),

  manifests: defineTable({
    ...studioOwned, productionId: v.id("productions"), timelineId: v.optional(v.id("timelines")), versionNumber: v.number(), manifest: json, sourceHashes: v.array(v.string()),
    rendererVersion: v.optional(v.string()), templateVersions: v.optional(json), createdAt: timestamp,
  }).index("by_production", ["productionId"]).index("by_timeline", ["timelineId"]).index("by_studio", ["studioExternalId"]),

  exports: defineTable({
    ...studioOwned, productionId: v.id("productions"), renderJobId: v.optional(v.id("renderJobs")), manifestId: v.optional(v.id("manifests")), assemblyJobId: v.optional(v.id("assemblyJobs")),
    preset: v.string(), status, storageId: v.optional(v.id("_storage")), storageKey: v.optional(v.string()), outputUrl: v.optional(v.string()), checksum: v.optional(v.string()),
    mimeType: v.optional(v.string()), errorMessage: v.optional(v.string()), createdAt: timestamp, completedAt: v.optional(timestamp),
  }).index("by_production", ["productionId"]).index("by_render_job", ["renderJobId"]).index("by_studio", ["studioExternalId"]),

  reviews: defineTable({
    ...studioOwned, productionId: v.id("productions"), status: v.union(v.literal("DRAFT"), v.literal("REQUESTED"), v.literal("APPROVED"), v.literal("CHANGES_REQUESTED")),
    shareTokenHash: v.optional(v.string()), requestedByUserId: v.optional(v.id("users")), createdAt: timestamp, updatedAt: timestamp,
  }).index("by_production", ["productionId"]).index("by_studio", ["studioExternalId"]).index("by_status", ["status"]),

  comments: defineTable({
    ...studioOwned, reviewId: v.id("reviews"), authorExternalId: v.optional(v.string()), authorUserId: v.optional(v.id("users")), body: v.string(),
    timeSeconds: v.optional(v.number()), shotId: v.optional(v.id("shots")), resolvedAt: v.optional(timestamp), createdAt: timestamp,
  }).index("by_review", ["reviewId"]).index("by_shot", ["shotId"]).index("by_studio", ["studioExternalId"]),

  approvals: defineTable({
    ...studioOwned, productionId: v.id("productions"), reviewId: v.optional(v.id("reviews")), resourceType: v.string(), resourceId: v.string(), decision: v.string(),
    actorUserId: v.optional(v.id("users")), note: v.optional(v.string()), createdAt: timestamp,
  }).index("by_resource", ["resourceType", "resourceId"]).index("by_production", ["productionId"]).index("by_studio", ["studioExternalId"]),

  // Canonical financial records are event-shaped: corrections use new
  // compensating/superseding records instead of mutable balances/statuses.
  estimates: defineTable({
    ...studioOwned, projectId: v.optional(v.id("projects")), productionId: v.optional(v.id("productions")), version: v.string(), currency: v.optional(v.string()),
    totalCredits: v.number(), lineItems: json, policySnapshot: v.optional(json), expiresAt: timestamp, createdAt: timestamp, supersedesEstimateId: v.optional(v.id("estimates")),
  }).index("by_production", ["productionId"]).index("by_studio", ["studioExternalId"]).index("by_expiry", ["expiresAt"]),

  reservations: defineTable({
    ...studioOwned, estimateId: v.optional(v.id("estimates")), generationJobId: v.optional(v.id("generationJobs")), renderJobId: v.optional(v.id("renderJobs")), amount: v.number(),
    idempotencyKey: v.string(), reservedAt: timestamp, expiresAt: timestamp, createdAt: timestamp, supersedesReservationId: v.optional(v.id("reservations")),
  }).index("by_idempotency", ["idempotencyKey"]).index("by_studio", ["studioExternalId"]).index("by_generation_job", ["generationJobId"])
    .index("by_render_job", ["renderJobId"]).index("by_expiry", ["expiresAt"]),

  // Mutable wallet projection. Ledger rows below remain the append-only
  // accounting source and are corrected with compensating entries.
  credits: defineTable({
    ...studioOwned, balance: v.number(), reserved: v.number(), currency: v.optional(v.string()), createdAt: timestamp, updatedAt: timestamp,
  }).index("by_studio", ["studioExternalId"]).index("by_studio_id", ["studioId"]),

  ledger: defineTable({
    ...studioOwned, entryType: v.string(), amount: v.number(), currency: v.optional(v.string()), sourceType: v.string(), sourceId: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()), reservationId: v.optional(v.id("reservations")), purchaseId: v.optional(v.id("purchases")), refundId: v.optional(v.id("refunds")),
    metadata: json, createdAt: timestamp,
  }).index("by_studio", ["studioExternalId"]).index("by_source", ["sourceType", "sourceId"])
    .index("by_idempotency", ["idempotencyKey"]).index("by_created_at", ["studioExternalId", "createdAt"]),

  payments: defineTable({
    ...studioOwned, provider: v.string(), providerCheckoutId: v.optional(v.string()), providerPaymentId: v.optional(v.string()), amount: v.number(), currency: v.string(), credits: v.number(), reference: v.string(), status, metadata: json, createdAt: timestamp,
  }).index("by_reference", ["reference"]).index("by_checkout", ["providerCheckoutId"]).index("by_studio", ["studioExternalId"]),

  purchases: defineTable({
    ...studioOwned, provider: v.string(), providerCheckoutId: v.optional(v.string()), providerPaymentId: v.optional(v.string()), amount: v.number(), currency: v.string(), credits: v.number(),
    reference: v.string(), metadata: json, createdAt: timestamp, supersedesPurchaseId: v.optional(v.id("purchases")),
  }).index("by_reference", ["reference"]).index("by_checkout", ["providerCheckoutId"])
    .index("by_provider_payment", ["provider", "providerPaymentId"]).index("by_studio", ["studioExternalId"]),

  paymentEvents: defineTable({
    studioExternalId: v.optional(v.string()), studioId: v.optional(v.id("studios")), provider: v.string(), providerEventId: v.string(), eventType: v.string(), payload: json,
    purchaseId: v.optional(v.id("purchases")), receivedAt: v.optional(timestamp), processedAt: v.optional(timestamp), createdAt: timestamp,
  }).index("by_provider_event", ["provider", "providerEventId"]).index("by_purchase", ["purchaseId"]).index("by_studio", ["studioExternalId"]),

  refunds: defineTable({
    ...studioOwned, purchaseId: v.optional(v.id("purchases")), provider: v.string(), providerRefundId: v.optional(v.string()), amount: v.number(), currency: v.string(),
    reason: v.string(), metadata: json, createdAt: timestamp, supersedesRefundId: v.optional(v.id("refunds")),
  }).index("by_purchase", ["purchaseId"]).index("by_provider_refund", ["provider", "providerRefundId"]).index("by_studio", ["studioExternalId"]),

  modelRegistry: defineTable({
    provider: v.string(), model: v.string(), version: v.optional(v.string()), modalities: v.array(v.string()), capabilities: json, pricing: json, enabled: v.boolean(), metadata: v.optional(json),
    createdAt: timestamp, updatedAt: v.optional(timestamp),
  }).index("by_provider_model", ["provider", "model"]).index("by_enabled", ["enabled"]),

  featureFlags: defineTable({
    key: v.string(), enabled: v.boolean(), studioExternalId: v.optional(v.string()), studioId: v.optional(v.id("studios")), userId: v.optional(v.id("users")), rollout: v.optional(json), metadata: v.optional(json),
    createdAt: timestamp, updatedAt: timestamp,
  }).index("by_key", ["key"]).index("by_studio", ["studioExternalId"]).index("by_studio_key", ["studioExternalId", "key"]).index("by_user_key", ["userId", "key"]),

  audit: defineTable({
    studioExternalId: v.optional(v.string()), studioId: v.optional(v.id("studios")), actorExternalId: v.optional(v.string()), actorUserId: v.optional(v.id("users")),
    action: v.string(), entityType: v.string(), entityId: v.string(), correlationId: v.optional(v.string()), metadata: json, createdAt: timestamp,
  }).index("by_studio", ["studioExternalId"]).index("by_entity", ["entityType", "entityId"])
    .index("by_correlation", ["correlationId"]).index("by_created_at", ["createdAt"]),

  systemHealth: defineTable({
    component: v.string(), check: v.string(), status, observedAt: timestamp, latencyMs: v.optional(v.number()), version: v.optional(v.string()), details: v.optional(json),
  }).index("by_component", ["component"]).index("by_status", ["status"]).index("by_observed_at", ["observedAt"]),

  // Compatibility shims for untouched current functions. New code should use
  // the canonical tables above and migrate these records by ID.
  productionVersions: defineTable({
    productionId: v.id("productions"), versionNumber: v.number(), status, sourcePlanId: v.id("directorPlans"), approvedAt: v.optional(timestamp), createdAt: timestamp,
  }).index("by_production", ["productionId"]),
  priceRules: defineTable({ operation: v.string(), qualityTier: v.string(), unit: v.string(), creditsPerUnit: v.number(), enabled: v.boolean() }).index("by_operation", ["operation", "qualityTier"]),
  creditReservations: defineTable({
    studioExternalId: v.string(), generationJobId: v.optional(v.id("generationJobs")), amount: v.number(), idempotencyKey: v.string(), status, expiresAt: timestamp, createdAt: timestamp,
    committedAt: v.optional(timestamp), releasedAt: v.optional(timestamp), actualAmount: v.optional(v.number()),
  }).index("by_idempotency", ["idempotencyKey"]).index("by_studio", ["studioExternalId"]),
  creditTransactions: defineTable({
    studioExternalId: v.string(), delta: v.number(), transactionType: v.string(), source: v.string(), referenceId: v.optional(v.string()), metadata: json, createdAt: timestamp,
  }).index("by_studio", ["studioExternalId"]),
  assemblyJobs: defineTable({
    productionId: v.id("productions"), status, manifest: json, outputUrl: v.optional(v.string()), errorMessage: v.optional(v.string()), rendererJobId: v.optional(v.string()), correlationId: v.optional(v.string()), createdAt: timestamp, updatedAt: timestamp,
  }).index("by_production", ["productionId"]),
  paymentPurchases: defineTable({
    studioExternalId: v.string(), provider: v.string(), providerCheckoutId: v.optional(v.string()), amount: v.number(), currency: v.string(), credits: v.number(), reference: v.string(), status, metadata: json, createdAt: timestamp, completedAt: v.optional(timestamp),
  }).index("by_reference", ["reference"]).index("by_checkout", ["providerCheckoutId"]).index("by_studio", ["studioExternalId"]),
  creditEstimates: defineTable({
    studioExternalId: v.string(), productionId: v.optional(v.id("productions")), estimateVersion: v.string(), totalCredits: v.number(), lineItems: json, expiresAt: timestamp, createdAt: timestamp,
  }).index("by_production", ["productionId"]).index("by_studio", ["studioExternalId"]),
  reviewComments: defineTable({ reviewId: v.id("reviews"), authorExternalId: v.optional(v.string()), body: v.string(), timeSeconds: v.optional(v.number()), resolvedAt: v.optional(timestamp), createdAt: timestamp }).index("by_review", ["reviewId"]),
  auditEvents: defineTable({
    studioExternalId: v.optional(v.string()), actorExternalId: v.optional(v.string()), action: v.string(), entityType: v.string(), entityId: v.string(), correlationId: v.optional(v.string()), metadata: json, createdAt: timestamp,
  }).index("by_studio", ["studioExternalId"]).index("by_entity", ["entityType", "entityId"]),
});
