const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const env = { BACHS_ENVIRONMENT: 'sandbox', BACHS_SANDBOX_ENABLED: 'true' };
let authenticated = true, platformAdmin = true, now = 100000;
const rows = [];
const member = { user: { email: 'owner@example.test' }, studio: { _id: 's1', externalId: 'studio1' } };
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('convex/paymentCheckoutState.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports: mod.exports, module: mod, process: { env }, Date: { now: () => now },
  require: name => name === 'convex/values' ? { v: new Proxy({}, { get: () => () => ({}) }) } :
    name === './authorization' ? { requireAdmin: async (_, id) => { if (!authenticated || id !== 'studio1') throw new Error('Denied'); return member; } } :
    name === './platformAdministration' ? { requirePlatformRole: async () => { if (!platformAdmin) throw new Error('Denied'); } } :
    name.includes('/payments/config') ? { CREDIT_PACKS: [{ id: 'starter', credits: 100, amounts: { USD: 5, NGN: 7500 } }] } :
    { internalMutation: f => f, internalQuery: f => f, query: f => f },
});
const db = {
 query: () => ({ withIndex: (_, fn) => { const conditions=[]; const q={eq:(k,v)=>{conditions.push([k,v]);return q}}; fn(q); const matches=()=>rows.filter(r=>conditions.every(([k,v])=>r[k]===v)); return { unique: async()=>matches()[0]??null, order:()=>({take:async n=>matches().slice(-n).reverse()}) }; } }),
 insert: async (_, value) => { const id='p'+rows.length; rows.push({_id:id,...structuredClone(value)}); return id; },
 get: async id => rows.find(r=>r._id===id)??null,
 patch: async (id, value) => Object.assign(rows.find(r=>r._id===id), structuredClone(value)),
};
const args={studioExternalId:'studio1',packId:'starter',currency:'USD',requestKey:'request-0001'};
const prepare = a => mod.exports.prepare.handler({db},a);
(async()=>{
 authenticated=false; await assert.rejects(prepare(args),/Denied/); authenticated=true;
 platformAdmin=false; await assert.rejects(prepare(args),/Denied/); platformAdmin=true;
 await assert.rejects(prepare({...args,studioExternalId:'studio2'}),/Denied/);
 await assert.rejects(prepare({...args,packId:'forged'}),/Unknown/);
 const first=await prepare(args); assert.equal(first.submit,true); assert.equal(rows[0].amount,5); assert.equal(rows[0].credits,100);
 assert.equal((await prepare(args)).submit,false);
 assert.equal((await prepare({...args,requestKey:'request-0002'})).submit,false); assert.equal(rows.length,1);
 now+=46000; assert.equal((await prepare(args)).submit,true); assert.equal(rows.length,1);
 await mod.exports.attach.handler({db},{purchaseId:'p0',checkoutId:'checkout1',checkoutUrl:'https://sandbox-checkout.bachs.io/test'});
 assert.equal((await prepare(args)).submit,false);
 await assert.rejects(mod.exports.attach.handler({db},{purchaseId:'p0',checkoutId:'checkout2',checkoutUrl:'https://sandbox-checkout.bachs.io/test2'}),/mismatch/);
 await assert.rejects(prepare({...args,currency:'NGN'}),/different purchase/);
 rows[0].status='COMPLETED'; assert.equal((await prepare(args)).submit,false);
 const next=await prepare({...args,requestKey:'request-0003'}); assert.equal(next.submit,true); assert.equal(rows.length,2);
 now+=24*3600000; await assert.rejects(prepare({...args,requestKey:'request-0003'}),/reconciliation/);
 env.BACHS_SANDBOX_CHECKOUT_PAUSED='true'; await assert.rejects(prepare(args),/paused/); delete env.BACHS_SANDBOX_CHECKOUT_PAUSED;
 env.BACHS_ENVIRONMENT='production'; await assert.rejects(prepare(args),/not enabled/);
 console.log('PASS checkout intents: authorization, workspace-owner scope, server prices, duplicate confirmations, stable retry key, lease, checkout binding, stale ambiguity and live-mode denial');
})().catch(e=>{console.error(e);process.exitCode=1});
