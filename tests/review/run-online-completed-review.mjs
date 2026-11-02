import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api.js';
import { createAuthenticatedClient } from '../../scripts/dev-fixture/client.mjs';

// This script requires a genuine completed fixture export. It never renders,
// generates media, or fabricates an export/completion callback.
const projectExternalId = process.env.FINALFRAME_REVIEW_TEST_PROJECT;
const exportId = process.env.FINALFRAME_REVIEW_TEST_EXPORT_ID;
if (!projectExternalId || !exportId) throw new Error('Provide a test project external ID and its genuine completed export ID.');
const { client } = await createAuthenticatedClient();
const publicClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);
const project = await client.query(api.projects.getByExternalId, { externalId: projectExternalId });
assert.ok(project, 'test project exists and is accessible');
const output = await client.query(api.reviewExport.getExport, { exportId });
assert.ok(output.status === 'COMPLETED' && output.storageId && output.projectId === project._id, 'requires genuine project-scoped completed storage output');
const initial = await client.query(api.reviewExport.getState, { productionId: output.productionId });
const links = []; const checked = [];
const check = (value, name) => { assert.ok(value, name); checked.push(name); };
async function createLink() {
    const token = randomBytes(32).toString('base64url');
    const link = await client.mutation(api.reviewExport.createShareLink, { projectId: project._id, exportId, tokenHash: createHash('sha256').update(token).digest('hex'), label: 'Internal scoped review verification' });
    links.push(link); return { link, token };
}
try {
    const { token, link } = await createLink();
    const view = await publicClient.query(api.reviewExport.getSharedReview, { token });
    check(view && view.projectName === project.name && view.videoUrl?.startsWith('https://'), 'active bearer exposes its exact completed video');
    check(!('production' in view) && !('manifest' in view) && !('tokenHash' in view) && !('assets' in view), 'public projection omits private planning, hashes and project assets');
    const comment = { token, authorName: 'FinalFrame verification', body: 'Scoped timestamp verification', timeSeconds: Math.min(0.5, view.durationSeconds), requestId: randomUUID() };
    const first = await publicClient.mutation(api.reviewExport.addSharedComment, comment);
    const replay = await publicClient.mutation(api.reviewExport.addSharedComment, comment);
    check(first.id === replay.id && replay.replayed, 'comment retry returns the same persisted comment');
    let denied = false;
    try { await publicClient.mutation(api.reviewExport.addSharedComment, { ...comment, requestId: randomUUID(), timeSeconds: view.durationSeconds + 1 }); } catch { denied = true; }
    check(denied, 'out-of-video timestamps are rejected');
    const decision = { token, authorName: 'FinalFrame verification', decision: 'APPROVED', note: 'Internal scoped review verification only' };
    await publicClient.mutation(api.reviewExport.decideSharedReview, decision);
    await publicClient.mutation(api.reviewExport.decideSharedReview, decision);
    const state = await client.query(api.reviewExport.getState, { productionId: output.productionId });
    check(state.approvals.filter(item => item.decision === 'CLIENT_APPROVED' && item.note?.includes(link.id)).length === 1, 'client decision appends one immutable review approval event');
    check(state.production.currentVersionId === initial.production.currentVersionId && state.production.status === initial.production.status, 'client approval does not approve or mutate the production plan');
    const revision = await createLink();
    await publicClient.mutation(api.reviewExport.decideSharedReview, { token: revision.token, authorName: 'FinalFrame verification', decision: 'CHANGES_REQUESTED', note: 'Internal revision verification' });
    check((await publicClient.query(api.reviewExport.getSharedReview, { token: revision.token })).status === 'CHANGES_REQUESTED', 'revision requests remain attached to the exact export review');
    await client.mutation(api.reviewExport.revokeShareLink, { projectId: project._id, linkId: revision.link.id });
    check(await publicClient.query(api.reviewExport.getSharedReview, { token: revision.token }) === null, 'revoked bearer no longer returns review data');
    denied = false;
    try { await publicClient.mutation(api.reviewExport.addSharedComment, { ...comment, token: revision.token, requestId: randomUUID() }); } catch { denied = true; }
    check(denied, 'revoked bearer cannot add comments');
    console.log(JSON.stringify({ ok: true, checks: checked, count: checked.length, paidProviderCalls: 0, rendererCalls: 0, mp4Rendered: false }, null, 2));
} finally {
    for (const link of links) await client.mutation(api.reviewExport.revokeShareLink, { projectId: project._id, linkId: link.id });
}
