const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('convex/authSession.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: mod, exports: mod.exports, Date });
let identity = { subject: 'user|session' };
let session = { userId: 'user', expirationTime: Date.now() + 60_000 };
const ctx = { auth: { getUserIdentity: async () => identity }, db: { normalizeId: (_, id) => id === 'session' ? id : null, get: async () => session } };
(async () => {
  assert.equal(await mod.exports.hasActiveSession(ctx), true);
  session = null; assert.equal(await mod.exports.hasActiveSession(ctx), false);
  session = { userId: 'other', expirationTime: Date.now() + 60_000 }; assert.equal(await mod.exports.hasActiveSession(ctx), false);
  session = { userId: 'user', expirationTime: Date.now() - 1 }; assert.equal(await mod.exports.hasActiveSession(ctx), false);
  identity = { subject: 'user|invalid' }; assert.equal(await mod.exports.hasActiveSession(ctx), false);
  identity = null; assert.equal(await mod.exports.hasActiveSession(ctx), false);
  console.log('PASS active session allowed; revoked, expired, mismatched, invalid and anonymous sessions denied');
})().catch(error => { console.error(error); process.exitCode = 1; });
