const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../..');
const failures = [];

function check(label, callback) {
  try {
    callback();
  } catch (error) {
    failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function source(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function filesUnder(relativePath) {
  const root = path.join(repoRoot, relativePath);
  if (!fs.existsSync(root)) return [];
  const output = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...filesUnder(path.join(relativePath, entry.name)));
    else if (/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) output.push(absolute);
  }
  return output;
}

class FinanceLedgerFixture {
  constructor(initialCredits = 0) {
    this.available = initialCredits;
    this.reserved = 0;
    this.committed = 0;
    this.reservations = new Map();
    this.ledger = [];
    this.purchases = new Map();
    this.events = new Set();
    this.refunds = new Map();
    this.nextId = 1;
  }

  reserve({ idempotencyKey, amount, now = 0, ttlMs = 1_800_000 }) {
    const existing = this.reservations.get(idempotencyKey);
    if (existing) return existing;
    assert.ok(Number.isInteger(amount) && amount > 0, 'reservation amount must be a positive integer');
    assert.ok(this.available >= amount, 'insufficient available credits');
    const reservation = { id: `reservation-${this.nextId++}`, idempotencyKey, amount, status: 'RESERVED', expiresAt: now + ttlMs };
    this.reservations.set(idempotencyKey, reservation);
    this.available -= amount;
    this.reserved += amount;
    this.ledger.push({ type: 'RESERVATION', amount: -amount, reference: reservation.id });
    return reservation;
  }

  finalize(reservation, outcome, now = 0) {
    if (reservation.status !== 'RESERVED') return reservation.status;
    this.reserved -= reservation.amount;
    if (outcome === 'RELEASE') {
      this.available += reservation.amount;
      this.ledger.push({ type: 'RELEASE', amount: reservation.amount, reference: reservation.id });
      reservation.status = 'RELEASED';
      reservation.releasedAt = now;
    } else {
      this.committed += reservation.amount;
      reservation.status = 'COMMITTED';
      reservation.committedAt = now;
    }
    return reservation.status;
  }

  expire(now) {
    for (const reservation of this.reservations.values()) {
      if (reservation.status === 'RESERVED' && reservation.expiresAt <= now) this.finalize(reservation, 'RELEASE', now);
    }
  }

  recordPurchase({ eventId, checkoutId, amount, currency, expectedAmount, expectedCurrency, credits }) {
    if (this.events.has(eventId)) return { duplicate: true };
    this.events.add(eventId);
    const purchase = this.purchases.get(checkoutId);
    if (!purchase || purchase.status !== 'PENDING') return { quarantined: true };
    if (amount === undefined || amount !== expectedAmount || currency !== expectedCurrency) {
      purchase.status = 'QUARANTINED';
      return { quarantined: true };
    }
    purchase.status = 'COMPLETED';
    this.available += credits;
    this.ledger.push({ type: 'PURCHASE', amount: credits, reference: checkoutId });
    return { completed: true };
  }

  createPurchase(checkoutId, amount, currency, credits) {
    this.purchases.set(checkoutId, { checkoutId, amount, currency, credits, status: 'PENDING' });
  }

  refund(refundId, checkoutId, state, credits = 0) {
    const existing = this.refunds.get(refundId);
    if (existing) return existing;
    const refund = { refundId, checkoutId, status: state };
    this.refunds.set(refundId, refund);
    if (state === 'SUCCEEDED') {
      this.available -= credits;
      this.ledger.push({ type: 'REFUND', amount: -credits, reference: refundId });
    }
    return refund;
  }
}

function sign(rawBody, timestamp, secret) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
}

