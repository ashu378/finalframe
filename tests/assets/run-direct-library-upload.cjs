const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const { fixture, auth, load } = require('../recipes/backend-fixture.cjs');

const { uploadLibraryFile } = load('src/lib/assets/upload-library-file.ts');
const scope = { studioExternalId: 'studio', projectExternalId: 'my-project' };
const bytes = Buffer.alloc(7 * 1024 * 1024 + 12345, 42);
const expectedSha = createHash('sha256').update(bytes).digest('hex');
const file = new File([bytes], 'joined.mp4', { type: 'video/mp4' });
// A whole-file in-memory digest would break mobile with larger movies.
file.arrayBuffer = () => { throw new Error('Whole-file buffering'); };

auth.requireCurrentMember = async ctx => {
  if (!ctx.signedIn) throw Error('Sign in required');
  return { studio: await ctx.db.get('studio'), user: await ctx.db.get(ctx.actor) };
};
function setup() {
  const ctx = fixture();
  ctx.rows.get('project').externalId = scope.projectExternalId;
  ctx.storage = { generateUploadUrl: async () => 'https://storage.example.test/issued' };
  return ctx;
}
const begin = (ctx, args) => ctx.call('assetStorage', 'beginLibraryUpload', args);
const finish = (ctx, args) => ctx.call('assetStorage', 'finishLibraryUpload', args);
const metadata = { ...scope, name: file.name, mimeType: file.type, byteSize: file.size, checksum: expectedSha };
function store(ctx, fields = {}) {
  ctx.storageObjects.set('blob', {
    _creationTime: Date.now(), size: file.size, contentType: file.type,
    sha256: Buffer.from(expectedSha, 'hex').toString('base64'), ...fields,
  });
}

(async () => {
  const ctx = setup();
  let ticket, receipt, posts = 0;
  const assetId = await uploadLibraryFile(file, scope,
    async args => {
      assert.deepEqual(args, metadata);
      assert.ok(JSON.stringify(args).length < 300);
      ticket = await begin(ctx, args);
      return ticket;
    },
    async args => {
      receipt = args;
      assert.deepEqual(receipt, { ticketId: ticket.ticketId, storageId: 'blob' });
      return finish(ctx, args);
    },
    async (url, options) => {
      posts++;
      assert.equal(url, ticket.uploadUrl);
      assert.equal(options.body, file);
      assert.equal(options.headers['Content-Type'], file.type);
      assert.equal(options.credentials, 'omit');
      assert.equal(options.redirect, 'error');
      store(ctx);
      return Response.json({ storageId: 'blob' });
    });
  assert.equal(posts, 1);
  const asset = ctx.rows.get(assetId);
  assert.equal(asset.projectId, 'project');
  assert.equal(asset.scope, 'PROJECT');
  assert.equal(asset.byteSize, file.size);
  assert.deepEqual(asset.roles, ['SOURCE_VIDEO']);
  assert.equal(asset.metadata.folderPath, '/productions/my-project');
  assert.equal(asset.provenance.actorExternalId, 'owner');
  assert.equal(asset.rights.status, 'UNKNOWN');
  assert.equal(asset.metadata.consent.status, 'NOT_REQUIRED');
  assert.equal(asset.metadata.lineage.relation, 'SOURCE');
  assert.equal(await finish(ctx, receipt), assetId);
  assert.equal(ctx.count('assets'), 1);
  await assert.rejects(finish(ctx, { ...receipt, storageId: 'substituted' }));
  const ui = fs.readFileSync('src/components/assets/upload-button.tsx', 'utf8');
  assert.ok(!/new FormData|uploadAsset\(/.test(ui));
  console.log('PASS 7 MB media goes directly to the issued URL; only metadata crosses the app boundary, rights and scoped metadata are preserved, retry is idempotent.');

  for (const reason of ['project', 'workspace', 'owner', 'role', 'checksum', 'mime', 'size', 'old-blob', 'foreign-blob', 'expiry']) {
    const c = setup();
    if (reason === 'project' || reason === 'workspace') {
      await assert.rejects(begin(c, { ...metadata, ...(reason === 'project' ? { projectExternalId: 'missing' } : { studioExternalId: 'other' }) }));
      assert.equal(c.count('libraryUploadTickets'), 0);
      continue;
    }
    const grant = await begin(c, metadata);
    store(c, reason === 'checksum' ? { sha256: 'bad' } : reason === 'mime' ? { contentType: 'audio/mpeg' }
      : reason === 'size' ? { size: 7 } : reason === 'old-blob' ? { _creationTime: 1 } : {});
    if (reason === 'owner') { c.put('users', { _id: 'other' }); c.actor = 'other'; }
    if (reason === 'role') c.role = 'VIEWER';
    if (reason === 'expiry') c.rows.get(grant.ticketId).expiresAt = 1;
    if (reason === 'foreign-blob') c.put('assets', { _id: 'foreign', storageId: 'blob', projectId: 'different' });
    await assert.rejects(finish(c, { ticketId: grant.ticketId, storageId: 'blob' }));
    assert.equal(c.count('assets'), reason === 'foreign-blob' ? 1 : 0);
  }
  const global = setup();
  const grant = await begin(global, { ...metadata, projectExternalId: undefined });
  store(global);
  const globalId = await finish(global, { ticketId: grant.ticketId, storageId: 'blob' });
  assert.equal(global.rows.get(globalId).scope, 'GLOBAL');
  assert.equal(global.rows.get(globalId).metadata.folderPath, '/');
  console.log('PASS global/project uploads and ten ownership, role, file substitution, size, expiry and isolation checks.');
})().catch(err => { console.error(err); process.exitCode = 1; });
