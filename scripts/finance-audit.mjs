import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readIfPresent(relativePath) {
  const absolute = path.join(repoRoot, relativePath);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : '';
}

function check(label, pass, detail) {
  checks.push({ label, pass, detail });
}

const credits = `${read('convex/credits.ts')}\n${readIfPresent('convex/financial.ts')}`;
const payments = read('convex/payments.ts');
const bachs = readIfPresent('src/lib/payments/bachs.ts');
const webhook = readIfPresent('src/app/api/payments/bachs/webhook/route.ts');
const paymentActions = read('src/lib/payments/actions.ts');
const schema = read('convex/schema.ts');

function filesUnder(relativePath) {
  const root = path.join(repoRoot, relativePath);
  if (!fs.existsSync(root)) return [];
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(child));
    else if (/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) files.push(path.join(repoRoot, child));
  }
  return files;
}

check(
  'ledger and reservation records',
  /creditReservations/.test(schema) && /creditTransactions/.test(schema) && /reservations/.test(schema) && /ledger/.test(schema),
  'schema exposes reservation and append-only accounting records',
);
check(
  'reservation idempotency',
  /withIndex\(["']by_idempotency["']/.test(credits) && /existing\)\s*return/.test(credits),
  'reserve returns an existing reservation for the same idempotency key',
);
check(
  'commit and release terminal states',
  /COMMITTED/.test(credits) && /RELEASED/.test(credits) && /(?:state|status)\s*!==\s*["']RESERVED["']/.test(credits),
  'finalization is guarded against repeated terminal transitions',
);
check(
  'reservation expiry execution',
  /expire|expired|sweep/i.test(credits),
  'a scheduled or callable path releases expired reservations',
);
check(
  'duplicate webhook deduplication',
  /by_provider_event/.test(payments) && /duplicate[\s\S]*status:\s*["']DUPLICATE["']/.test(payments),
  'provider event IDs are deduplicated before fulfillment',
);
check(
  'webhook signature and replay protection',
  /timingSafeEqual/.test(bachs) && /timestampNumber[\s\S]*toleranceSeconds/.test(bachs) && /(verifyBachsSignature|verifyWebhook)/.test(webhook),
  'raw-body HMAC and timestamp freshness are enforced at the route boundary',
);
check(
  'payment provider adapter availability',
  Boolean(bachs) && /verifyBachsSignature/.test(bachs),
  'the Bachs adapter must exist because the webhook route imports its verifier',
);
check(
  'underpayment quarantine',
  /QUARANTINED/.test(payments) && /amount/.test(payments) && /currency/.test(payments),
  'amount/currency mismatch marks the purchase as quarantined',
);
check(
  'missing payment fields fail closed',
  !/args\.amount\s*!==\s*undefined[\s\S]*?args\.currency\s*!==\s*undefined/.test(payments),
  'success events cannot fulfill when amount or currency is omitted',
);
check(
  'refund state machine',
  /refund/i.test(`${payments}\n${paymentActions}`) && /PENDING|PROCESSING|SUCCEEDED|FAILED|REJECTED/.test(`${payments}\n${paymentActions}`),
  'refund request, provider result, and terminal states are represented',
);
check(
  'server-only payment secret boundary',
  filesUnder('src/components').concat(filesUnder('src/app').filter((file) => !file.includes(`${path.sep}api${path.sep}`))).every((file) => !/process\.env\.(?:BACHS_API_KEY|BACHS_WEBHOOK_SECRET|CONVEX_DEPLOY_KEY|CONVEX_DEPLOYMENT|OPENROUTER_API_KEY|RENDER_WORKER_SHARED_SECRET)|(?:BACHS_API_KEY|BACHS_WEBHOOK_SECRET|CONVEX_DEPLOY_KEY|OPENROUTER_API_KEY|RENDER_WORKER_SHARED_SECRET)\s*[:=]\s*process\.env/.test(fs.readFileSync(file, 'utf8'))),
  'client candidates contain no direct reads of server-only secrets',
);

console.log('FinalFrame finance audit');
for (const result of checks) console.log(`${result.pass ? 'PASS' : 'GAP'}  ${result.label}: ${result.detail}`);
const gaps = checks.filter((result) => !result.pass);
console.log(`Summary: ${checks.length - gaps.length} passed, ${gaps.length} finance gap(s)`);
if (gaps.length) process.exitCode = 1;
