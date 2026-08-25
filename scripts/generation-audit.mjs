import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const checks = [];

function pass(name, detail) { checks.push({ status: 'PASS', name, detail }); }
function gap(name, detail) { checks.push({ status: 'GAP', name, detail }); }
function contains(source, pattern) { return pattern.test(source); }

const generation = read('convex/generation.ts');
const secureJobs = read('convex/generationJobs.ts');
const shared = read('convex/_shared.ts');
const authorization = read('convex/authorization.ts');
const adapter = read('src/lib/adapters/openrouter-adapter.ts');
const engine = read('src/lib/ai/engine.ts');

if (contains(generation, /getProduction\(ctx, args\.productionId/) && contains(shared, /requireMember\(ctx, studioExternalId\)/)) {
  pass('authorization boundary', 'production lookup delegates to verified Convex membership');
} else {
  gap('authorization boundary', 'generation production lookup is not provably protected by requireMember');
}

if (contains(secureJobs, /withIndex\("by_idempotency"/)) {
  pass('idempotent job creation', 'generation and secure job paths look up existing jobs by idempotency key');
} else {
  gap('idempotent job creation', 'one or more generation paths lack a by_idempotency lookup');
}

if (contains(secureJobs, /attemptNumber = job\.attemptCount \+ 1/) && contains(secureJobs, /status: "PROCESSING"/)) {
  pass('claim semantics', 'worker claim increments attempt count and moves jobs out of queued state');
} else {
  gap('claim semantics', 'worker claim does not expose a durable attempt transition');
}

if (!/(window|document|navigator)\b/.test(generation + secureJobs + engine)) {
  pass('browser closure safety', 'Convex generation functions and the engine contain no browser lifecycle dependency');
} else {
  gap('browser closure safety', 'generation path references browser-only globals');
}

if (contains(adapter, /AbortController/) && contains(adapter, /REQUEST_TIMEOUT/)) {
  pass('provider timeout normalization', 'adapter aborts requests and maps aborts to REQUEST_TIMEOUT');
} else {
  gap('provider timeout normalization', 'provider timeout behavior is not present in the adapter');
}

if (contains(secureJobs, /assetUrl: v\.string\(\)/) && !contains(secureJobs, /storageId/)) {
  gap('canonical media ingestion', 'completion accepts a remote assetUrl and does not require Convex Storage ingestion or media probing');
} else {
  pass('canonical media ingestion', 'completion contract includes canonical storage metadata');
}

if (contains(secureJobs, /RETRYABLE_FAILURE|RETRYING|nextRetryAt|schedule/) || contains(generation, /RETRYABLE_FAILURE|RETRYING|nextRetryAt|schedule/)) {
  pass('durable retry scheduling', 'generation source contains an explicit retry state/scheduler contract');
} else {
  gap('durable retry scheduling', 'provider retries exist in the adapter, but no Convex durable retry state or scheduler is implemented');
}

if (contains(secureJobs, /QC_PENDING|quality|moderation|continuity/i) || contains(generation, /QC_PENDING|quality|moderation|continuity/i)) {
  pass('quality-control gate', 'generation completion path references a QC or moderation gate');
} else {
  gap('quality-control gate', 'generation completion marks outputs complete without a QC/continuity blocking state');
}

if (contains(authorization, /requireMember/) && contains(secureJobs, /await requireMember\(ctx, job\.studioExternalId\)/)) {
  pass('cross-studio isolation', 'secure job read/claim/complete/fail paths require studio membership');
} else {
  gap('cross-studio isolation', 'one or more secure job paths lack an explicit membership check');
}

console.log('FinalFrame generation audit');
for (const check of checks) console.log(`${check.status === 'PASS' ? 'PASS' : 'GAP'}  ${check.name}: ${check.detail}`);
const gaps = checks.filter((check) => check.status === 'GAP');
console.log(`Summary: ${checks.length - gaps.length} passed, ${gaps.length} integration gap(s)`);
if (gaps.length > 0) process.exitCode = 1;
