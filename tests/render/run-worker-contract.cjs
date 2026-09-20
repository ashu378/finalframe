const assert = require('node:assert/strict');
const fs = require('node:fs');

const dockerfile = fs.readFileSync('renderer/Dockerfile', 'utf8');
const server = fs.readFileSync('renderer/src/server.ts', 'utf8');

assert.match(dockerfile, /HEALTHCHECK[\s\S]*127\.0\.0\.1:8080\/health/);
assert.match(dockerfile, /EXPOSE 8080/);
assert.match(dockerfile, /pnpm install --frozen-lockfile/);
assert.match(server, /0\.0\.0\.0/);
assert.match(server, /RENDER_WORKER_SHARED_SECRET\?\.trim/);
assert.match(server, /if \(!secret\) return json\(response, 503/);
assert.match(server, /headerSecret !== secret/);
assert.match(server, /2_000_000/);
assert.match(server, /RENDER_COMMAND_TIMEOUT_MS/);
assert.match(server, /RENDER_MAX_OUTPUT_BYTES/);
assert.match(server, /sendRendererCallback/);

console.log(JSON.stringify({ ok: true, checked: 'renderer-worker' }));
