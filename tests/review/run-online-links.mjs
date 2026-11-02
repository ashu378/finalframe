import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api.js';

const fixtureKey = process.env.FINALFRAME_DEV_FIXTURE_KEY;
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!fixtureKey || !convexUrl) throw new Error('Set the private development fixture key and online Convex URL.');
const parsed = new URL(convexUrl);
if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.convex.cloud')) throw new Error('This verification requires online Convex.');
const deployment = parsed.hostname.split('.')[0];
const runId = randomUUID(); const token = randomBytes(32).toString('base64url');
const ownerSubject = `render-worker-verification-${runId}`;
const identity = JSON.stringify({ subject: ownerSubject, issuer: 'https://finalframe-test.invalid', tokenIdentifier: `https://finalframe-test.invalid|${ownerSubject}` });
function cli(name, args, owner = false) {
    try {
        const output = execFileSync('pnpm', ['exec', 'convex', 'run', name, JSON.stringify(args), '--deployment', deployment, ...(owner ? ['--identity', identity] : [])], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 });
        const start = output.search(/^(?:\{|\[|null)/m);
        if (start < 0) return null; // Convex CLI prints no value for a successful null return.
        const value = output.slice(start);
        return JSON.parse(value.trim());
    } catch (error) {
        const text = `${error.stdout ?? ''}\n${error.stderr ?? error.message}`.replaceAll(fixtureKey, '[REDACTED]').replaceAll(token, '[REDACTED]');
        throw new Error(text);
    }
}
const client = new ConvexHttpClient(convexUrl);
const checked = [];
const check = (value, label) => { assert.ok(value, label); checked.push(label); };
const fixture = cli('devFixtures:seedRenderWorkerVerification', { fixtureKey, runId });
try {
    await cli('renderWorkerVerification:prepare', { fixtureKey, jobId: fixture.jobIds[0] });
    const snapshot = cli('renderWorkerVerification:snapshot', { fixtureKey, jobId: fixture.jobIds[0] });
    check(snapshot.exports.length === 1 && snapshot.exports[0].status === 'PROCESSING', 'online fixture has an asynchronous uncompleted export, not a fake video');
    check(await client.query(api.reviewExport.getSharedReview, { token: 'malformed' }) === null, 'malformed bearer link reveals no review data');
    check(await client.query(api.reviewExport.getSharedReview, { token }) === null, 'unknown secure bearer link reveals no review data');
    let denied = false;
    try { await client.mutation(api.reviewExport.addSharedComment, { token, authorName: 'Unknown reviewer', body: 'Unauthorized', timeSeconds: 0, requestId: randomUUID() }); } catch { denied = true; }
    check(denied, 'unknown bearer cannot post a comment');
    denied = false;
    try { await client.mutation(api.reviewExport.decideSharedReview, { token, authorName: 'Unknown reviewer', decision: 'APPROVED' }); } catch { denied = true; }
    check(denied, 'unknown bearer cannot approve a review');
    denied = false;
    try { await client.query(api.reviewExport.listShareLinks, { projectId: fixture.projectId }); } catch { denied = true; }
    check(denied, 'anonymous caller cannot list a project review registry');
    const ownerLinks = cli('reviewExport:listShareLinks', { projectId: fixture.projectId }, true);
    check(Array.isArray(ownerLinks) && ownerLinks.length === 0, 'project owner can list their own empty review registry');
    denied = false;
    try { cli('reviewExport:createShareLink', { projectId: fixture.projectId, exportId: snapshot.exports[0]._id, tokenHash: createHash('sha256').update(token).digest('hex') }, true); } catch (error) { denied = error.message.includes('Choose a completed export from this project.'); }
    check(denied, 'a project owner cannot share a pending export as completed video');
    const after = cli('renderWorkerVerification:snapshot', { fixtureKey, jobId: fixture.jobIds[0] });
    check(after.exports[0].status === 'PROCESSING' && !after.exports[0].storageId, 'review rejection does not fabricate output or change the asynchronous export');
    console.log(JSON.stringify({ ok: true, count: checked.length, checks: checked, rendererCalls: 0, paidProviderCalls: 0, mp4Rendered: false }, null, 2));
} finally { cli('renderWorkerVerification:finish', { fixtureKey, jobIds: fixture.jobIds }); }