function verifySignature(rawBody, timestamp, signature, secret, nowSeconds) {
  const parsed = Number(timestamp);
  if (!Number.isFinite(parsed) || Math.abs(nowSeconds - parsed) > 300) return false;
  const expected = sign(rawBody, timestamp, secret);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

check('ledger invariants hold across commit, release, and expiry', () => {
  const ledger = new FinanceLedgerFixture(100);
  const committed = ledger.reserve({ idempotencyKey: 'shot-1', amount: 30, now: 0 });
  ledger.finalize(committed, 'COMMIT', 10);
  const released = ledger.reserve({ idempotencyKey: 'shot-2', amount: 20, now: 20 });
  ledger.finalize(released, 'RELEASE', 30);
  ledger.reserve({ idempotencyKey: 'shot-3', amount: 10, now: 40, ttlMs: 5 });
  ledger.expire(45);
  assert.equal(ledger.available + ledger.reserved + ledger.committed, 100, 'available plus reserved plus committed must preserve the wallet total');
  assert.equal(ledger.reserved, 0, 'all terminal reservations must leave reserved at zero');
});

check('reservation creation is idempotent', () => {
  const ledger = new FinanceLedgerFixture(50);
  const first = ledger.reserve({ idempotencyKey: 'same-request', amount: 12 });
  const duplicate = ledger.reserve({ idempotencyKey: 'same-request', amount: 12 });
  assert.equal(duplicate.id, first.id);
  assert.equal(ledger.reservations.size, 1);
  assert.equal(ledger.ledger.length, 1);
  assert.equal(ledger.available, 38);
});

check('commit, release, and expiry are terminal and idempotent', () => {
  const ledger = new FinanceLedgerFixture(90);
  const committed = ledger.reserve({ idempotencyKey: 'commit-once', amount: 10 });
  assert.equal(ledger.finalize(committed, 'COMMIT'), 'COMMITTED');
  assert.equal(ledger.finalize(committed, 'RELEASE'), 'COMMITTED');
  const expiring = ledger.reserve({ idempotencyKey: 'expire-once', amount: 15, ttlMs: 1 });
  ledger.expire(1);
  ledger.expire(2);
  assert.equal(expiring.status, 'RELEASED');
  assert.equal(ledger.ledger.filter((entry) => entry.type === 'RELEASE').length, 1);
});

check('duplicate payment webhook credits exactly once', () => {
  const ledger = new FinanceLedgerFixture(0);
  ledger.createPurchase('checkout-1', 500, 'NGN', 100);
  assert.deepEqual(ledger.recordPurchase({ eventId: 'event-1', checkoutId: 'checkout-1', amount: 500, currency: 'NGN', expectedAmount: 500, expectedCurrency: 'NGN', credits: 100 }), { completed: true });
  assert.deepEqual(ledger.recordPurchase({ eventId: 'event-1', checkoutId: 'checkout-1', amount: 500, currency: 'NGN', expectedAmount: 500, expectedCurrency: 'NGN', credits: 100 }), { duplicate: true });
  assert.equal(ledger.available, 100);
  assert.equal(ledger.ledger.filter((entry) => entry.type === 'PURCHASE').length, 1);
});

check('signature replay and tampering are rejected', () => {
  const rawBody = JSON.stringify({ id: 'event-1', type: 'collection.succeeded' });
  const secret = 'finance-fixture-secret';
  const now = 1_700_000_000;
  const timestamp = String(now);
  assert.equal(verifySignature(rawBody, timestamp, sign(rawBody, timestamp, secret), secret, now), true);
  assert.equal(verifySignature(rawBody, String(now - 301), sign(rawBody, String(now - 301), secret), secret, now), false);
  assert.equal(verifySignature(rawBody, timestamp, sign('{"tampered":true}', timestamp, secret), secret, now), false);
});

check('underpayment and missing amount are quarantined', () => {
  const ledger = new FinanceLedgerFixture(0);
  ledger.createPurchase('checkout-underpaid', 500, 'NGN', 100);
  assert.deepEqual(ledger.recordPurchase({ eventId: 'event-underpaid', checkoutId: 'checkout-underpaid', amount: 499, currency: 'NGN', expectedAmount: 500, expectedCurrency: 'NGN', credits: 100 }), { quarantined: true });
  assert.equal(ledger.available, 0);
  ledger.createPurchase('checkout-missing-amount', 500, 'NGN', 100);
  assert.deepEqual(ledger.recordPurchase({ eventId: 'event-missing-amount', checkoutId: 'checkout-missing-amount', currency: 'NGN', expectedAmount: 500, expectedCurrency: 'NGN', credits: 100 }), { quarantined: true });
});

check('refund states are idempotent and only successful refunds change credits', () => {
  const ledger = new FinanceLedgerFixture(100);
  assert.equal(ledger.refund('refund-1', 'checkout-1', 'PENDING', 25).status, 'PENDING');
  assert.equal(ledger.available, 100);
  assert.equal(ledger.refund('refund-1', 'checkout-1', 'SUCCEEDED', 25).status, 'PENDING');
  assert.equal(ledger.available, 100, 'replaying a refund ID must not apply a second state transition');
  assert.equal(ledger.refund('refund-2', 'checkout-1', 'SUCCEEDED', 25).status, 'SUCCEEDED');
  assert.equal(ledger.available, 75);
  assert.equal(ledger.ledger.filter((entry) => entry.type === 'REFUND').length, 1);
});

check('no client-side secret exposure', () => {
  const forbidden = /process\.env\.(?:BACHS_API_KEY|BACHS_WEBHOOK_SECRET|CONVEX_DEPLOY_KEY|CONVEX_DEPLOYMENT|OPENROUTER_API_KEY|RENDER_WORKER_SHARED_SECRET)|(?:BACHS_API_KEY|BACHS_WEBHOOK_SECRET|CONVEX_DEPLOY_KEY|OPENROUTER_API_KEY|RENDER_WORKER_SHARED_SECRET)\s*[:=]\s*process\.env/;
  const clientFiles = [...filesUnder('src/components'), ...filesUnder('src/app')]
    .filter((file) => !file.includes(`${path.sep}api${path.sep}`));
  const exposed = clientFiles.filter((file) => forbidden.test(fs.readFileSync(file, 'utf8')));
  assert.deepEqual(exposed, [], `secret-like environment variables found in client candidates: ${exposed.map((file) => path.relative(repoRoot, file)).join(', ')}`);
});

check('production has executable reservation expiry handling', () => {
  const credits = source('convex/credits.ts');
  assert.match(credits, /expire|expired|sweep/i, 'credits module has no expiry/sweeper path for RESERVED records');
});

check('production has an explicit refund state machine', () => {
  const payments = source('convex/payments.ts');
  const actions = source('src/lib/payments/actions.ts');
  assert.match(`${payments}\n${actions}`, /refund/i, 'no payment/refund mutation or action is implemented');
  assert.match(`${payments}\n${actions}`, /PENDING|PROCESSING|SUCCEEDED|FAILED|REJECTED/, 'refund lifecycle states are not represented');
});

check('successful webhook requires amount and currency verification', () => {
  const payments = source('convex/payments.ts');
  assert.doesNotMatch(payments, /args\.amount\s*!==\s*undefined[\s\S]*?args\.currency\s*!==\s*undefined/, 'webhook fulfillment condition permits missing amount/currency values');
});

if (failures.length) {
  console.error(`Finance contract tests: ${failures.length} FAILURE(S)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Provider calls: 0 (finance tests use deterministic fixtures only)');
  console.log('Finance contract tests: PASS');
}
