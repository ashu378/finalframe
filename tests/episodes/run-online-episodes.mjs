import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { api } from '../../convex/_generated/api.js';
import { createAuthenticatedClient } from '../../scripts/dev-fixture/client.mjs';
import { ensureFixtureMedia } from '../../scripts/dev-fixture/fixture-media.mjs';
import { createFixturePlan } from '../../scripts/dev-fixture/fake-providers.mjs';

// All persisted data goes to online Convex. Fixture media generation is local,
// deterministic, and never calls an AI provider or renders a full movie.
const fixtureKey = process.env.FINALFRAME_DEV_FIXTURE_KEY;
if (!fixtureKey) throw new Error('FINALFRAME_DEV_FIXTURE_KEY is required for online episode integration tests.');
const { client } = await createAuthenticatedClient();
const marker = `finalframe-episodes-${randomUUID()}`;
const projects = [];
let passed = 0;
function pass(name) { passed += 1; console.log(`PASS ${name}`); }
async function deny(name, operation, expected) {
    await assert.rejects(operation, (error) => String(error.message || error).toLowerCase().includes(expected.toLowerCase()));
    pass(name);
}
async function approve(projectId, resourceType, resourceId, productionId) {
    const args = { projectId, resourceType, resourceId, ...(productionId ? { productionId } : {}) };
    await client.mutation(api.approvals.submitForReview, args);
    await client.mutation(api.approvals.approve, args);
    await client.mutation(api.approvals.lock, args);
}
async function upload(project, file, scope = 'PROJECT') {
    const uploadUrl = await client.mutation(api.assetStorage.generateUploadUrl, { studioExternalId: project.studioExternalId, ...(scope === 'PROJECT' ? { projectId: project.projectId } : {}) });
    const response = await fetch(uploadUrl, { method: 'POST', headers: { 'content-type': file.mimeType }, body: await readFile(file.path) });
    assert(response.ok);
    const { storageId } = await response.json();
    const result = await client.mutation(api.assetStorage.ingestAsset, {
        studioExternalId: project.studioExternalId, scope, ...(scope === 'PROJECT' ? { projectId: project.projectId } : {}),
        storageId, source: 'fixture', roles: [file.role], name: file.name, mimeType: file.mimeType,
        checksum: file.checksum, metadata: { fixtureMarker: marker }, rights: { status: 'APPROVED', consent: true }, consent: { status: 'APPROVED' },
    });
    return { ...file, assetId: result.assetId };
}

