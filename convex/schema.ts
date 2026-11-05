import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const timestamp = v.number();
const json = v.any();

const workflowPreset = v.union(
  v.literal("NIGERIAN_CARTOON_COMEDY"),
  v.literal("REALISTIC_AI_SKIT"),
  v.literal("VOICEOVER_STORY"),
  v.literal("AI_PRODUCT_AD"),
  v.literal("FACELESS_EXPLAINER"),
  v.literal("SHORT_FILM"),
);

const inputMode = v.union(
  v.literal("IDEA"),
  v.literal("SCRIPT"),
  v.literal("VOICE"),
  v.literal("CAST_REFERENCES"),
  v.literal("FOOTAGE"),
  v.literal("AD_BRIEF"),
  v.literal("MIXED_MEDIA"),
);

const workflowStage = v.union(
  v.literal("BRIEF"),
  v.literal("PERFORMANCE"),
  v.literal("PLAN"),
  v.literal("BIBLE"),
  v.literal("SHOTS"),
  v.literal("MAKE"),
  v.literal("FINISH"),
  v.literal("REVIEW"),
  v.literal("EXPORT"),
);

const qualityGateStatus = v.union(
  v.literal("NOT_RUN"),
  v.literal("PASS"),
  v.literal("PASS_WITH_WARNINGS"),
  v.literal("BLOCKED"),
  v.literal("REQUIRES_HUMAN_REVIEW"),
);

const qualityGateEvidence = v.object({
  rule: v.string(),
  result: v.union(v.literal("PASS"), v.literal("WARN"), v.literal("FAIL")),
  explanation: v.string(),
});

const qualityGateResult = v.object({
  status: qualityGateStatus,
  continuityScore: v.optional(v.number()),
  audioAlignmentScore: v.optional(v.number()),
  captionAccuracyScore: v.optional(v.number()),
  evidence: v.array(qualityGateEvidence),
});

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

const projectRole = v.union(
  v.literal("OWNER"),
  v.literal("EDITOR"),
  v.literal("REVIEWER"),
  v.literal("VIEWER"),
);

const projectMemberStatus = v.union(
  v.literal("ACTIVE"),
  v.literal("INVITED"),
  v.literal("SUSPENDED"),
  v.literal("REMOVED"),
);

const resourceState = v.union(
  v.literal("DRAFT"),
  v.literal("IN_REVIEW"),
  v.literal("APPROVED"),
  v.literal("LOCKED"),
  v.literal("REVISION_REQUESTED"),
);

const voiceKind = v.union(v.literal("CLONED"), v.literal("STOCK"), v.literal("RECORDED"));
const voiceStatus = v.union(
  v.literal("DRAFT"), v.literal("CONSENT_REQUIRED"), v.literal("QUEUED"), v.literal("TRAINING"),
  v.literal("READY"), v.literal("FAILED"), v.literal("REVOKING"), v.literal("REVOKED"), v.literal("DELETED"),
);
const voiceConsentUse = v.union(v.literal("TRAIN"), v.literal("SYNTHESIZE"), v.literal("AVATAR_LIPSYNC"));
const videoType = v.union(
  v.literal("ANIMATED_COMEDY_2D"), v.literal("REALISTIC_SKIT_UGC"), v.literal("PRODUCT_SAAS_LAUNCH"),
  v.literal("MOTION_GRAPHICS"), v.literal("EXPLAINER_STORY"), v.literal("CINEMATIC_FILM"),
  v.literal("MUSIC_VIDEO"), v.literal("SOCIAL_CUTDOWN"),
);
const videoQualityTier = v.union(v.literal("ECONOMY"), v.literal("STANDARD"), v.literal("PREMIUM"));
const videoProductionPath = v.union(v.literal("AI_VIDEO"), v.literal("MOTION_GRAPHICS"), v.literal("COMPOSITED"));

// Keep the legacy external key during migration while making studio ownership
// explicit on every private canonical record.
const studioOwned = {
  studioExternalId: v.string(),
  studioId: v.optional(v.id("studios")),
};

const movieOutput = v.object({ width: v.number(), height: v.number(), fps: v.number(), codec: v.literal('h264'), audioSampleRate: v.literal(48000), audioChannels: v.literal(2) });
const movieSource = v.object({
  itemId: v.string(), kind: v.union(v.literal('VIDEO'), v.literal('IMAGE'), v.literal('GRAPHIC'), v.literal('AUDIO'), v.literal('CAPTIONS')),
  trackId: v.optional(v.string()), timelineClipId: v.optional(v.string()), sceneId: v.optional(v.id('scenes')), shotId: v.optional(v.id('shots')), shotVersionId: v.optional(v.id('shotVersions')), assetId: v.optional(v.id('assets')),
  startFrame: v.number(), durationInFrames: v.number(), sourceTimelineStartFrame: v.optional(v.number()), sourceMediaTrimStartFrame: v.optional(v.number()),
  fadeInFrames: v.optional(v.number()), fadeOutFrames: v.optional(v.number()),
  assetStorageId: v.optional(v.id('_storage')), assetChecksum: v.optional(v.string()), assetStorageChecksum: v.optional(v.string()),
});
const movieArtifactVerification = v.object({
  checkedBy: v.literal('ffprobe'), checkedAt: v.string(), fileSizeBytes: v.number(), width: v.number(), height: v.number(), fps: v.number(), durationSeconds: v.number(), videoCodec: v.string(),
  audioCodec: v.optional(v.string()), hasAudio: v.boolean(), orderedPartIds: v.array(v.string()), durationInFrames: v.number(),
});
const moviePartVerification = v.object({
  checkedBy: v.literal('ffprobe'), checkedAt: v.string(), fileSizeBytes: v.number(), width: v.number(), height: v.number(), fps: v.number(), durationSeconds: v.number(), videoCodec: v.string(),
  audioCodec: v.optional(v.string()), hasAudio: v.boolean(), orderedItemIds: v.array(v.string()), captionTrackCount: v.number(), captionMode: v.union(v.literal('none'), v.literal('burned-in'), v.literal('subtitle')),
});

