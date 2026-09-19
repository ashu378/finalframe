const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const runway = fs.readFileSync(path.join('src', 'lib', 'adapters', 'runway-adapter.ts'), 'utf8');
assert.match(runway, /RUNWAY_LEGACY_ENABLED !== ['"]true['"]/);
assert.match(runway, /Legacy Runway adapter is disabled/);

// Production code must use the OpenRouter gateway. The adapter remains an
// explicitly gated compatibility module, so a stale import cannot route work
// to Runway by accident.
const sourceFiles = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) sourceFiles.push(full);
  }
}
walk('src');
for (const file of sourceFiles) {
  if (file.endsWith(path.join('src', 'lib', 'adapters', 'runway-adapter.ts'))) continue;
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /runway-adapter/);
}

console.log(JSON.stringify({ ok: true, checked: 'provider-routing', runway: 'legacy-gated' }));
