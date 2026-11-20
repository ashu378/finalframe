const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('convex/maintenanceOrphanFiles20261120.ts', 'utf8');
const mod = { exports: {} };
const v = new Proxy({}, { get: () => () => ({}) });
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: mod, exports: mod.exports, Date, process: { env: { CONVEX_SITE_URL: 'https://knowing-snail-785.convex.site' } }, require: name => name === './_generated/server' ? { internalMutation: x => x } : name === 'convex/values' ? { v } : { default: { tables: { assets: {}, exports: {} } } } });
const id = 'kg213rdwp809sm1b6z28rqxqcd8hm0gw';
let file, rows, deleted, audits;
function reset() { file = { _id: id, size: 68, sha256: 'PAze9degyQdAYXOHD4ddRACGQE5BgulWDdCBmLdsr9U=', _creationTime: 1 }; rows = []; deleted = []; audits = []; }
const ctx = { db: { system: { get: async (_, key) => key === id ? file : null, query: () => ({ take: async () => [] }) }, query: () => ({ take: async () => rows }), insert: async (_, row) => { audits.push(row); } }, storage: { delete: async key => { deleted.push(key); file = null; } } };
const run = args => mod.exports.clean.handler(ctx, args);
const execute = { execute: true, backupReceipt: 'storage-20261120:sha256-verified-six-fixtures' };
(async () => {
  reset(); assert.equal((await run({ execute: false })).candidates, 1); assert.equal(deleted.length, 0);
  await assert.rejects(run({ execute: true }), /backup/); assert.equal(deleted.length, 0);
  rows = [{ manifest: { sources: [{ url: 'https://example.test/' + id }] } }]; await assert.rejects(run(execute), /reference/); assert.equal(deleted.length, 0);
  reset(); file.sha256 = 'changed'; await assert.rejects(run(execute), /identity/);
  reset(); file._creationTime = Date.now(); await assert.rejects(run(execute), /age/);
  reset(); rows = Array(14001).fill({}); await assert.rejects(run(execute), /bounded/); assert.equal(deleted.length, 0);
  reset(); assert.equal((await run(execute)).deleted, 1); assert.deepEqual(deleted, [id]); assert.equal(audits.length, 1);
  assert.equal((await run(execute)).deleted, 0);
  console.log('PASS dry-run, backup requirement, nested-reference denial, checksum/age/bounds refusal, exact deletion, audit and idempotency');
})().catch(error => { console.error(error); process.exitCode = 1; });
