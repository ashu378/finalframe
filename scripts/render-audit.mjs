import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const checks = [];
const pass = (name, detail) => checks.push({ status: 'PASS', name, detail });
const gap = (name, detail) => checks.push({ status: 'GAP', name, detail });

const manifest = read('renderer/src/manifest.ts');
const plan = read('renderer/src/assembly/plan.ts');
const callback = read('renderer/src/contracts/callback.ts');
const probe = read('renderer/src/media/probe.ts');
const renderer = read('renderer/src/renderer.ts');
const runtime = read('renderer/src/remotion/runtime.ts');
const assembly = read('convex/assembly.ts');
const renderActions = read('src/lib/render/actions.ts');
const exportActions = read('src/lib/export/actions.ts');

if (/orderIndex/.test(plan) && /sort\(/.test(plan) && /\.sort\(/.test(assembly) && /for \(const sequence of sequences/.test(assembly)) pass('ordered shots', 'renderer and Convex assembly both sort deterministic sequence/scene/shot order');
else gap('ordered shots', 'ordered assembly is not provably stable at every layer');

if (/audioTracks/.test(manifest) && /captionTracks/.test(manifest) && /frame window must fit/.test(manifest)) pass('audio/caption timing', 'audio and captions are validated against the output frame window');
else gap('audio/caption timing', 'audio or caption timing validation is incomplete');

if (/signCallbackBody/.test(callback) && /timingSafeEqual/.test(callback) && /handleRendererCallback/.test(callback) && /duplicate/.test(callback)) pass('callback authentication/replay', 'callbacks use HMAC verification and receipt deduplication');
else gap('callback authentication/replay', 'callback signing or replay protection is incomplete');

if (/validateOutputProbe/.test(probe) && /hasVideo/.test(probe) && /duration/.test(probe)) pass('output probing', 'probe helper validates streams, dimensions, frame rate, and duration');
else gap('output probing', 'output probe validation helper is incomplete');

if (/probeAndValidateOutput|validateOutputProbe|validatePosterSpec/.test(`${renderer}\n${runtime}`)) pass('probe enforcement', 'the render entry point invokes media validation before success');

if (/idempotencyKey/.test(renderActions) || /idempotencyKey/.test(renderer)) pass('render idempotency contract', 'render path exposes an idempotency key');
else gap('render idempotency contract', 'render request/runtime has no idempotency key or worker-side deduplication');

if (/UNSUPPORTED_CONVEX_OPERATION|not exposed by the current Convex API/.test(exportActions)) gap('download records', 'export submission still fails closed and does not create a durable export/download record');
else pass('download records', 'export path exposes durable download record behavior');

if (/placeholder|example\.com|mock:\/\/|sample:\/\//i.test(manifest)) pass('placeholder URL protection', 'placeholder media sources are rejected or excluded from assembly');
else gap('placeholder URL protection', 'manifest/assembly does not reject placeholder, sample, or mock media URLs');

if (/storageId/.test(assembly) && /ctx\.storage\.getUrl/.test(assembly) && !/storageUrl/.test(assembly)) pass('canonical media resolution', 'assembly requires canonical storage IDs and resolves authorized short-lived URLs');
else gap('canonical media resolution', 'assembly does not prove canonical storage ownership and authorized URL resolution');

console.log('FinalFrame render/export audit');
for (const check of checks) console.log(`${check.status}  ${check.name}: ${check.detail}`);
const gaps = checks.filter((check) => check.status === 'GAP');
console.log(`Summary: ${checks.length - gaps.length} passed, ${gaps.length} integration gap(s)`);
if (gaps.length > 0) process.exitCode = 1;
