const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('convex/financial.ts', 'utf8');
assert.match(source, /FINALFRAME_TEST_CREDITS_ENABLED/);
assert.match(source, /requireAdmin\(ctx, args\.studioExternalId\)/);
assert.match(source, /test-credit:/);
assert.match(source, /TEST_CREDIT_GRANT/);
assert.match(source, /DEVELOPMENT_TEST/);
assert.match(source, /TEST_CREDITS_GRANTED/);
console.log(JSON.stringify({ ok: true, checked: 'development-credit-grant' }));
