const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('../../node_modules/typescript');

const repoRoot = path.resolve(__dirname, '../..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'finalframe-bachs-contracts-'));

function compile(relativePath, outputName) {
    const sourcePath = path.join(repoRoot, relativePath);
    const outputPath = path.join(tempRoot, outputName);
    const result = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
        fileName: sourcePath,
    });
    fs.writeFileSync(outputPath, result.outputText, 'utf8');
    return outputPath;
}

const config = require(compile('src/lib/payments/config.ts', 'config.js'));
const bachs = require(compile('src/lib/payments/bachs.ts', 'bachs.js'));
const failures = [];

function check(label, callback) {
    return Promise.resolve().then(callback).catch((error) => {
        failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    });
}

function response(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function main() {
    await check('default currencies are USD and NGN', () => {
        assert.deepEqual(config.DEFAULT_BACHS_CURRENCIES, ['USD', 'NGN']);
        assert.equal(config.isBachsCurrencyConfigured('NGN', ['USD', 'NGN']), true);
        assert.equal(config.isBachsCurrencyConfigured('XAF', ['USD', 'NGN']), false);
    });

    await check('sandbox config requires sandbox key', () => {
        const result = config.getBachsConfig({ BACHS_API_KEY: 'sk_sandbox_test', BACHS_API_BASE_URL: 'https://sandbox-api.bachs.io' });
        assert.equal(result.environment, 'sandbox');
        assert.equal(result.baseUrl, 'https://sandbox-api.bachs.io');
        assert.deepEqual(result.enabledCurrencies, ['USD', 'NGN']);
        assert.throws(() => config.getBachsConfig({ BACHS_API_KEY: 'sk_live_test' }), /sk_sandbox_/);
    });

    await check('checkout uses Bachs pricing and checkout_url contract', async () => {
        const calls = [];
        const provider = new bachs.BachsPaymentProvider({ environment: 'sandbox', baseUrl: 'https://sandbox-api.bachs.io', apiKey: 'sk_sandbox_test', webhookToleranceSeconds: 300, enabledCurrencies: ['USD', 'NGN'] }, async (url, init) => {
            calls.push({ url, init });
            return response({ checkout_id: 'chk_test', checkout_url: 'https://checkout.bachs.io/c/test', status: 'open', expires_at: '2026-08-25T01:00:00Z' }, 201);
        });
        const result = await provider.createCheckout({ amount: 7500, currency: 'NGN', reference: 'ff_ref_1', customerEmail: 'creator@example.com', successUrl: 'http://localhost:3000/success', cancelUrl: 'http://localhost:3000/cancel', idempotencyKey: 'checkout_ff_ref_1' });
        const payload = JSON.parse(calls[0].init.body);
        assert.equal(calls[0].url, 'https://sandbox-api.bachs.io/v1/checkout-sessions');
        assert.equal(calls[0].init.headers.Authorization, 'Bearer sk_sandbox_test');
        assert.equal(calls[0].init.headers['Idempotency-Key'], 'checkout_ff_ref_1');
        assert.deepEqual(payload.pricing, { currency: 'NGN', amount: '7500.00' });
        assert.equal(payload.checkout_url, undefined);
        assert.equal(result.checkoutUrl, 'https://checkout.bachs.io/c/test');
    });

    await check('unsupported currency is rejected unless configured', async () => {
        const provider = new bachs.BachsPaymentProvider({ environment: 'sandbox', baseUrl: 'https://sandbox-api.bachs.io', apiKey: 'sk_sandbox_test', webhookToleranceSeconds: 300, enabledCurrencies: ['USD', 'NGN'] }, async () => response({}));
        await assert.rejects(() => provider.createCheckout({ amount: 1, currency: 'XAF', reference: 'ref', customerEmail: 'a@b.com', successUrl: 'http://localhost:3000/s', cancelUrl: 'http://localhost:3000/c', idempotencyKey: 'key' }), /not enabled/);
    });

    await check('reconciliation and refund use correct endpoints', async () => {
        const calls = [];
        const provider = new bachs.BachsPaymentProvider({ environment: 'sandbox', baseUrl: 'https://sandbox-api.bachs.io', apiKey: 'sk_sandbox_test', webhookToleranceSeconds: 300, enabledCurrencies: ['USD', 'NGN'] }, async (url, init) => {
            calls.push({ url, init });
            return calls.length === 1 ? response({ checkout_id: 'chk_test', status: 'succeeded', charge_id: 'ch_test', amount: '10.00', currency: 'USD' }) : response({ refund_id: 'ref_test', charge_id: 'ch_test', reference: 'refund_1', status: 'processing', requested_amount: '10.00' }, 201);
        });
        const checkout = await provider.reconcileCheckout('chk_test');
        const refund = await provider.refund({ chargeId: 'ch_test', reference: 'refund_1', amount: 10, idempotencyKey: 'refund_ch_test_1' });
        assert.equal(calls[0].url, 'https://sandbox-api.bachs.io/v1/checkout-sessions/chk_test');
        assert.equal(calls[1].url, 'https://sandbox-api.bachs.io/v1/refunds');
        assert.equal(JSON.parse(calls[1].init.body).amount, '10.00');
        assert.equal(calls[1].init.headers['Idempotency-Key'], 'refund_ch_test_1');
        assert.equal(checkout.status, 'succeeded');
        assert.equal(refund.status, 'processing');
    });

    await check('signature verifies raw body and rejects stale delivery', () => {
        const secret = 'whsec_test';
        const rawBody = '{"id":"evt_1","type":"collection.succeeded"}';
        const timestamp = '1700000000';
        const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
        assert.equal(bachs.verifyBachsSignature(rawBody, timestamp, signature, secret, 300, 1700000000), true);
        assert.equal(bachs.verifyBachsSignature(rawBody, timestamp, signature, secret, 300, 1700001000), false);
        assert.equal(bachs.verifyBachsSignature(rawBody, timestamp, `${signature}0`, secret, 300, 1700000000), false);
    });

    await check('webhook normalization validates collection event', () => {
        const secret = 'whsec_test';
        const rawBody = JSON.stringify({ id: 'evt_1', type: 'collection.succeeded', data: { checkout_id: 'chk_test', charge_id: 'ch_test', status: 'succeeded', amount: '10.00', currency: 'USD' } });
        const timestamp = String(Math.floor(Date.now() / 1000));
        const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
        const provider = new bachs.BachsPaymentProvider({ environment: 'sandbox', baseUrl: 'https://sandbox-api.bachs.io', apiKey: 'sk_sandbox_test', webhookToleranceSeconds: 300, enabledCurrencies: ['USD', 'NGN'] });
        const event = provider.verifyWebhook({ rawBody, timestamp, signature, secret });
        assert.equal(event.eventType, 'collection.succeeded');
        assert.equal(event.amount, 10);
        assert.equal(event.checkoutId, 'chk_test');
    });

    if (failures.length > 0) {
        console.error(failures.join('\n'));
        process.exitCode = 1;
    } else {
        console.log('Bachs payment contracts: PASS');
    }
}

void main();