export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()), image: v.optional(v.string()), email: v.optional(v.string()),
    emailVerificationTime: v.optional(timestamp), phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(timestamp), isAnonymous: v.optional(v.boolean()),
    externalId: v.optional(v.string()), authSubject: v.optional(v.string()),
    status: v.optional(status), metadata: v.optional(json), createdAt: v.optional(timestamp),
    updatedAt: v.optional(timestamp), displayName: v.optional(v.string()),
    deactivationRequestId: v.optional(v.id('accountDeactivationRequests')), currentStudioId: v.optional(v.id('studios')),
  }).index("by_external_id", ["externalId"]).index("by_auth_subject", ["authSubject"]).index("by_email", ["email"]),

  accountDeactivationRequests: defineTable({
    userId: v.id('users'), status: v.union(v.literal('REQUESTED'), v.literal('CANCELED')), reason: v.string(), idempotencyKey: v.string(),
    createdAt: timestamp, updatedAt: timestamp, canceledAt: v.optional(timestamp), canceledByUserId: v.optional(v.id('users')), cancellationReason: v.optional(v.string()),
  }).index('by_user', ['userId']).index('by_status', ['status']).index('by_idempotency', ['idempotencyKey']),

  accountExportRequests: defineTable({
    userId: v.id('users'), formatVersion: v.literal(1), status: v.union(v.literal('OPEN'), v.literal('COMPLETED'), v.literal('CANCELED')),
    idempotencyKey: v.string(), createdAt: timestamp, updatedAt: timestamp, expiresAt: timestamp, nextOrdinal: v.number(), cursor: v.string(), recordCount: v.number(),
  }).index('by_user', ['userId']).index('by_idempotency', ['idempotencyKey']),

  accountExportPages: defineTable({
    requestId: v.id('accountExportRequests'), userId: v.id('users'), ordinal: v.number(), cursor: v.string(), nextCursor: v.string(), isDone: v.boolean(),
    recordCount: v.number(), byteCount: v.number(), sha256: v.string(), createdAt: timestamp,
  }).index('by_request_ordinal', ['requestId', 'ordinal']).index('by_request', ['requestId']),

  studios: defineTable({
    externalId: v.string(), ownerExternalId: v.string(), ownerId: v.optional(v.id("users")), ownerUserId: v.optional(v.id("users")),
    name: v.string(), credits: v.number(), status: v.optional(status), metadata: v.optional(json),
    createdAt: timestamp, updatedAt: timestamp,
  }).index("by_external_id", ["externalId"]).index("by_owner", ["ownerExternalId"]).index("by_owner_id", ["ownerId"]).index("by_owner_user", ["ownerUserId"]),

  platformRoles: defineTable({
    userId: v.id('users'), role: v.union(v.literal('ADMIN'), v.literal('SUPPORT'), v.literal('MODERATOR')),
    status: v.union(v.literal('ACTIVE'), v.literal('REVOKED')), grantedByUserId: v.optional(v.id('users')), revokedByUserId: v.optional(v.id('users')), createdAt: timestamp, updatedAt: timestamp,
  }).index('by_user', ['userId']).index('by_role_status', ['role', 'status']),

  moderationReports: defineTable({
    projectId: v.id('projects'), assetId: v.optional(v.id('assets')), exportId: v.optional(v.id('exports')), reporterUserId: v.id('users'),
    category: v.union(v.literal('CONSENT'), v.literal('RIGHTS'), v.literal('HARMFUL_CONTENT'), v.literal('OTHER')), reason: v.string(),
    status: v.union(v.literal('OPEN'), v.literal('RESOLVED'), v.literal('DISMISSED')), idempotencyKey: v.string(),
    decision: v.optional(v.union(v.literal('DISMISSED'), v.literal('QUARANTINED'))), decisionReason: v.optional(v.string()),
    decidedByUserId: v.optional(v.id('users')), decidedAt: v.optional(timestamp), createdAt: timestamp, updatedAt: timestamp,
  }).index('by_status', ['status']).index('by_project', ['projectId']).index('by_reporter', ['reporterUserId']).index('by_idempotency', ['idempotencyKey']),

  studioMembers: defineTable({
    studioExternalId: v.string(), studioId: v.optional(v.id("studios")), userExternalId: v.string(),
    userId: v.optional(v.id("users")),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
    status: v.union(v.literal("active"), v.literal("invited"), v.literal("suspended")),
    invitedByExternalId: v.optional(v.string()), invitedAt: v.optional(timestamp), joinedAt: v.optional(timestamp),
    createdAt: timestamp, updatedAt: timestamp,
  }).index("by_studio", ["studioExternalId"]).index("by_studio_id", ["studioId"])
    .index("by_user", ["userExternalId"]).index("by_user_id", ["userId"]).index('by_user_status', ['userExternalId', 'status'])
    .index("by_studio_user", ["studioExternalId", "userExternalId"])
    .index("by_studio_user_id", ["studioId", "userId"]),

  // Temporary internal-ID membership name used by the authorization adapter.
  members: defineTable({
    studioId: v.id("studios"), userId: v.id("users"),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")), status: v.union(v.literal("active"), v.literal("invited"), v.literal("suspended"), v.literal("removed")),
    createdAt: v.optional(timestamp), updatedAt: v.optional(timestamp),
  }).index("by_studio_user", ["studioId", "userId"]).index("by_studio", ["studioId"]).index("by_user", ["userId"]).index('by_user_status', ['userId', 'status']),

  studioInvitations: defineTable({
    studioId: v.id('studios'), studioExternalId: v.string(), recipientUserId: v.id('users'), role: v.union(v.literal('admin'), v.literal('member')), tokenHash: v.string(),
    status: v.union(v.literal('PENDING'), v.literal('ACCEPTED'), v.literal('REVOKED')), idempotencyKey: v.string(), createdByUserId: v.id('users'), createdAt: timestamp, updatedAt: timestamp, expiresAt: timestamp,
    acceptedByUserId: v.optional(v.id('users')), acceptedAt: v.optional(timestamp), acceptedRequestId: v.optional(v.string()), membershipId: v.optional(v.id('members')),
    revokedByUserId: v.optional(v.id('users')), revokedAt: v.optional(timestamp), revocationReason: v.optional(v.string()),
  }).index('by_token_hash', ['tokenHash']).index('by_idempotency', ['idempotencyKey']).index('by_studio_status', ['studioId', 'status']).index('by_recipient_status', ['recipientUserId', 'status']).index('by_studio_recipient_status', ['studioId', 'recipientUserId', 'status']),

  projects: defineTable({
    externalId: v.string(), studioExternalId: v.string(), studioId: v.optional(v.id("studios")), name: v.string(),
    description: v.optional(v.string()), projectType: v.optional(v.string()), status: v.optional(status), metadata: v.optional(json),
    createdByExternalId: v.optional(v.string()), createdByUserId: v.optional(v.id("users")),
    ownerUserId: v.optional(v.id("users")), archivedAt: v.optional(timestamp), deletedAt: v.optional(timestamp),
    moderationStatus: v.optional(v.union(v.literal('RESTRICTED'), v.literal('CLEAR'))), moderationReportId: v.optional(v.id('moderationReports')),
    createdAt: timestamp, updatedAt: timestamp,
  }).index("by_external_id", ["externalId"]).index("by_studio", ["studioExternalId"])
    .index("by_studio_id", ["studioId"]).index("by_studio_status", ["studioExternalId", "status"])
    .index('by_owner_user', ['ownerUserId']).index('by_created_by_user', ['createdByUserId']).index('by_created_by_external', ['createdByExternalId']),

  projectMembers: defineTable({
    projectId: v.id("projects"), userId: v.id("users"), role: projectRole, status: projectMemberStatus,
    invitedByUserId: v.optional(v.id("users")), createdAt: timestamp, updatedAt: timestamp,
  }).index("by_project", ["projectId"]).index("by_project_user", ["projectId", "userId"])
    .index("by_user", ["userId"]).index("by_project_status", ["projectId", "status"]).index('by_project_role_status', ['projectId', 'role', 'status']),

  episodes: defineTable({
    projectId: v.id("projects"), productionId: v.id("productions"), episodeNumber: v.number(), title: v.string(),
    predecessorEpisodeId: v.optional(v.id("episodes")), inputStoryStateId: v.optional(v.id("episodeStoryStates")),
    acceptedStoryStateId: v.optional(v.id("episodeStoryStates")),
    continuityStatus: v.union(v.literal("CURRENT"), v.literal("STALE")),
    createdByUserId: v.id("users"), createdAt: timestamp, updatedAt: timestamp,
  }).index("by_project_and_number", ["projectId", "episodeNumber"])
    .index("by_production", ["productionId"]).index("by_project_and_predecessor", ["projectId", "predecessorEpisodeId"]),

  projectResources: defineTable({
    projectId: v.id("projects"), kind: v.union(v.literal("CHARACTER"), v.literal("LOCATION"), v.literal("COSTUME"),
      v.literal("PROP"), v.literal("PRODUCT"), v.literal("BRAND"), v.literal("STYLE")),
    name: v.string(), createdByUserId: v.id("users"), createdAt: timestamp, updatedAt: timestamp, archivedAt: v.optional(timestamp),
  }).index("by_project_and_kind", ["projectId", "kind"]).index("by_project", ["projectId"]),

  projectResourceVersions: defineTable({
    projectId: v.id("projects"), resourceId: v.id("projectResources"), versionNumber: v.number(), profile: json,
    assetIds: v.array(v.id("assets")), voiceId: v.optional(v.id("voices")), voiceVersionId: v.optional(v.id("voiceVersions")), createdByUserId: v.id("users"), createdAt: timestamp,
  }).index("by_resource_and_version", ["resourceId", "versionNumber"]).index("by_project", ["projectId"]),

  continuityBibles: defineTable({
    projectId: v.id("projects"), versionNumber: v.number(), snapshot: json,
    idempotencyKey: v.optional(v.string()),
    state: v.union(v.literal("DRAFT"), v.literal("APPROVED")), sourceBibleId: v.optional(v.id("continuityBibles")),
    createdByUserId: v.id("users"), approvedByUserId: v.optional(v.id("users")), approvedAt: v.optional(timestamp),
    createdAt: timestamp, updatedAt: timestamp,
  }).index("by_project_and_version", ["projectId", "versionNumber"]).index("by_project_and_state", ["projectId", "state"])
    .index("by_idempotency", ["idempotencyKey"]),

  episodeStoryStates: defineTable({
    projectId: v.id("projects"), episodeId: v.id("episodes"), productionVersionId: v.id("productionVersions"),
    timelineId: v.optional(v.id("timelines")),
    continuityBibleId: v.optional(v.id("continuityBibles")), predecessorStoryStateId: v.optional(v.id("episodeStoryStates")),
    snapshot: json, createdByUserId: v.id("users"), createdAt: timestamp,
  }).index("by_episode", ["episodeId"]).index("by_version", ["productionVersionId"]),

  // Searchable approved facts retain their exact accepted episode provenance.
  // Superseded facts remain auditable and are excluded by source validation.
  projectMemoryFacts: defineTable({
    projectId: v.id('projects'), episodeId: v.id('episodes'), episodeNumber: v.number(),
    storyStateId: v.id('episodeStoryStates'), productionVersionId: v.id('productionVersions'), timelineId: v.id('timelines'),
    kind: v.union(v.literal('SUMMARY'), v.literal('FACT'), v.literal('THREAD'), v.literal('CHARACTER'), v.literal('CLIFFHANGER'), v.literal('PAYOFF')),
    ordinal: v.number(), text: v.string(), sourceHash: v.string(), createdAt: timestamp,
  }).index('by_project_episode', ['projectId', 'episodeNumber']).index('by_story_state', ['storyStateId'])
    .searchIndex('search_text', { searchField: 'text', filterFields: ['projectId'] }),

  // Provider dollars are separate from internal product credits. One run can
  // cover multiple studios without multiplying the approved testing ceiling.
  providerBudgets: defineTable({
    key: v.string(), limitMicros: v.number(), spentMicros: v.number(), reservedMicros: v.number(),
    status: v.union(v.literal("ACTIVE"), v.literal("PAUSED"), v.literal("CLOSED")),
    allowedStudioExternalIds: v.array(v.string()), createdAt: timestamp, updatedAt: timestamp,
  }).index("by_key", ["key"]),

  providerBudgetReservations: defineTable({
    budgetId: v.id("providerBudgets"), jobId: v.optional(v.id("generationJobs")), studioExternalId: v.string(),
    idempotencyKey: v.string(), estimatedMicros: v.number(), actualMicros: v.optional(v.number()),
    status: v.union(v.literal("RESERVED"), v.literal("SETTLED"), v.literal("RELEASED"), v.literal("RECONCILIATION_REQUIRED")),
    createdAt: timestamp, updatedAt: timestamp,
  }).index("by_idempotency", ["idempotencyKey"]).index("by_job", ["jobId"]).index("by_budget", ["budgetId"]),

  // Transport receipts, not a second planning/approval authority. Successful
  // content is applied only through productions.ts and productionVersions.
  providerTextRequests: defineTable({
    projectId: v.id("projects"), createdByUserId: v.id("users"), studioExternalId: v.string(),
    requestKey: v.string(), capability: v.string(), provider: v.literal("openrouter"), model: v.string(),
    reservationId: v.id("providerBudgetReservations"), estimatedCostUsd: v.number(), actualCostUsd: v.optional(v.number()),
    status: v.union(v.literal("RESERVED"), v.literal("SUBMITTING"), v.literal("COMPLETED"), v.literal("FAILED"), v.literal("RECONCILIATION_REQUIRED")),
    content: v.optional(v.string()), providerRequestId: v.optional(v.string()), usage: v.optional(json), errorCode: v.optional(v.string()),
    createdAt: timestamp, updatedAt: timestamp,
  }).index("by_request_key", ["requestKey"]).index("by_project", ["projectId"]),

  resourceStates: defineTable({
    projectId: v.id("projects"), productionId: v.optional(v.id("productions")), resourceType: v.string(), resourceId: v.string(),
    state: resourceState, approvedByUserId: v.optional(v.id("users")), approvedAt: v.optional(timestamp),
    lockedByUserId: v.optional(v.id("users")), lockedAt: v.optional(timestamp), unlockReason: v.optional(v.string()),
    revisionOfResourceId: v.optional(v.string()), createdAt: timestamp, updatedAt: timestamp,
  }).index("by_project_resource", ["projectId", "resourceType", "resourceId"])
    .index("by_project", ["projectId"]).index("by_production", ["productionId"]).index("by_state", ["state"]),

  productions: defineTable({
    externalProjectId: v.string(), projectId: v.optional(v.id("projects")), projectType: v.optional(v.string()),
    plannedDurationSeconds: v.optional(v.number()), studioExternalId: v.string(),
    studioId: v.optional(v.id("studios")), workflow: v.string(), inputMode: v.string(),
    requestedDurationSeconds: v.number(), language: v.string(), outputPreset: v.string(), status,
    preset: v.optional(workflowPreset), inputModes: v.optional(v.array(inputMode)), platform: v.optional(v.string()),
    aspectRatio: v.optional(v.string()), qualityTier: v.optional(v.union(v.literal("ECONOMY"), v.literal("STANDARD"), v.literal("PREMIUM"))),
    currentStage: v.optional(workflowStage), qualityGateStatus: v.optional(qualityGateStatus), qualityGateResults: v.optional(json),
    currentVersionId: v.optional(v.id("productionVersions")), currentPlanId: v.optional(v.id("directorPlans")),
    createdByExternalId: v.optional(v.string()), createdByUserId: v.optional(v.id("users")), metadata: v.optional(json),
    createdAt: timestamp, updatedAt: timestamp,
  }).index("by_project", ["externalProjectId"]).index("by_project_id", ["projectId"])
    .index("by_studio", ["studioExternalId"]).index("by_studio_id", ["studioId"]).index("by_status", ["status"]),

  createIntents: defineTable({
    ...studioOwned, projectId: v.optional(v.id("projects")), productionId: v.optional(v.id("productions")),
    createdByExternalId: v.optional(v.string()), createdByUserId: v.optional(v.id("users")), inputMode: v.string(),
    preset: v.optional(workflowPreset), inputModes: v.optional(v.array(inputMode)), brief: v.optional(v.string()), idea: v.optional(v.string()),
    script: v.optional(v.string()), language: v.optional(v.string()), platform: v.optional(v.string()), aspectRatio: v.optional(v.string()),
    durationSeconds: v.optional(v.number()), qualityTier: v.optional(v.union(v.literal("ECONOMY"), v.literal("STANDARD"), v.literal("PREMIUM"))),
    inputAssetIds: v.optional(v.array(v.id("assets"))), performanceAssetIds: v.optional(v.array(v.id("assets"))), referenceAssetIds: v.optional(v.array(v.id("assets"))),
    metadata: json, status, currentStage: v.optional(workflowStage), qualityGateStatus: v.optional(qualityGateStatus),
    createdAt: timestamp, updatedAt: timestamp,
  }).index("by_studio", ["studioExternalId"]).index("by_studio_id", ["studioId"])
    .index("by_project", ["projectId"]).index("by_production", ["productionId"]).index("by_status", ["status"]),

  directorPlans: defineTable({
    // Optional while the existing approval mutation is migrated; ownership is
    // still enforced through the required production relation.
    studioExternalId: v.optional(v.string()), studioId: v.optional(v.id("studios")), productionId: v.id("productions"),
    versionNumber: v.optional(v.number()), idempotencyKey: v.optional(v.string()), input: json, plan: json, estimate: json, status,
    approval: v.optional(json), createdByExternalId: v.optional(v.string()), createdByUserId: v.optional(v.id("users")),
    createdAt: timestamp, updatedAt: v.optional(timestamp), approvedAt: v.optional(timestamp),
  }).index("by_production", ["productionId"]).index("by_production_version", ["productionId", "versionNumber"]).index("by_idempotency", ["idempotencyKey"])
    .index("by_studio", ["studioExternalId"]).index("by_status", ["status"]),

  productionBibles: defineTable({
    studioExternalId: v.optional(v.string()), studioId: v.optional(v.id("studios")), productionId: v.optional(v.id("productions")),
    productionVersionId: v.id("productionVersions"), versionNumber: v.optional(v.number()), projectContext: json,
    characters: json, locations: json, products: json, style: json, story: json, entities: v.optional(json), createdAt: v.optional(timestamp),
  }).index("by_version", ["productionVersionId"]).index("by_production", ["productionId"]).index("by_studio", ["studioExternalId"]),

  characters: defineTable({
    ...studioOwned, productionId: v.optional(v.id("productions")), productionVersionId: v.optional(v.id("productionVersions")),
    name: v.string(), profile: json, assetIds: v.array(v.id("assets")), status, createdAt: timestamp, updatedAt: timestamp,
  }).index("by_production", ["productionId"]).index("by_version", ["productionVersionId"]).index("by_studio", ["studioExternalId"]),

  // Project-owned voice profiles. Provider identifiers are private backend
  // metadata and must be removed from browser-facing query projections.
  voices: defineTable({
    ...studioOwned, projectId: v.id("projects"), productionId: v.optional(v.id("productions")),
    characterId: v.optional(v.id("characters")), kind: voiceKind, name: v.string(), description: v.optional(v.string()),
    language: v.optional(v.string()), status: voiceStatus, provider: v.optional(v.string()), providerVoiceId: v.optional(v.string()),
    sampleAssetIds: v.array(v.id("assets")), previewAssetId: v.optional(v.id("assets")), currentConsentId: v.optional(v.id("voiceConsents")),
    originVoiceId: v.optional(v.id("voices")), importedByUserId: v.optional(v.id("users")), importedAt: v.optional(timestamp),
    settingsSnapshot: v.optional(json), providerMetadata: v.optional(json), retentionPolicy: v.optional(json),
    currentVersionId: v.optional(v.id('voiceVersions')),
    createdByUserId: v.id("users"), idempotencyKey: v.optional(v.string()), revokedAt: v.optional(timestamp), deletedAt: v.optional(timestamp),
    createdAt: timestamp, updatedAt: timestamp,
  }).index("by_project", ["projectId"]).index("by_project_status", ["projectId", "status"])
    .index("by_character", ["characterId"]).index("by_production", ["productionId"])
    .index("by_idempotency", ["idempotencyKey"]).index("by_provider_voice", ["provider", "providerVoiceId"]),

  voiceVersions: defineTable({
    projectId: v.id('projects'), voiceId: v.id('voices'), versionNumber: v.number(), snapshot: json, configHash: v.string(),
    approvedFromVoiceAt: timestamp, createdByUserId: v.id('users'), createdAt: timestamp,
  }).index('by_voice_version', ['voiceId', 'versionNumber']).index('by_project', ['projectId'])
    .index('by_voice_hash', ['voiceId', 'configHash']),

  // Grants are immutable. Revocation and other lifecycle changes are appended
  // to voiceConsentEvents so the original consent record remains auditable.
  voiceConsents: defineTable({
    projectId: v.id("projects"), voiceId: v.id("voices"), subjectType: v.union(v.literal("SELF"), v.literal("AUTHORIZED_SPEAKER")),
    subjectUserId: v.optional(v.id("users")), subjectDisplayName: v.optional(v.string()), grantedByUserId: v.id("users"),
    consentVersion: v.string(), permittedUses: v.array(voiceConsentUse), projectScope: v.literal("PROJECT"),
    grantedAt: timestamp, expiresAt: v.optional(timestamp), proofAssetId: v.optional(v.id("assets")), proofChecksum: v.optional(v.string()),
    thirdPartyDisclosureAcceptedAt: timestamp, idempotencyKey: v.string(),
  }).index("by_project", ["projectId"]).index("by_voice", ["voiceId"])
    .index("by_idempotency", ["idempotencyKey"]),

  voiceConsentEvents: defineTable({
    projectId: v.id("projects"), voiceId: v.id("voices"), consentId: v.id("voiceConsents"),
    event: v.union(v.literal("GRANTED"), v.literal("REVOKED")), actorUserId: v.id("users"),
    reason: v.optional(v.string()), idempotencyKey: v.string(), createdAt: timestamp,
  }).index("by_project", ["projectId"]).index("by_voice", ["voiceId"])
    .index("by_consent", ["consentId"]).index("by_consent_event", ["consentId", "event"]).index("by_idempotency", ["idempotencyKey"]),

  locations: defineTable({
    ...studioOwned, productionId: v.optional(v.id("productions")), productionVersionId: v.optional(v.id("productionVersions")),
    name: v.string(), profile: json, assetIds: v.array(v.id("assets")), status, createdAt: timestamp, updatedAt: timestamp,
  }).index("by_production", ["productionId"]).index("by_version", ["productionVersionId"]).index("by_studio", ["studioExternalId"]),

  products: defineTable({
    ...studioOwned, productionId: v.optional(v.id("productions")), productionVersionId: v.optional(v.id("productionVersions")),
    name: v.string(), profile: json, assetIds: v.array(v.id("assets")), status, createdAt: timestamp, updatedAt: timestamp,
  }).index("by_production", ["productionId"]).index("by_version", ["productionVersionId"]).index("by_studio", ["studioExternalId"]),

  speakerSegments: defineTable({
    ...studioOwned, productionId: v.id("productions"), audioId: v.optional(v.id("audio")), characterId: v.optional(v.id("characters")),
    speakerLabel: v.string(), startSeconds: v.number(), endSeconds: v.number(), text: v.string(), confidence: v.optional(v.number()),
    reviewed: v.boolean(), createdAt: timestamp, updatedAt: timestamp,
  }).index("by_production", ["productionId"]).index("by_audio", ["audioId"]).index("by_character", ["characterId"]).index("by_studio", ["studioExternalId"]),

  anchorPacks: defineTable({
    ...studioOwned, productionVersionId: v.id("productionVersions"), characterAssetIds: v.array(v.id("assets")),
    locationAssetIds: v.array(v.id("assets")), styleAssetIds: v.array(v.id("assets")), productAssetIds: v.array(v.id("assets")),
    approvalStatus: v.union(v.literal("DRAFT"), v.literal("APPROVED"), v.literal("REJECTED")), continuityRules: v.array(v.string()),
    qualityGate: v.optional(json), createdAt: timestamp, updatedAt: timestamp,
  }).index("by_version", ["productionVersionId"]).index("by_studio", ["studioExternalId"]),

  referencePacks: defineTable({
    ...studioOwned, projectId: v.optional(v.id("projects")), productionId: v.optional(v.id("productions")), name: v.string(),
    description: v.optional(v.string()), assetIds: v.array(v.id("assets")), purpose: v.optional(v.string()), metadata: v.optional(json),
    createdByUserId: v.optional(v.id("users")), createdAt: timestamp, updatedAt: v.optional(timestamp),
  }).index("by_studio", ["studioExternalId"]).index("by_studio_id", ["studioId"])
    .index("by_project", ["projectId"]).index("by_production", ["productionId"]),

  sequences: defineTable({
    studioExternalId: v.optional(v.string()), studioId: v.optional(v.id("studios")), projectId: v.optional(v.id("projects")), productionId: v.optional(v.id("productions")),
    productionVersionId: v.id("productionVersions"), title: v.string(), description: v.string(), orderIndex: v.number(),
    status: v.optional(status), metadata: v.optional(json),
  }).index("by_version", ["productionVersionId"]).index("by_production", ["productionId"])
    .index("by_project", ["projectId"]).index("by_studio", ["studioExternalId"]).index("by_order", ["productionVersionId", "orderIndex"]),

  scenes: defineTable({
    studioExternalId: v.optional(v.string()), studioId: v.optional(v.id("studios")), projectId: v.optional(v.id("projects")), productionId: v.optional(v.id("productions")), productionVersionId: v.optional(v.id("productionVersions")),
    sequenceId: v.id("sequences"), title: v.string(), purpose: v.string(), visualDirection: v.string(), orderIndex: v.number(),
    status: v.optional(status), metadata: v.optional(json),
  }).index("by_sequence", ["sequenceId"]).index("by_production", ["productionId"])
    .index("by_version", ["productionVersionId"]).index("by_project", ["projectId"]).index("by_studio", ["studioExternalId"]).index("by_order", ["sequenceId", "orderIndex"]),

  shots: defineTable({
    studioExternalId: v.optional(v.string()), studioId: v.optional(v.id("studios")), projectId: v.optional(v.id("projects")), productionId: v.optional(v.id("productions")), productionVersionId: v.optional(v.id("productionVersions")),
    sequenceId: v.optional(v.id("sequences")), sceneId: v.id("scenes"), title: v.string(), prompt: v.string(), durationSeconds: v.number(),
    orderIndex: v.number(), camera: json, requiredAssetIds: v.array(v.string()), referencePackIds: v.optional(v.array(v.id("referencePacks"))),
    status, metadata: v.optional(json),
  }).index("by_scene", ["sceneId"]).index("by_production", ["productionId"])
    .index("by_version", ["productionVersionId"]).index("by_project", ["projectId"]).index("by_studio", ["studioExternalId"]).index("by_order", ["sceneId", "orderIndex"]),

  shotVersions: defineTable({
    studioExternalId: v.optional(v.string()), studioId: v.optional(v.id("studios")), projectId: v.optional(v.id("projects")), productionId: v.optional(v.id("productions")),
    productionVersionId: v.optional(v.id("productionVersions")),
    shotId: v.id("shots"), versionNumber: v.number(), status, assetId: v.optional(v.id("assets")),
    promptSnapshot: v.optional(v.string()), contextSnapshot: json, model: v.optional(v.string()), provider: v.optional(v.string()),
    actualCost: v.optional(v.number()), createdAt: v.optional(timestamp),
  }).index("by_shot", ["shotId"]).index("by_shot_version", ["shotId", "versionNumber"])
    .index("by_production", ["productionId"]).index("by_version", ["productionVersionId"])
    .index("by_project", ["projectId"]).index("by_studio", ["studioExternalId"]),

  assets: defineTable({
    ...studioOwned, externalId: v.optional(v.string()), scope: v.optional(v.union(v.literal("GLOBAL"), v.literal("PROJECT"))),
    projectId: v.optional(v.id("projects")), originAssetId: v.optional(v.id("assets")), importedByUserId: v.optional(v.id("users")), importedAt: v.optional(timestamp),
    productionId: v.optional(v.id("productions")),
    source: v.string(), roles: v.array(v.string()), name: v.optional(v.string()), mimeType: v.optional(v.string()), byteSize: v.optional(v.number()),
    storageUrl: v.optional(v.string()), storageKey: v.optional(v.string()), storageId: v.optional(v.id("_storage")), checksum: v.optional(v.string()),
    width: v.optional(v.number()), height: v.optional(v.number()), durationSeconds: v.optional(v.number()), frameRate: v.optional(v.number()),
    channels: v.optional(v.number()), sampleRate: v.optional(v.number()), accessLevel: v.optional(v.string()), lifecycle: v.optional(v.string()),
    moderation: v.optional(json), provenance: v.optional(json), rights: v.optional(json), retention: v.optional(json), metadata: json,
    createdAt: timestamp, updatedAt: v.optional(timestamp), deletedAt: v.optional(timestamp),
  }).index("by_external_id", ["externalId"]).index("by_studio", ["studioExternalId"])
    .index("by_studio_id", ["studioId"]).index("by_project", ["projectId"]).index("by_production", ["productionId"])
    .index("by_checksum", ["studioExternalId", "checksum"]).index("by_storage", ["storageId"]),

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
    ...studioOwned, productionId: v.id("productions"), shotId: v.optional(v.id("shots")), shotVersionId: v.optional(v.id("shotVersions")), operation: v.optional(v.string()),
    projectId: v.optional(v.id("projects")), productionVersionId: v.optional(v.id("productionVersions")),
    createdByUserId: v.optional(v.id("users")),
    executionStage: v.optional(v.string()), submissionStartedAt: v.optional(timestamp), nextPollAt: v.optional(timestamp),
    providerBudgetReservationId: v.optional(v.id("providerBudgetReservations")),
    capability: v.optional(v.string()), modality: v.string(), provider: v.string(), model: v.string(), modelVersion: v.optional(v.string()), request: json,
    response: v.optional(json), status, progress: v.number(), estimatedCost: v.number(), estimatedProviderCostUsd: v.optional(v.number()), estimateId: v.optional(v.id("estimates")),
    idempotencyKey: v.string(), requestHash: v.optional(v.string()), reservationId: v.optional(v.id("creditReservations")), canonicalReservationId: v.optional(v.id("reservations")),
    correlationId: v.optional(v.string()), leaseId: v.optional(v.string()), leaseExpiresAt: v.optional(timestamp), nextAttemptAt: v.optional(timestamp),
    actualCost: v.optional(v.number()), providerCostUsd: v.optional(v.number()), providerRequestId: v.optional(v.string()), latencyMs: v.optional(v.number()), providerJobId: v.optional(v.string()), errorCode: v.optional(v.string()), errorMessage: v.optional(v.string()),
    attemptCount: v.number(), createdAt: timestamp, startedAt: v.optional(timestamp), completedAt: v.optional(timestamp), updatedAt: timestamp,
  }).index("by_idempotency", ["idempotencyKey"]).index("by_production", ["productionId"]).index("by_shot", ["shotId"])
    .index("by_status", ["status"]).index("by_studio", ["studioExternalId"]).index("by_provider_job", ["provider", "providerJobId"]),

  videoModelCatalog: defineTable({
    studioExternalId: v.string(), provider: v.string(), modelId: v.string(), canonicalSlug: v.optional(v.string()), name: v.optional(v.string()),
    supportsTextToVideo: v.boolean(), supportsImageReferences: v.boolean(), supportsVideoReferences: v.boolean(),
    supportsFirstFrame: v.boolean(), supportsLastFrame: v.boolean(), supportsVideoEdit: v.boolean(),
    supportsVideoExtension: v.boolean(), supportsAudio: v.boolean(), supportedDurations: v.array(v.number()),
    supportsAudioReferences: v.optional(v.boolean()), supportsPerformanceTransfer: v.optional(v.boolean()),
    supportsLipSync: v.optional(v.boolean()), supportsUpscale: v.optional(v.boolean()), supportsSourceAudioPreservation: v.optional(v.boolean()),
    supportsCombinedFrameReferences: v.optional(v.boolean()),
    reviewedOperations: v.optional(v.array(v.string())), catalogFingerprint: v.optional(v.string()), reviewedCatalogFingerprint: v.optional(v.string()),
    supportedResolutions: v.array(v.string()), supportedAspectRatios: v.array(v.string()), supportedSizes: v.optional(v.array(v.string())), supportedParameters: v.array(v.string()),
    upscaleFactor: v.optional(v.object({ min: v.number(), max: v.number() })), creativityLevels: v.optional(v.array(v.number())),
    platformQuarantinedAt: v.optional(timestamp), platformQuarantinedByUserId: v.optional(v.id('users')), platformQuarantineReason: v.optional(v.string()),
    estimatedCostPerSecond: v.optional(v.number()), pricingSkus: v.optional(json), available: v.boolean(), lastSeenAt: timestamp, reviewedAt: v.optional(timestamp),
  }).index("by_studio", ["studioExternalId"]).index("by_studio_model", ["studioExternalId", "modelId"]),

  videoRoutePolicies: defineTable({
    studioExternalId: v.string(), videoType, qualityTier: videoQualityTier, path: videoProductionPath,
    preferredModelIds: v.array(v.string()), maxCostUsd: v.optional(v.number()), updatedByUserId: v.id("users"), updatedAt: timestamp,
  }).index("by_studio", ["studioExternalId"])
    .index("by_studio_type_quality", ["studioExternalId", "videoType", "qualityTier"]),

  attempts: defineTable({
    ...studioOwned, generationJobId: v.id("generationJobs"), attemptNumber: v.number(), status, provider: v.string(), model: v.optional(v.string()),
    providerJobId: v.optional(v.string()), providerRequestId: v.optional(v.string()), latencyMs: v.optional(v.number()), requestHash: v.optional(v.string()), response: v.optional(json), errorCode: v.optional(v.string()),
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
    creationKey: v.optional(v.string()), creationHash: v.optional(v.string()),
    ...studioOwned, projectId: v.optional(v.id("projects")), productionId: v.id("productions"), manifestId: v.optional(v.id("manifests")), selectionScope: v.optional(v.string()), versionNumber: v.number(), durationSeconds: v.number(), tracks: json, outputPreset: v.string(),
    status, createdByUserId: v.optional(v.id("users")), createdAt: timestamp, updatedAt: v.optional(timestamp),
  }).index("by_production", ["productionId"]).index("by_production_version", ["productionId", "versionNumber"]).index("by_studio", ["studioExternalId"]).index("by_creation_key", ["creationKey"]),

  timelineTracks: defineTable({
    ...studioOwned, timelineId: v.id("timelines"), kind: v.string(), name: v.optional(v.string()), orderIndex: v.number(), metadata: v.optional(json),
  }).index("by_timeline", ["timelineId"]).index("by_studio", ["studioExternalId"]),

  timelineClips: defineTable({
    ...studioOwned, timelineId: v.id("timelines"), trackId: v.id("timelineTracks"), assetId: v.optional(v.id("assets")), shotVersionId: v.optional(v.id("shotVersions")),
    startSeconds: v.number(), durationSeconds: v.number(), trimStartSeconds: v.optional(v.number()), trimEndSeconds: v.optional(v.number()), volume: v.optional(v.number()),
    transition: v.optional(json), metadata: v.optional(json),
  }).index("by_timeline", ["timelineId"]).index("by_track", ["trackId"]).index("by_studio", ["studioExternalId"]),

  verifiedMediaProbes: defineTable({
    videoTiming: v.optional(v.object({ version: v.literal('DECODED_VIDEO_FRAMES_V1'), frameCount: v.number(), fpsNumerator: v.number(), fpsDenominator: v.number(), firstFrameSeconds: v.number(), durationSeconds: v.number() })),
    videoTimingSourceChecksum: v.optional(v.string()),
    videoTimingSourceStorageId: v.optional(v.id('_storage')),

    projectId: v.id('projects'), assetId: v.id('assets'), storageId: v.id('_storage'), checksum: v.string(), byteSize: v.number(),
    width: v.number(), height: v.number(), durationSeconds: v.number(), videoCodec: v.string(), hasAudio: v.boolean(), audioCodec: v.optional(v.string()), probedAt: timestamp,
  }).index('by_asset', ['assetId']),

  verifiedAudioProbes: defineTable({
    projectId: v.id('projects'), assetId: v.id('assets'), storageId: v.id('_storage'), checksum: v.string(), byteSize: v.number(),
    durationSeconds: v.number(), audioCodec: v.string(), audioFormat: v.optional(v.string()), durationMeasurement: v.optional(v.literal('DECODED_PCM_SAMPLES_V1')), sampleRate: v.number(), channels: v.number(), hasVideo: v.boolean(), probedAt: timestamp,
  }).index('by_asset', ['assetId']),

  verifiedImageProbes: defineTable({
    projectId: v.id('projects'), assetId: v.id('assets'), storageId: v.id('_storage'), checksum: v.string(), byteSize: v.number(),
    width: v.number(), height: v.number(), imageCodec: v.string(), probedAt: timestamp,
  }).index('by_asset', ['assetId']),

  recipeProposals: defineTable({
    projectId: v.id('projects'), productionId: v.id('productions'), sourcePlanId: v.id('directorPlans'), sourceDraftHash: v.string(), proposalVersion: v.literal(1), proposal: json,
    logicalShots: v.array(v.object({ key: v.string(), sequenceOrderIndex: v.number(), sceneOrderIndex: v.number(), shotOrderIndex: v.number(), descriptorHash: v.string() })),
    creationKey: v.string(), requestHash: v.string(), createdByUserId: v.id('users'), createdAt: timestamp,
  }).index('by_creation_key', ['creationKey']).index('by_production', ['productionId', 'createdAt']),

  recipeRuns: defineTable({
    projectId: v.id('projects'), productionId: v.id('productions'), productionVersionId: v.id('productionVersions'), proposalId: v.id('recipeProposals'), sourcePlanId: v.id('directorPlans'),
    directorSnapshotHash: v.string(), compiledPlanHash: v.string(), boundRecipe: json, canonicalContext: json,
    status: v.union(v.literal('PREVIEW'), v.literal('INITIALIZING'), v.literal('READY'), v.literal('RUNNING'), v.literal('WAITING_APPROVAL'), v.literal('WAITING_ESTIMATE'), v.literal('BLOCKED'), v.literal('CANCELING'), v.literal('CANCELED'), v.literal('COMPLETED'), v.literal('NEEDS_ATTENTION')),
    creationKey: v.string(), requestHash: v.string(), createdByUserId: v.id('users'), createdAt: timestamp, updatedAt: timestamp, nodeCount: v.number(), initializedNodeCount: v.number(),
    reviewedEstimateHash: v.optional(v.string()), reviewedEstimateId: v.optional(v.id('recipeEstimates')), reviewedByUserId: v.optional(v.id('users')), reviewedAt: v.optional(timestamp), cancelRequestedAt: v.optional(timestamp), errorCode: v.optional(v.string()),
    admittedMicros: v.optional(v.number()), admittedCredits: v.optional(v.number()),
  }).index('by_creation_key', ['creationKey']).index('by_project', ['projectId', 'createdAt']).index('by_production', ['productionId', 'createdAt']).index('by_status', ['status', 'updatedAt']),

  recipeRunNodes: defineTable({
    runId: v.id('recipeRuns'), projectId: v.id('projects'), productionVersionId: v.id('productionVersions'), nodeId: v.string(), orderIndex: v.number(),
    operation: v.union(v.literal('PREPARATION'), v.literal('NARRATION'), v.literal('GENERATION'), v.literal('GRAPHIC'), v.literal('SOURCE_RANGE'), v.literal('MUSIC_ANALYSIS'), v.literal('CAPTIONS'), v.literal('APPROVAL'), v.literal('TIMELINE'), v.literal('MANIFEST'), v.literal('EXPORT')),
    effect: v.union(v.literal('PAID'), v.literal('LOCAL'), v.literal('HUMAN')), dependencies: v.array(v.string()), request: json, requestHash: v.string(), idempotencyKey: v.string(),
    status: v.union(v.literal('WAITING'), v.literal('READY'), v.literal('QUEUED'), v.literal('RUNNING'), v.literal('ACCEPTED'), v.literal('WAITING_APPROVAL'), v.literal('COMPLETED'), v.literal('FAILED'), v.literal('RECONCILIATION_REQUIRED'), v.literal('CANCELED')),
    approvalTarget: v.optional(v.string()), leaseId: v.optional(v.string()), leaseExpiresAt: v.optional(timestamp), attemptCount: v.number(), linkedGenerationJobId: v.optional(v.id('generationJobs')), linkedBeatJobId: v.optional(v.id('beatAnalysisJobs')), linkedRenderJobId: v.optional(v.id('renderJobs')),
    resultId: v.optional(v.string()), resultHash: v.optional(v.string()), errorCode: v.optional(v.string()), createdAt: timestamp, updatedAt: timestamp,
    voiceVersionId: v.optional(v.id('voiceVersions')),
    allocationMicros: v.optional(v.number()), allocationCredits: v.optional(v.number()), admissionHash: v.optional(v.string()), admissionEstimateId: v.optional(v.id('recipeEstimates')), admissionModel: v.optional(v.string()), resolvedBindings: v.optional(json), resolvedRequestHash: v.optional(v.string()),
  }).index('by_run_order', ['runId', 'orderIndex']).index('by_run_node', ['runId', 'nodeId']).index('by_idempotency', ['idempotencyKey']).index('by_status', ['status', 'updatedAt']).index('by_generation_job', ['linkedGenerationJobId']).index('by_project_request', ['projectId', 'operation', 'requestHash']),

  recipeEstimates: defineTable({
    runId: v.id('recipeRuns'), projectId: v.id('projects'), revision: v.number(), compiledPlanHash: v.string(), stageNodeIds: v.array(v.string()), quoteHash: v.string(), quotes: json,
    providerCeilingMicros: v.number(), creditCeiling: v.number(), complete: v.boolean(), blockedNodeIds: v.array(v.string()), createdByUserId: v.id('users'), createdAt: timestamp, expiresAt: timestamp,
  }).index('by_run_revision', ['runId', 'revision']).index('by_run_hash', ['runId', 'quoteHash']),

  movies: defineTable({
    projectId: v.id('projects'), title: v.string(), creationKey: v.string(), requestHash: v.string(), createdByUserId: v.id('users'), createdAt: timestamp, updatedAt: timestamp, archivedAt: v.optional(timestamp),
  }).index('by_project', ['projectId', 'createdAt']).index('by_creation_key', ['creationKey']),

  movieVersions: defineTable({
    projectId: v.id('projects'), movieId: v.id('movies'), versionNumber: v.number(), parentVersionId: v.optional(v.id('movieVersions')), creationKey: v.string(), requestHash: v.string(),
    state: v.union(v.literal('VALIDATING'), v.literal('READY'), v.literal('INVALID')), output: movieOutput, componentCount: v.number(), validatedComponentCount: v.number(),
    durationInFrames: v.optional(v.number()), contentHash: v.optional(v.string()), confirmedRetainedVersions: v.boolean(), createdByUserId: v.id('users'), createdAt: timestamp, validatedAt: v.optional(timestamp), errorCode: v.optional(v.string()),
  }).index('by_movie_version', ['movieId', 'versionNumber']).index('by_creation_key', ['creationKey']).index('by_project', ['projectId', 'createdAt']).index('by_state', ['state', 'createdAt']),

  movieComponents: defineTable({
    projectId: v.id('projects'), movieVersionId: v.id('movieVersions'), orderIndex: v.number(), chapterId: v.string(), chapterTitle: v.string(), productionId: v.id('productions'), productionVersionId: v.id('productionVersions'),
    timelineId: v.id('timelines'), timelineVersionNumber: v.number(), manifestId: v.id('manifests'), episodeId: v.optional(v.id('episodes')), episodeStoryStateId: v.optional(v.id('episodeStoryStates')), continuityBibleId: v.optional(v.id('continuityBibles')),
    validationState: v.union(v.literal('PENDING'), v.literal('VALIDATED'), v.literal('INVALID')), sourceManifestSha256: v.optional(v.string()), rendererVersion: v.optional(v.string()), startFrame: v.optional(v.number()), durationInFrames: v.optional(v.number()),
    sourceMap: v.optional(v.array(movieSource)), errorCode: v.optional(v.string()), createdAt: timestamp,
  }).index('by_version_order', ['movieVersionId', 'orderIndex']).index('by_version_start', ['movieVersionId', 'startFrame']).index('by_version_chapter', ['movieVersionId', 'chapterId', 'orderIndex']).index('by_manifest', ['manifestId']),

  movieExports: defineTable({
    mediaAbi: v.optional(v.string()),
    projectId: v.id('projects'), movieVersionId: v.id('movieVersions'), requestedByUserId: v.id('users'), idempotencyKey: v.string(), requestHash: v.string(), purpose: v.union(v.literal('REVIEW'), v.literal('DELIVERY')), approvedReviewId: v.optional(v.id('movieReviews')),
    selection: v.object({ scope: v.union(v.literal('MOVIE'), v.literal('CHAPTERS'), v.literal('SCENES'), v.literal('SHOTS')), chapterIds: v.optional(v.array(v.string())), occurrences: v.optional(v.array(v.object({ componentId: v.id('movieComponents'), sceneId: v.optional(v.id('scenes')), shotVersionId: v.optional(v.id('shotVersions')) }))) }),
    outputHash: v.string(), planHash: v.string(), partCount: v.number(), readyPartCount: v.number(), durationInFrames: v.number(),
    status: v.union(v.literal('QUEUED'), v.literal('RENDERING_COMPONENTS'), v.literal('MERGING'), v.literal('COMPLETED'), v.literal('FAILED'), v.literal('CANCELED'), v.literal('NEEDS_ATTENTION')),
    mergeJobId: v.optional(v.id('movieMergeJobs')), storageId: v.optional(v.id('_storage')), checksum: v.optional(v.string()), byteSize: v.optional(v.number()), verification: v.optional(movieArtifactVerification), errorCode: v.optional(v.string()),
    createdAt: timestamp, updatedAt: timestamp, completedAt: v.optional(timestamp), canceledAt: v.optional(timestamp),
  }).index('by_version', ['movieVersionId', 'createdAt']).index('by_project', ['projectId', 'createdAt']).index('by_idempotency', ['idempotencyKey']).index('by_status', ['status', 'updatedAt']),

  movieExportParts: defineTable({
    projectId: v.id('projects'), movieExportId: v.id('movieExports'), componentId: v.id('movieComponents'), orderIndex: v.number(), sourceStartFrame: v.number(), durationInFrames: v.number(), outputStartFrame: v.number(), sourceManifestSha256: v.string(),
    status: v.union(v.literal('WAITING_RENDER'), v.literal('READY'), v.literal('FAILED'), v.literal('CANCELED')), renderJobId: v.optional(v.id('renderJobs')), exportId: v.optional(v.id('exports')), storageId: v.optional(v.id('_storage')),
    checksum: v.optional(v.string()), byteSize: v.optional(v.number()), verification: v.optional(moviePartVerification), reused: v.boolean(), errorCode: v.optional(v.string()), createdAt: timestamp, updatedAt: timestamp,
  }).index('by_export_order', ['movieExportId', 'orderIndex']).index('by_render_job', ['renderJobId']).index('by_component', ['componentId']),

  movieMergeJobs: defineTable({
    mediaAbi: v.optional(v.string()),
    projectId: v.id('projects'), movieVersionId: v.id('movieVersions'), movieExportId: v.id('movieExports'), planHash: v.string(), idempotencyKey: v.string(), requestHash: v.string(), createdByUserId: v.id('users'),
    status: v.union(v.literal('QUEUED'), v.literal('PROCESSING'), v.literal('COMPLETED'), v.literal('FAILED'), v.literal('CANCELED'), v.literal('NEEDS_ATTENTION')), executionStage: v.string(), progress: v.number(), attempt: v.number(),
    leaseId: v.optional(v.string()), leaseExpiresAt: v.optional(timestamp), dispatchLeaseId: v.optional(v.string()), dispatchLeaseExpiresAt: v.optional(timestamp), dispatchPayload: v.optional(json), callbackIdempotencyKey: v.optional(v.string()),
    dispatchRetryCount: v.number(), nextDispatchAt: v.optional(timestamp), acceptedAt: v.optional(timestamp), startedAt: v.optional(timestamp), lastHeartbeatAt: v.optional(timestamp), lastHeartbeatOccurredAt: v.optional(timestamp), errorCode: v.optional(v.string()),
    createdAt: timestamp, updatedAt: timestamp, completedAt: v.optional(timestamp),
  }).index('by_export', ['movieExportId']).index('by_idempotency', ['idempotencyKey']).index('by_status', ['status', 'nextDispatchAt']).index('by_project', ['projectId', 'createdAt']),

  movieMergeCallbackReceipts: defineTable({
    jobId: v.id('movieMergeJobs'), projectId: v.id('projects'), eventId: v.string(), idempotencyKey: v.string(), eventType: v.string(), attempt: v.number(), occurredAt: timestamp, receivedAt: timestamp, payloadHash: v.string(), signature: v.optional(v.string()), status: v.string(),
  }).index('by_event_id', ['eventId']).index('by_idempotency', ['idempotencyKey']).index('by_job', ['jobId']),

  movieReviews: defineTable({
    projectId: v.id('projects'), movieVersionId: v.id('movieVersions'), movieExportId: v.id('movieExports'), planHash: v.string(), creationKey: v.string(), requestHash: v.string(), requestedByUserId: v.id('users'), createdAt: timestamp, updatedAt: timestamp,
  }).index('by_export', ['movieExportId']).index('by_version', ['movieVersionId', 'createdAt']).index('by_project', ['projectId', 'createdAt']).index('by_creation_key', ['creationKey']),

  movieReviewComments: defineTable({
    projectId: v.id('projects'), reviewId: v.id('movieReviews'), authorUserId: v.optional(v.id('users')), authorName: v.optional(v.string()), reviewLinkId: v.optional(v.id('movieReviewLinks')), clientRequestId: v.optional(v.string()), body: v.string(),
    movieFrame: v.number(), componentId: v.id('movieComponents'), componentFrame: v.number(), contributors: v.array(movieSource), resolvedAt: v.optional(timestamp), createdAt: timestamp,
  }).index('by_review', ['reviewId', 'createdAt']).index('by_link_request', ['reviewLinkId', 'clientRequestId']),

  movieReviewLinks: defineTable({
    projectId: v.id('projects'), movieVersionId: v.id('movieVersions'), movieExportId: v.id('movieExports'), reviewId: v.id('movieReviews'), planHash: v.string(), tokenHash: v.string(), label: v.string(), createdByUserId: v.id('users'), expiresAt: timestamp, createdAt: timestamp, revokedAt: v.optional(timestamp),
  }).index('by_token_hash', ['tokenHash']).index('by_review', ['reviewId']).index('by_project', ['projectId', 'createdAt']),

  mediaDerivationJobs: defineTable({
    projectId: v.id('projects'), studioId: v.optional(v.id('studios')), studioExternalId: v.string(), createdByUserId: v.id('users'),
    sourceAssetId: v.id('assets'), sourceStorageId: v.id('_storage'), sourceChecksum: v.string(), sourceAssetChecksum: v.string(), sourceStorageChecksum: v.string(), sourceByteSize: v.number(),
    profile: v.literal('VIDEO_AUDIO_WAV_48K_STEREO_V1'), startSample: v.number(), sampleCount: v.number(), requestHash: v.string(), idempotencyKey: v.string(),
    status: v.union(v.literal('QUEUED'), v.literal('PROCESSING'), v.literal('RETRYING'), v.literal('COMPLETED'), v.literal('FAILED'), v.literal('CANCELED')),
    attemptCount: v.number(), nextAttemptAt: v.optional(v.number()), leaseId: v.optional(v.string()), leaseExpiresAt: v.optional(v.number()), cancelRequestedAt: v.optional(v.number()),
    leaseHistory: v.optional(v.array(v.object({leaseId:v.string(), attemptNumber:v.number(), startedAt:v.number(), expiresAt:v.number()}))),
    privateOutputs: v.optional(v.array(v.object({storageId:v.id('_storage'), checksum:v.string(), byteSize:v.number(), sampleCount:v.number(), sourceDurationSeconds:v.number(), leaseId:v.string(), attemptNumber:v.number(), createdAt:v.number(), expiresAt:v.number()}))),
    resultAssetId: v.optional(v.id('assets')), resultStorageId: v.optional(v.id('_storage')), resultChecksum: v.optional(v.string()), resultByteSize: v.optional(v.number()), actualSampleCount: v.optional(v.number()), sourceDurationSeconds: v.optional(v.number()),
    errorCode: v.optional(v.string()), createdAt: v.number(), updatedAt: v.number(), completedAt: v.optional(v.number()),
  }).index('by_project', ['projectId', 'createdAt']).index('by_status', ['status']).index('by_key', ['idempotencyKey']),

  beatAnalysisJobs: defineTable({
    projectId: v.id('projects'), assetId: v.id('assets'), storageId: v.id('_storage'), sourceChecksum: v.string(), assetChecksum: v.string(), algorithmVersion: v.string(),
    requestHash: v.string(), idempotencyKey: v.string(), status: v.union(v.literal('QUEUED'), v.literal('PROCESSING'), v.literal('RETRYING'), v.literal('COMPLETED'), v.literal('FAILED'), v.literal('CANCELED')),
    createdByUserId: v.id('users'), attemptCount: v.number(), leaseId: v.optional(v.string()), leaseExpiresAt: v.optional(timestamp), nextAttemptAt: v.optional(timestamp),
    analysisVersionId: v.optional(v.id('beatAnalysisVersions')), errorCode: v.optional(v.string()), createdAt: timestamp, updatedAt: timestamp, completedAt: v.optional(timestamp),
  }).index('by_project', ['projectId', 'createdAt']).index('by_asset', ['assetId', 'createdAt']).index('by_idempotency', ['idempotencyKey']).index('by_status', ['status', 'nextAttemptAt']),

  beatAnalysisVersions: defineTable({
    projectId: v.id('projects'), assetId: v.id('assets'), storageId: v.id('_storage'), sourceChecksum: v.string(), assetChecksum: v.string(), algorithmVersion: v.string(),
    sourceJobId: v.optional(v.id('beatAnalysisJobs')), parentVersionId: v.optional(v.id('beatAnalysisVersions')), origin: v.union(v.literal('AUTO'), v.literal('MANUAL')),
    outcome: v.union(v.literal('RELIABLE'), v.literal('AMBIGUOUS'), v.literal('SILENT'), v.literal('NO_GRID'), v.literal('MANUAL')), durationSeconds: v.number(), sampleRate: v.number(),
    beatsSeconds: v.array(v.number()), confidence: v.number(), tempoBpm: v.optional(v.number()),
    tempoSegments: v.optional(v.array(v.object({ startSeconds: v.number(), endSeconds: v.number(), bpm: v.number(), confidence: v.number() }))),
    reasonCode: v.string(), createdByUserId: v.id('users'), createdAt: timestamp, correctionNote: v.optional(v.string()),
    creationKey: v.optional(v.string()), requestHash: v.optional(v.string()),
  }).index('by_project', ['projectId', 'createdAt']).index('by_asset', ['assetId', 'createdAt']).index('by_source', ['projectId', 'assetId', 'sourceChecksum', 'algorithmVersion']).index('by_parent', ['parentVersionId']).index('by_creation_key', ['creationKey']),

  renderJobs: defineTable({
    movieComponentId: v.optional(v.id('movieComponents')),
    movieMediaAbi: v.optional(v.string()),
    ...studioOwned, projectId: v.optional(v.id("projects")), productionId: v.id("productions"), timelineId: v.optional(v.id("timelines")), manifestId: v.optional(v.id("manifests")), selectionScope: v.optional(v.string()), exportScope: v.optional(v.string()), operation: v.string(), preset: v.string(),
    status, idempotencyKey: v.string(), requestHash: v.optional(v.string()), progress: v.number(), estimatedCost: v.optional(v.number()), actualCost: v.optional(v.number()),
    createdByUserId: v.optional(v.id("users")), executionStage: v.optional(v.string()), dispatchAttempt: v.optional(v.number()),
    dispatchPayload: v.optional(json), dispatchStartedAt: v.optional(timestamp), acceptedAt: v.optional(timestamp),
    lastHeartbeatAt: v.optional(timestamp), lastHeartbeatOccurredAt: v.optional(timestamp),
    dispatchLeaseId: v.optional(v.string()), dispatchLeaseExpiresAt: v.optional(timestamp), nextDispatchAt: v.optional(timestamp),
    callbackIdempotencyKey: v.optional(v.string()),
    dispatchRetryCount: v.optional(v.number()),
    providerJobId: v.optional(v.string()), leaseId: v.optional(v.string()), leaseExpiresAt: v.optional(timestamp), errorCode: v.optional(v.string()), errorMessage: v.optional(v.string()),
    createdAt: timestamp, startedAt: v.optional(timestamp), completedAt: v.optional(timestamp), updatedAt: timestamp,
  }).index("by_idempotency", ["idempotencyKey"]).index("by_production", ["productionId"]).index("by_status", ["status"]).index("by_studio", ["studioExternalId"]),

  renderCallbackReceipts: defineTable({
    jobId: v.id("renderJobs"), projectId: v.optional(v.id("projects")), eventId: v.string(), idempotencyKey: v.string(),
    eventType: v.string(), attempt: v.number(), occurredAt: timestamp, receivedAt: timestamp, payloadHash: v.string(),
    signature: v.optional(v.string()), status: v.string(),
  }).index("by_event_id", ["eventId"]).index("by_idempotency", ["idempotencyKey"])
    .index("by_job", ["jobId"]).index("by_project", ["projectId"]),

  renderUploadRenewals: defineTable({
    jobId: v.union(v.id('renderJobs'), v.id('movieMergeJobs')), projectId: v.id('projects'),
    actorId: v.id('users'), leaseId: v.string(), attempt: v.number(), idempotencyKey: v.string(), identity: v.string(),
    byteSize: v.number(), checksum: v.string(), mimeType: v.string(), uploadUrl: v.string(), issuedAt: timestamp,
  }).index('by_job_attempt', ['jobId', 'attempt']),

  manifests: defineTable({
    ...studioOwned, projectId: v.optional(v.id("projects")), productionId: v.id("productions"), timelineId: v.optional(v.id("timelines")), contractVersion: v.optional(v.number()), selectionScope: v.optional(v.string()), exportScope: v.optional(v.string()), selectionIds: v.optional(v.array(v.string())), versionNumber: v.number(), manifest: json, sourceHashes: v.array(v.string()),
    rendererVersion: v.optional(v.string()), templateVersions: v.optional(json), createdAt: timestamp,
  }).index("by_production", ["productionId"]).index("by_timeline", ["timelineId"]).index("by_studio", ["studioExternalId"]),

  exports: defineTable({
    ...studioOwned, projectId: v.optional(v.id("projects")), productionId: v.id("productions"), renderJobId: v.optional(v.id("renderJobs")), manifestId: v.optional(v.id("manifests")), assemblyJobId: v.optional(v.id("assemblyJobs")), selectionScope: v.optional(v.string()), exportScope: v.optional(v.string()), progress: v.optional(v.number()), downloadReadyAt: v.optional(timestamp), downloadExpiresAt: v.optional(timestamp),
    preset: v.string(), status, storageId: v.optional(v.id("_storage")), storageKey: v.optional(v.string()), outputUrl: v.optional(v.string()), checksum: v.optional(v.string()),
    mimeType: v.optional(v.string()), errorMessage: v.optional(v.string()), createdAt: timestamp, completedAt: v.optional(timestamp),
  }).index("by_production", ["productionId"]).index("by_render_job", ["renderJobId"]).index("by_studio", ["studioExternalId"]),

  reviews: defineTable({
    projectId: v.optional(v.id("projects")), manifestId: v.optional(v.id("manifests")), timelineId: v.optional(v.id("timelines")), timelineVersionNumber: v.optional(v.number()), exportId: v.optional(v.id("exports")),
    ...studioOwned, productionId: v.id("productions"), status: v.union(v.literal("DRAFT"), v.literal("REQUESTED"), v.literal("APPROVED"), v.literal("CHANGES_REQUESTED")),
    shareTokenHash: v.optional(v.string()), requestedByUserId: v.optional(v.id("users")), createdAt: timestamp, updatedAt: timestamp,
  }).index("by_production", ["productionId"]).index("by_studio", ["studioExternalId"]).index("by_status", ["status"]),

  comments: defineTable({
    reviewLinkId: v.optional(v.id("reviewLinks")), authorName: v.optional(v.string()), clientRequestId: v.optional(v.string()),
    ...studioOwned, reviewId: v.id("reviews"), authorExternalId: v.optional(v.string()), authorUserId: v.optional(v.id("users")), body: v.string(),
    timeSeconds: v.optional(v.number()), shotId: v.optional(v.id("shots")), resolvedAt: v.optional(timestamp), createdAt: timestamp,
  }).index("by_review", ["reviewId"]).index("by_shot", ["shotId"]).index("by_studio", ["studioExternalId"]).index("by_review_link_request", ["reviewLinkId", "clientRequestId"]),

  reviewLinks: defineTable({
    projectId: v.id("projects"), productionId: v.id("productions"), reviewId: v.id("reviews"), timelineId: v.id("timelines"),
    timelineVersionNumber: v.number(), manifestId: v.id("manifests"), exportId: v.optional(v.id("exports")),
    label: v.string(), tokenHash: v.string(), expiresAt: timestamp, revokedAt: v.optional(timestamp), createdByUserId: v.id("users"), createdAt: timestamp,
  }).index("by_token_hash", ["tokenHash"]).index("by_project", ["projectId"]).index("by_review", ["reviewId"]),

  approvals: defineTable({
    ...studioOwned, projectId: v.optional(v.id("projects")), productionId: v.optional(v.id("productions")), reviewId: v.optional(v.id("reviews")), resourceType: v.string(), resourceId: v.string(), decision: v.string(),
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
    .index("by_idempotency", ["idempotencyKey"]).index("by_reservation", ["reservationId"]).index("by_created_at", ["studioExternalId", "createdAt"]),

  payments: defineTable({
    ...studioOwned, provider: v.string(), providerCheckoutId: v.optional(v.string()), providerPaymentId: v.optional(v.string()), amount: v.number(), currency: v.string(), credits: v.number(), reference: v.string(), status, metadata: json, createdAt: timestamp,
  }).index("by_reference", ["reference"]).index("by_checkout", ["providerCheckoutId"]).index("by_studio", ["studioExternalId"]),

  purchases: defineTable({
    ...studioOwned, provider: v.string(), providerCheckoutId: v.optional(v.string()), providerPaymentId: v.optional(v.string()), amount: v.number(), currency: v.string(), credits: v.number(),
    reference: v.string(), status: v.optional(status), idempotencyKey: v.optional(v.string()), metadata: json, createdAt: timestamp, completedAt: v.optional(timestamp), supersedesPurchaseId: v.optional(v.id("purchases")),
  }).index("by_reference", ["reference"]).index("by_checkout", ["providerCheckoutId"])
    .index("by_provider_payment", ["provider", "providerPaymentId"]).index("by_idempotency", ["idempotencyKey"]).index("by_status", ["status"]).index("by_studio", ["studioExternalId"]),

  paymentEvents: defineTable({
    studioExternalId: v.optional(v.string()), studioId: v.optional(v.id("studios")), provider: v.string(), providerEventId: v.string(), eventType: v.string(), payload: json,
    purchaseId: v.optional(v.id("purchases")), receivedAt: v.optional(timestamp), processedAt: v.optional(timestamp), createdAt: timestamp,
  }).index("by_provider_event", ["provider", "providerEventId"]).index("by_purchase", ["purchaseId"]).index("by_studio", ["studioExternalId"]),

  refunds: defineTable({
    ...studioOwned, purchaseId: v.optional(v.id("purchases")), provider: v.string(), providerRefundId: v.optional(v.string()), amount: v.number(), currency: v.string(),
    reason: v.string(), status: v.optional(status), idempotencyKey: v.optional(v.string()), metadata: json, createdAt: timestamp, completedAt: v.optional(timestamp), supersedesRefundId: v.optional(v.id("refunds")),
  }).index("by_purchase", ["purchaseId"]).index("by_provider_refund", ["provider", "providerRefundId"]).index("by_idempotency", ["idempotencyKey"]).index("by_status", ["status"]).index("by_studio", ["studioExternalId"]),

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

  // Explicit graph edges are additive to the existing production hierarchy.
  // They make upstream/downstream impact durable without making Canvas layout
  // the source of truth for production meaning.
  productionDependencies: defineTable({
    studioExternalId: v.string(), studioId: v.optional(v.id("studios")), productionId: v.id("productions"),
    productionVersionId: v.optional(v.id("productionVersions")), sourceType: v.string(), sourceId: v.string(),
    sourceVersionId: v.optional(v.string()), targetType: v.string(), targetId: v.string(), targetVersionId: v.optional(v.string()),
    kind: v.union(v.literal("contains"), v.literal("references"), v.literal("derivedFrom"), v.literal("feeds"), v.literal("placedOn"), v.literal("reviewedBy"), v.literal("rendersTo")),
    state: v.union(v.literal("ACTIVE"), v.literal("OUTDATED"), v.literal("BROKEN")), reason: v.optional(v.string()),
    createdAt: timestamp, updatedAt: timestamp,
  }).index("by_production", ["productionId"]).index("by_source", ["sourceType", "sourceId"])
    .index("by_target", ["targetType", "targetId"]).index("by_version", ["productionVersionId"])
    .index("by_studio", ["studioExternalId"]),

  // Every user-facing Canvas/editor action is an auditable command. The
  // operation record is intentionally separate from provider jobs so prompt
  // edits and deterministic timeline edits share one recovery model.
  productionOperations: defineTable({
    studioExternalId: v.string(), studioId: v.optional(v.id("studios")), productionId: v.id("productions"),
    productionVersionId: v.optional(v.id("productionVersions")), kind: v.string(), targetType: v.string(), targetId: v.string(),
    targetVersionId: v.optional(v.string()), input: json, requestHash: v.optional(v.string()), idempotencyKey: v.string(),
    status, actorUserId: v.optional(v.id("users")), actorExternalId: v.optional(v.string()), correlationId: v.optional(v.string()),
    estimateId: v.optional(v.id("estimates")), reservationId: v.optional(v.id("reservations")), outputResourceIds: v.array(v.string()),
    undoOfId: v.optional(v.id("productionOperations")), redoOfId: v.optional(v.id("productionOperations")),
    userSafeError: v.optional(v.string()), createdAt: timestamp, updatedAt: timestamp, completedAt: v.optional(timestamp),
  }).index("by_production", ["productionId"]).index("by_idempotency", ["idempotencyKey"])
    .index("by_status", ["status"]).index("by_target", ["targetType", "targetId"])
    .index("by_studio", ["studioExternalId"]),

  // Canvas positions and collapsed groups are presentation preferences, not
  // production state. Keeping them separate lets the graph remain portable.
  canvasLayouts: defineTable({
    studioExternalId: v.string(), studioId: v.optional(v.id("studios")), productionId: v.id("productions"),
    productionVersionId: v.optional(v.id("productionVersions")), layoutVersion: v.number(), layout: json,
    selectedNodeId: v.optional(v.string()), viewport: v.optional(json), mobileOrder: v.optional(v.array(v.string())),
    createdByUserId: v.optional(v.id("users")), updatedAt: timestamp,
  }).index("by_production", ["productionId"]).index("by_version", ["productionVersionId"])
    .index("by_studio", ["studioExternalId"]),

  // Canonical production snapshots. Draft versions are mutable only through
  // the canonical productions path; approved versions are immutable snapshots.
  productionVersions: defineTable({
    productionId: v.id("productions"), versionNumber: v.number(), status, sourcePlanId: v.id("directorPlans"),
    idempotencyKey: v.optional(v.string()), snapshot: v.optional(json), planningContextSnapshot: v.optional(json), approvedByUserId: v.optional(v.id("users")),
    approvedAt: v.optional(timestamp), createdAt: timestamp, updatedAt: v.optional(timestamp),
  }).index("by_production", ["productionId"]).index("by_production_version", ["productionId", "versionNumber"]).index("by_source_plan", ["sourcePlanId"])
    .index("by_idempotency", ["idempotencyKey"]),
  priceRules: defineTable({ operation: v.string(), qualityTier: v.string(), unit: v.string(), creditsPerUnit: v.number(), enabled: v.boolean() }).index("by_operation", ["operation", "qualityTier"]),
  creditReservations: defineTable({
    studioExternalId: v.string(), generationJobId: v.optional(v.id("generationJobs")), amount: v.number(), idempotencyKey: v.string(), status, expiresAt: timestamp, createdAt: timestamp,
    committedAt: v.optional(timestamp), releasedAt: v.optional(timestamp), actualAmount: v.optional(v.number()),
  }).index("by_idempotency", ["idempotencyKey"]).index("by_studio", ["studioExternalId"]).index("by_generation_job", ["generationJobId"]),
  creditTransactions: defineTable({
    studioExternalId: v.string(), delta: v.number(), transactionType: v.string(), source: v.string(), referenceId: v.optional(v.string()), metadata: json, createdAt: timestamp,
  }).index("by_studio", ["studioExternalId"]),
  assemblyJobs: defineTable({
    projectId: v.optional(v.id("projects")), productionId: v.id("productions"), manifestId: v.optional(v.id("manifests")), selectionScope: v.optional(v.string()), exportScope: v.optional(v.string()), idempotencyKey: v.optional(v.string()), progress: v.optional(v.number()), status, manifest: json, outputUrl: v.optional(v.string()), errorMessage: v.optional(v.string()), rendererJobId: v.optional(v.string()), correlationId: v.optional(v.string()), createdAt: timestamp, updatedAt: timestamp, completedAt: v.optional(timestamp),
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
