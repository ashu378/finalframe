import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { api } from "../../convex/_generated/api.js";
import { createAuthenticatedClient } from "../../scripts/dev-fixture/client.mjs";

const clientResult = await createAuthenticatedClient();
const client = clientResult.client;
const marker = `finalframe-voice-foundation-${randomUUID()}`;
const projects = [];
const projectStudioExternalId = { value: undefined };
const passed = [];

function record(name) {
  passed.push(name);
  console.log(`PASS ${name}`);
}

async function expectFailure(name, operation, includes) {
  try {
    await operation();
    throw new Error(`${name}: operation unexpectedly succeeded`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("operation unexpectedly succeeded")) throw error;
    assert(message.toLowerCase().includes(includes.toLowerCase()), `${name}: unexpected error: ${message}`);
    record(name);
  }
}

try {
  for (const suffix of ["one", "two"]) {
    const project = await client.mutation(api.projects.create, {
      name: `${marker} ${suffix}`,
      projectType: "VOICE_FOUNDATION_TEST",
      description: "Temporary online Convex voice foundation test; soft-deleted after verification.",
    });
    projects.push(project.projectId);
    projectStudioExternalId.value = project.studioExternalId;
  }

  const [projectId, otherProjectId] = projects;
  const created = await client.mutation(api.voices.create, {
    projectId,
    kind: "CLONED",
    name: "Consent test voice",
    description: "No provider is called by this test.",
    language: "en",
    idempotencyKey: `${marker}:create`,
  });
  assert.equal(created.status, "CONSENT_REQUIRED");
  const replay = await client.mutation(api.voices.create, {
    projectId,
    kind: "CLONED",
    name: "Consent test voice",
    description: "No provider is called by this test.",
    language: "en",
    idempotencyKey: `${marker}:create`,
  });
  assert.equal(replay.voiceId, created.voiceId);
  assert.equal(replay.replayed, true);
  const resourceState = await client.query(api.resourceStates.get, { projectId, resourceType: "voice", resourceId: created.voiceId });
  assert.equal(resourceState.state, "DRAFT");
  record("project-scoped voice creation and idempotency");

  const list = await client.query(api.voices.list, { projectId, limit: 10 });
  const listed = list.find((voice) => voice._id === created.voiceId);
  assert(listed, "created voice is missing from its project list");
  assert(!("providerVoiceId" in listed) && !("providerMetadata" in listed), "private provider fields escaped the list projection");
  record("voice listing excludes provider identifiers and metadata");

  await expectFailure("cross-project voice read denial", () => client.query(api.voices.get, { projectId: otherProjectId, voiceId: created.voiceId }), "voice not found");

  await client.mutation(api.approvals.submitForReview, { projectId, resourceType: "voice", resourceId: created.voiceId });
  await expectFailure("voice without recordings or consent cannot be approved", () => client.mutation(api.approvals.approve, { projectId, resourceType: "voice", resourceId: created.voiceId }), "ready recordings");
  await client.mutation(api.approvals.requestRevision, { projectId, resourceType: "voice", resourceId: created.voiceId, note: "Complete sample and consent before review." });

  const consentArgs = {
    projectId,
    voiceId: created.voiceId,
    subjectType: "SELF",
    consentVersion: "voice-consent-v1",
    permittedUses: ["TRAIN", "SYNTHESIZE", "AVATAR_LIPSYNC"],
    consentConfirmed: true,
    thirdPartyDisclosureAccepted: true,
    idempotencyKey: `${marker}:consent`,
  };
  const consent = await client.mutation(api.voices.grantConsent, consentArgs);
  assert.equal(consent.status, "DRAFT");
  const consentReplay = await client.mutation(api.voices.grantConsent, consentArgs);
  assert.equal(consentReplay.consentId, consent.consentId);
  assert.equal(consentReplay.replayed, true);
  await expectFailure("missing affirmative consent rejected", () => client.mutation(api.voices.grantConsent, { ...consentArgs, idempotencyKey: `${marker}:no-consent`, consentConfirmed: false }), "explicit voice consent");
  await expectFailure("cross-project consent grant denial", () => client.mutation(api.voices.grantConsent, { ...consentArgs, projectId: otherProjectId, idempotencyKey: `${marker}:cross-project-consent` }), "voice not found");
  record("explicit consent grant is auditable and idempotent");

  // Upload a tiny silent WAV fixture to ONLINE Convex Storage. No synthesis,
  // transcription, video generation, or provider request is executed.
  const wav = Buffer.alloc(60);
  wav.write("RIFF", 0); wav.writeUInt32LE(52, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(16, 40);
  const uploaded = [];
  for (const fixtureProjectId of [projectId, otherProjectId]) {
    const uploadUrl = await client.mutation(api.assetStorage.generateUploadUrl, { projectId: fixtureProjectId });
    const response = await fetch(uploadUrl, { method: "POST", headers: { "content-type": "audio/wav" }, body: wav });
    assert(response.ok, "fixture audio upload failed");
    const storage = await response.json();
    const ingested = await client.mutation(api.assetStorage.ingestAsset, {
      studioExternalId: projectStudioExternalId.value, projectId: fixtureProjectId, storageId: storage.storageId,
      source: "UPLOADED", roles: ["VOICE_REFERENCE"], name: `${marker}.wav`, mimeType: "audio/wav", metadata: { fixture: true, durationSeconds: 0.001 },
    });
    uploaded.push(ingested.assetId);
  }
  await expectFailure("cross-project reference sample denied", () => client.mutation(api.voices.attachSample, { projectId, voiceId: created.voiceId, assetId: uploaded[1] }), "owned by this project");
  const attached = await client.mutation(api.voices.attachSample, { projectId, voiceId: created.voiceId, assetId: uploaded[0] });
  assert.equal(attached.status, "READY");
  assert.equal(attached.sampleCount, 1);
  const attachedReplay = await client.mutation(api.voices.attachSample, { projectId, voiceId: created.voiceId, assetId: uploaded[0] });
  assert.equal(attachedReplay.sampleCount, 1);
  const unapproved = await client.query(api.voices.readiness, { projectId, voiceId: created.voiceId });
  assert.equal(unapproved.ready, false);
  const approvalArgs = { projectId, resourceType: "voice", resourceId: created.voiceId };
  await client.mutation(api.approvals.submitForReview, approvalArgs);
  await client.mutation(api.approvals.approve, approvalArgs);
  await client.mutation(api.approvals.lock, approvalArgs);
  const approved = await client.query(api.voices.readiness, { projectId, voiceId: created.voiceId });
  assert.equal(approved.ready, true);
  assert(!("references" in approved) && !("providerVoiceId" in approved), "readiness exposed private synthesis inputs");
  await expectFailure("locked voice sample mutation denied", () => client.mutation(api.voices.attachSample, { projectId, voiceId: created.voiceId, assetId: uploaded[0] }), "cannot be edited");
  await expectFailure("private voice resolver cannot be called publicly", () => client.query(api.voices.resolveForSynthesis, { projectId, voiceId: created.voiceId, use: "SYNTHESIZE" }), "public function");
  record("reference preparation, approval, and lock checked without provider calls");

  const revoked = await client.mutation(api.voices.revokeConsent, {
    projectId,
    voiceId: created.voiceId,
    reason: "Online foundation lifecycle test completed.",
    idempotencyKey: `${marker}:revoke`,
  });
  assert.equal(revoked.status, "REVOKED");
  const voiceAfterRevocation = await client.query(api.voices.get, { projectId, voiceId: created.voiceId });
  assert.equal(voiceAfterRevocation.status, "REVOKED");
  assert.equal(voiceAfterRevocation.hasConsent, false);
  assert.equal((await client.query(api.voices.readiness, { projectId, voiceId: created.voiceId })).ready, false, "revocation must block queued synthesis preparation");
  await expectFailure("revoked consent cannot be granted again", () => client.mutation(api.voices.grantConsent, { ...consentArgs, idempotencyKey: `${marker}:regrant` }), "revoked");
  await expectFailure("revoked voice cannot replay approval", () => client.mutation(api.approvals.approve, approvalArgs), "ready recordings");
  record("revocation blocks later consent reuse");
} finally {
  for (const projectId of projects) {
    await client.mutation(api.projects.softDelete, { projectId });
  }
  if (projects.length && projectStudioExternalId.value) {
    const visible = await client.query(api.projects.list, { studioExternalId: projectStudioExternalId.value });
    for (const projectId of projects) assert(!visible.some((project) => project._id === projectId), `temporary project ${projectId} remains in active project list`);
  }
}

console.log(JSON.stringify({ online: true, deploymentUrl: client.url, checks: passed }, null, 2));