try {
    for (const suffix of ['main', 'isolation']) projects.push(await client.mutation(api.devFixtures.ensureProject, { fixtureKey, externalId: `${marker}-${suffix}`, name: `${marker} ${suffix}` }));
    const [project, other] = projects;
    const blankArgs = { projectId: project.projectId, snapshot: { resourceBindings: [], rules: [], story: '', visualStyle: '' }, idempotencyKey: `explicit-blank-bible:${project.projectId}` };
    const blank = await client.mutation(api.continuity.createBible, blankArgs);
    const sameBlank = await client.mutation(api.continuity.createBible, blankArgs);
    assert.equal(sameBlank.bibleId, blank.bibleId);
    pass('explicit blank bible creation reuses one snapshot across retries');
    const episodeArgs = { projectId: project.projectId, episodeNumber: 1, title: 'The missing key', durationSeconds: 4, workflow: 'FIXTURE', inputMode: 'IDEA', language: 'en', outputPreset: 'SOCIAL_VERTICAL' };
    const first = await client.mutation(api.episodes.create, episodeArgs);
    const replay = await client.mutation(api.episodes.create, episodeArgs);
    assert.equal(first.productionId, replay.productionId);
    assert.equal(replay.replayed, true);
    pass('episode creation has one production and idempotent episode numbering');
    await deny('cross-project episode access denied', () => client.query(api.episodes.get, { projectId: other.projectId, episodeId: first.episodeId }), 'episode not found');
    await deny('episode duration above 60 seconds denied', () => client.mutation(api.episodes.create, { ...episodeArgs, episodeNumber: 2, durationSeconds: 61 }), '4 and 60');

    const media = await ensureFixtureMedia();
    const image = await upload(project, media.files.find((file) => file.role === 'IMAGE'));
    const video = await upload(project, media.files.find((file) => file.role === 'VIDEO'));
    const audio = await upload(project, media.files.find((file) => file.role === 'AUDIO'));
    const foreignImage = await upload(other, media.files.find((file) => file.role === 'IMAGE'));
    const globalImage = await upload(project, media.files.find((file) => file.role === 'IMAGE'), 'GLOBAL');
    const resourceArgs = { projectId: project.projectId, kind: 'CHARACTER', name: 'Ada', profile: { description: 'A detective in a blue coat.' }, assetIds: [image.assetId] };
    await deny('cross-project continuity asset denied', () => client.mutation(api.continuity.createResource, { ...resourceArgs, assetIds: [foreignImage.assetId] }), 'owned by this project');
    await deny('global continuity asset without import denied', () => client.mutation(api.continuity.createResource, { ...resourceArgs, assetIds: [globalImage.assetId] }), 'owned by this project');
    const character = await client.mutation(api.continuity.createResource, resourceArgs);
    const bibleArgs = { projectId: project.projectId, snapshot: { resourceBindings: [{ resourceId: character.resourceId, resourceVersionId: character.resourceVersionId }], rules: ['Keep the blue coat and approved character reference.'], story: 'Ada searches for a missing key.', visualStyle: '2D comedy' } };
    const bible = await client.mutation(api.continuity.createBible, bibleArgs);
    await client.mutation(api.approvals.submitForReview, { projectId: project.projectId, resourceType: 'continuityBible', resourceId: bible.bibleId });
    await deny('bible cannot approve an unapproved resource snapshot', () => client.mutation(api.approvals.approve, { projectId: project.projectId, resourceType: 'continuityBible', resourceId: bible.bibleId }), 'approve every bound resource');
    await approve(project.projectId, 'projectResourceVersion', character.resourceVersionId);
    await client.mutation(api.approvals.approve, { projectId: project.projectId, resourceType: 'continuityBible', resourceId: bible.bibleId });
    await client.mutation(api.approvals.lock, { projectId: project.projectId, resourceType: 'continuityBible', resourceId: bible.bibleId });
    const revised = await client.mutation(api.continuity.reviseResource, { projectId: project.projectId, assetIds: [image.assetId], resourceId: character.resourceId, expectedVersionNumber: 1, profile: { description: 'A detective in a red coat.' } });
    assert.notEqual(revised.resourceVersionId, character.resourceVersionId);
    const original = await client.query(api.approvals.get, { projectId: project.projectId, resourceType: 'projectResourceVersion', resourceId: character.resourceVersionId });
    assert.equal(original.resource.profile.description, resourceArgs.profile.description);
    assert.equal(original.currentState, 'LOCKED');
    pass('locked resource revisions create new immutable snapshots');

    const planArgs = { studioExternalId: project.studioExternalId, projectExternalId: project.externalId, productionId: first.productionId, workflow: 'FIXTURE', inputMode: 'IDEA', durationSeconds: 4, language: 'en', outputPreset: 'SOCIAL_VERTICAL', input: { fixtureMarker: marker }, plan: createFixturePlan(), estimate: { credits: 0, providerCalls: 0 }, idempotencyKey: `${marker}:plan` };
    await deny('canonical episode planning rejects missing explicit bible', () => client.mutation(api.productions.createPlan, planArgs), 'choose an approved project continuity bible');
    const context = await client.query(api.continuity.productionPlanningContext, { projectId: project.projectId, productionId: first.productionId, continuityBibleId: bible.bibleId });
    assert.equal(context.resources[0].resourceVersionId, character.resourceVersionId);
    assert.equal(context.resources[0].profile.description, resourceArgs.profile.description);
    await deny('canonical planning rejects forged or outdated continuity snapshots', () => client.mutation(api.productions.createPlan, { ...planArgs, input: { ...planArgs.input, continuityBibleId: bible.bibleId, continuityContext: { ...context, continuityBibleVersion: -1 } } }), 'continuity changed');
    const createdPlan = await client.mutation(api.productions.createPlan, { ...planArgs, input: { ...planArgs.input, continuityBibleId: bible.bibleId, continuityContext: context } });
    const management = await client.query(api.continuity.resourceVersionPage, { projectId: project.projectId, paginationOpts: { numItems: 50, cursor: null } });
    assert.equal(management.projectRole, 'OWNER');
    assert.equal(management.page.find((entry) => entry.resourceVersionId === character.resourceVersionId).state, 'LOCKED');
    assert.equal(management.page.find((entry) => entry.resourceVersionId === revised.resourceVersionId).state, 'DRAFT');
    pass('resource management exposes approved historical versions without replacing them with drafts');
    const draftWorkspace = await client.query(api.productions.getWorkspace, { productionId: first.productionId });
    const draftGraph = await client.query(api.scenes.list, { productionId: first.productionId, productionVersionId: draftWorkspace.version._id });
    assert(draftGraph[0]?.scenes[0]?.shots.length > 0, 'Draft planning must materialize editable shots before approval.');
    const boundShot = draftGraph[0].scenes[0].shots[0];
    await client.mutation(api.scenes.updateShot, { shotId: boundShot._id, metadata: { ...boundShot.metadata, resourceVersionIds: [character.resourceVersionId] } });
    const foreignResource = await client.mutation(api.continuity.createResource, { ...resourceArgs, projectId: other.projectId, assetIds: [foreignImage.assetId] });
    await deny('shot cannot bind a resource from another project', () => client.mutation(api.scenes.updateShot, { shotId: boundShot._id, metadata: { ...boundShot.metadata, resourceVersionIds: [foreignResource.resourceVersionId] } }), 'part of this production');
    const savedShot = await client.query(api.scenes.getShot, { shotId: boundShot._id });
    assert.deepEqual(savedShot.metadata.resourceVersionIds, [character.resourceVersionId]);
    pass('draft shots retain explicit approved reference bindings');
    const approved = await client.mutation(api.productions.approvePlan, { planId: createdPlan.planId });
    const approvedWorkspace = await client.query(api.productions.getWorkspace, { productionId: first.productionId });
    assert.equal(approvedWorkspace.version.planningContextSnapshot.continuityBibleId, bible.bibleId);
    assert.equal(approvedWorkspace.version.planningContextSnapshot.resources[0].resourceVersionId, character.resourceVersionId);
    assert.deepEqual(approvedWorkspace.version.snapshot.sequences[0].scenes[0].shots[0].metadata.resourceVersionIds, [character.resourceVersionId]);
    await deny('approved plan snapshot denies later shot edits', () => client.mutation(api.scenes.updateShot, { shotId: boundShot._id, prompt: 'Overwrite approved shot' }), 'immutable');
    pass('approved production version snapshots authoritative continuity IDs, profiles, and shot bindings');
    const refs = [video, video].map((file) => ({ assetId: file.assetId, url: '', checksum: file.checksum, mimeType: file.mimeType, name: file.name, role: file.role, durationSeconds: file.durationSeconds, width: file.width, height: file.height }));
    const graph = await client.mutation(api.devFixtures.seedGraph, { fixtureKey, projectExternalId: project.externalId, planId: createdPlan.planId, approvedVersionId: approved.versionId, assets: refs });
    const libraryAsset = await client.query(api.assetStorage.getAssetContract, { assetId: video.assetId });
    assert.equal(libraryAsset.productionId, undefined);
    pass('fixture and assembly preserve project-library assets without assigning a production owner');
    const story = { summary: 'Ada finds a clue but not the key.', facts: ['Ada found a blue envelope.'], unresolvedThreads: ['Where is the key?'], cliffhanger: 'The envelope moves.', nextEpisodePayoff: 'Ada opens the envelope.', characterStates: [{ resourceId: character.resourceId, knowledge: 'The envelope contains a clue.', relationships: 'Ada works alone.' }] };
    const composeArgs = { productionId: first.productionId, productionVersionId: approved.versionId, idempotencyKey: `${marker}:composition`, clips: [
      { kind: 'TAKE', shotVersionId: graph.takeIds[0] },
      { kind: 'ASSET', assetId: video.assetId, durationSeconds: 2 },
      { kind: 'GRAPHIC', templateId: 'brand-card', durationSeconds: 1, props: { title: 'Exact project title', brandName: 'Fixture studio', accentColor: '#2288ff' }, logoAssetId: image.assetId },
    ], audioTracks: [{ assetId: audio.assetId, startSeconds: 0, durationSeconds: 2, volume: 0.4 }] };
    await deny('composition refuses unapproved takes and assets', () => client.mutation(api.timeline.createDraft, composeArgs), 'must be approved');
    for (const asset of [video, image, audio]) await approve(project.projectId, 'asset', asset.assetId);
    for (const takeId of graph.takeIds) await approve(project.projectId, 'shotVersion', takeId, first.productionId);
    await deny('composition denies foreign project assets', () => client.mutation(api.timeline.createDraft, { ...composeArgs, idempotencyKey: `${marker}:foreign`, clips: [{ kind: 'ASSET', assetId: foreignImage.assetId, durationSeconds: 1 }] }), 'project assets');
    const composed = await client.mutation(api.timeline.createDraft, composeArgs);
    const replayedComposition = await client.mutation(api.timeline.createDraft, composeArgs);
    assert.equal(replayedComposition.timelineId, composed.timelineId);
    assert.equal(replayedComposition.replayed, true);
    pass('first timeline is authored from explicit approved takes, project media, graphics and audio with idempotent replay');
    await deny('composition key cannot overwrite a different selection', () => client.mutation(api.timeline.createDraft, { ...composeArgs, audioTracks: [] }), 'different selection');
    const acceptArgs = { projectId: project.projectId, episodeId: first.episodeId, productionVersionId: approved.versionId, timelineId: composed.timelineId, continuityBibleId: bible.bibleId, snapshot: story };
    await deny('story facts cannot commit before final timeline approval', () => client.mutation(api.continuity.acceptStoryState, acceptArgs), 'must be approved');
    await approve(project.projectId, 'timeline', composed.timelineId, first.productionId);
    const assembled = await client.mutation(api.assembly.createJob, { productionId: first.productionId, timelineId: composed.timelineId, selectionScope: 'FULL_PROJECT', idempotencyKey: `${marker}:manifest` });
    assert.equal(assembled.manifest.version, 4);
    assert.equal(assembled.manifest.items.find(item => item.kind === 'motion-graphics').props.title, 'Exact project title');
    assert(assembled.manifest.items.find(item => item.kind === 'motion-graphics').props.logoUrl.includes('/api/storage/'));
    assert.equal(assembled.manifest.audioTracks[0].volume, 0.4);
    assert.equal(assembled.manifest.productionVersionId, approved.versionId);
    pass('locked real authoring timeline freezes exact titles, canonical logos and selected audio volume into manifest v4');
    const accepted = await client.mutation(api.continuity.acceptStoryState, acceptArgs);
    const acceptedReplay = await client.mutation(api.continuity.acceptStoryState, acceptArgs);
    assert.equal(acceptedReplay.storyStateId, accepted.storyStateId);
    assert.equal(acceptedReplay.replayed, true);
    pass('final timeline approval commits one immutable accepted story snapshot');

    const second = await client.mutation(api.episodes.create, { ...episodeArgs, episodeNumber: 2, title: 'Inside the envelope' });
    const sharedApproval = await client.query(api.approvals.get, { projectId: project.projectId, productionId: second.productionId, resourceType: 'asset', resourceId: video.assetId });
    assert.equal(sharedApproval.approved, true);
    pass('approved project-library asset remains usable by another episode in the same project');
    const secondContext = await client.query(api.continuity.planningContext, { projectId: project.projectId, episodeId: second.episodeId, continuityBibleId: bible.bibleId });
    assert.deepEqual(secondContext.storyState, story);
    assert.deepEqual(secondContext.bible.resourceBindings, bibleArgs.snapshot.resourceBindings);
    assert.notEqual(second.productionId, first.productionId);
    await deny('ambiguous project-only production lookup requires selection', () => client.query(api.productions.getWorkspaceByProject, { projectExternalId: project.externalId }), 'select an episode');
    const selected = await client.query(api.productions.getWorkspaceByProject, { projectExternalId: project.externalId, productionId: second.productionId });
    assert.equal(selected.production._id, second.productionId);
    pass('explicit episode selection keeps productions and accepted continuity independent');
    const revisedStory = { ...story, facts: ['Ada found a green envelope.'] };
    await client.mutation(api.continuity.acceptStoryState, { ...acceptArgs, previousAcceptedStateId: accepted.storyStateId, snapshot: revisedStory });
    const stale = await client.query(api.episodes.get, { projectId: project.projectId, episodeId: second.episodeId });
    assert.equal(stale.continuityStatus, 'STALE');
    const preserved = await client.query(api.continuity.planningContext, { projectId: project.projectId, episodeId: second.episodeId });
    assert.deepEqual(preserved.storyState, story);
    await client.mutation(api.episodes.refreshContinuity, { projectId: project.projectId, episodeId: second.episodeId });
    const refreshed = await client.query(api.continuity.planningContext, { projectId: project.projectId, episodeId: second.episodeId });
    assert.deepEqual(refreshed.storyState, revisedStory);
    pass('earlier revisions mark dependent episodes stale without rewriting their historical input');
    const history = await client.query(api.approvals.history, { projectId: project.projectId, resourceType: 'continuityBible', resourceId: bible.bibleId });
    assert(history.every((event) => event.projectId === project.projectId));
    pass('project-owned resource approval remains in the canonical audit log');
    console.log(`Online episode integration: ${passed} checks passed; paid provider calls: 0; renderer submissions: 0.`);
} finally {
    for (const project of projects) await client.mutation(api.projects.softDelete, { projectId: project.projectId }).catch(() => {});
}
