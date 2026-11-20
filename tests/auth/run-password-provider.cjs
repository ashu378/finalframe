const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
(async () => {
  const { Password } = await import('@convex-dev/auth/providers/Password');
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/auth/password-provider.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: mod, exports: mod.exports });
  const original = Password({});
  const actual = mod.exports.materializePassword(original);
  assert.equal(actual.id, 'password');
  assert.equal(actual.authorize, original.options.authorize);
  assert.equal(actual.options, undefined);
  assert.equal(typeof actual.crypto.hashSecret, 'function');
  const wrapped = { ...actual, authorize: async () => 'guarded' };
  assert.equal(await ({ ...wrapped, ...wrapped.options }).authorize(), 'guarded');
  console.log('PASS actual installed Password provider preserves wrapped authorization and credential hashing');
})().catch(error => { console.error(error); process.exitCode = 1; });
