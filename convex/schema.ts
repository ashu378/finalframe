import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const timestamp = v.number();
const json = v.any();

export default defineSchema({
  users: defineTable({
    externalId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    createdAt: timestamp,
    updatedAt: timestamp,
  }).index("by_external_id", ["externalId"]),

  studios: defineTable({
    externalId: v.string(),
    ownerExternalId: v.string(),
    name: v.string(),
    credits: v.number(),
    createdAt: timestamp,
    updatedAt: timestamp,
  }).index("by_external_id", ["externalId"]).index("by_owner", ["ownerExternalId"]),

  projects: defineTable({
    externalId: v.string(),
    studioExternalId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    createdAt: timestamp,
    updatedAt: timestamp,
  }).index("by_external_id", ["externalId"]).index("by_studio", ["studioExternalId"]),

  assets: defineTable({
    externalId: v.optional(v.string()),
    studioExternalId: v.string(),
    productionId: v.optional(v.id("productions")),
    source: v.string(),
    roles: v.array(v.string()),
    name: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    storageUrl: v.optional(v.string()),
    metadata: json,
    createdAt: timestamp,
  }).index("by_external_id", ["externalId"]).index("by_studio", ["studioExternalId"]).index("by_production", ["productionId"]),

  productions: defineTable({
    externalProjectId: v.string(),
    studioExternalId: v.string(),
    workflow: v.string(),
    inputMode: v.string(),
    requestedDurationSeconds: v.number(),
    language: v.string(),
    outputPreset: v.string(),
    status: v.string(),
    currentVersionId: v.optional(v.id("productionVersions")),
    createdAt: timestamp,
    updatedAt: timestamp,
  }).index("by_project", ["externalProjectId"]).index("by_studio", ["studioExternalId"]),

  directorPlans: defineTable({
    productionId: v.id("productions"),
    input: json,
    plan: json,
    estimate: json,
    status: v.string(),
    createdAt: timestamp,
    approvedAt: v.optional(timestamp),
  }).index("by_production", ["productionId"]),

  productionVersions: defineTable({
    productionId: v.id("productions"),
    versionNumber: v.number(),
    status: v.string(),
    sourcePlanId: v.id("directorPlans"),
    approvedAt: v.optional(timestamp),
    createdAt: timestamp,
  }).index("by_production", ["productionId"]),

  productionBibles: defineTable({
    productionVersionId: v.id("productionVersions"),
    projectContext: json,
    characters: json,
    locations: json,
    products: json,
    style: json,
    story: json,
  }).index("by_version", ["productionVersionId"]),

  sequences: defineTable({
    productionVersionId: v.id("productionVersions"),
    title: v.string(),
    description: v.string(),
    orderIndex: v.number(),
  }).index("by_version", ["productionVersionId"]),

  scenes: defineTable({
    sequenceId: v.id("sequences"),
    title: v.string(),
    purpose: v.string(),
    visualDirection: v.string(),
    orderIndex: v.number(),
  }).index("by_sequence", ["sequenceId"]),

  shots: defineTable({
    sceneId: v.id("scenes"),
    title: v.string(),
    prompt: v.string(),
    durationSeconds: v.number(),
    orderIndex: v.number(),
    camera: json,
    requiredAssetIds: v.array(v.string()),
    status: v.string(),
  }).index("by_scene", ["sceneId"]),

  shotVersions: defineTable({
    shotId: v.id("shots"),
    versionNumber: v.number(),
    status: v.string(),
    assetId: v.optional(v.id("assets")),
    promptSnapshot: v.optional(v.string()),
    contextSnapshot: json,
  }).index("by_shot", ["shotId"]),

  generationJobs: defineTable({
    productionId: v.id("productions"),
    shotId: v.id("shots"),
    shotVersionId: v.id("shotVersions"),
    studioExternalId: v.string(),
    modality: v.string(),
    provider: v.string(),
    model: v.string(),
    request: json,
    response: v.optional(json),
    status: v.string(),
    progress: v.number(),
    estimatedCost: v.number(),
    idempotencyKey: v.string(),
    providerJobId: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    attemptCount: v.number(),
    createdAt: timestamp,
    startedAt: v.optional(timestamp),
    completedAt: v.optional(timestamp),
    updatedAt: timestamp,
  }).index("by_idempotency", ["idempotencyKey"]).index("by_production", ["productionId"]).index("by_status", ["status"]),

  priceRules: defineTable({
    operation: v.string(),
    qualityTier: v.string(),
    unit: v.string(),
    creditsPerUnit: v.number(),
    enabled: v.boolean(),
  }).index("by_operation", ["operation", "qualityTier"]),

  creditReservations: defineTable({
    studioExternalId: v.string(),
    generationJobId: v.optional(v.id("generationJobs")),
    amount: v.number(),
    idempotencyKey: v.string(),
    status: v.string(),
    expiresAt: timestamp,
    createdAt: timestamp,
    committedAt: v.optional(timestamp),
    releasedAt: v.optional(timestamp),
  }).index("by_idempotency", ["idempotencyKey"]).index("by_studio", ["studioExternalId"]),

  creditTransactions: defineTable({
    studioExternalId: v.string(),
    delta: v.number(),
    transactionType: v.string(),
    source: v.string(),
    referenceId: v.optional(v.string()),
    metadata: json,
    createdAt: timestamp,
  }).index("by_studio", ["studioExternalId"]),

  assemblyJobs: defineTable({
    productionId: v.id("productions"),
    status: v.string(),
    manifest: json,
    outputUrl: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    createdAt: timestamp,
    updatedAt: timestamp,
  }).index("by_production", ["productionId"]),

  paymentPurchases: defineTable({
    studioExternalId: v.string(),
    provider: v.string(),
    providerCheckoutId: v.optional(v.string()),
    amount: v.number(),
    currency: v.string(),
    credits: v.number(),
    reference: v.string(),
    status: v.string(),
    metadata: json,
    createdAt: timestamp,
    completedAt: v.optional(timestamp),
  }).index("by_reference", ["reference"]).index("by_studio", ["studioExternalId"]),

  paymentEvents: defineTable({
    provider: v.string(),
    providerEventId: v.string(),
    eventType: v.string(),
    payload: json,
    processedAt: v.optional(timestamp),
    createdAt: timestamp,
  }).index("by_provider_event", ["provider", "providerEventId"]),
});
