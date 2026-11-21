const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const validators = new Proxy({}, { get: () => () => ({}) });
const mod = { exports: {} };
const env = { BACHS_ENVIRONMENT: 'sandbox', BACHS_SANDBOX_ENABLED: 'true' };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('convex/sandboxPaymentEvents.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: mod.exports, module: mod, Date, process: { env }, require: name => name === 'convex/values' ? { v: validators } : { internalMutation: f => f } });
const initial = { purchases: [{ _id:'p1', studioId:'s1', studioExternalId:'studio1', reference:'reference1', provider:'bachs', providerCheckoutId:'chk1', amount:5, currency:'USD', credits:100, status:'PENDING', metadata:{environment:'sandbox'} }], credits:[{_id:'real',balance:71}], studios:[{_id:'s1',credits:71}], sandboxPaymentBalances:[], sandboxPaymentLedger:[], paymentEvents:[] };
let tables;
const db={
 query:table=>({withIndex:(_,fn)=>{const conditions=[];const q={eq:(k,v)=>{conditions.push([k,v]);return q}};fn(q);return {unique:async()=>{const rows=tables[table].filter(r=>conditions.every(([k,v])=>r[k]===v));assert(rows.length<=1);return rows[0]??null}}}}),
 patch:async(id,values)=>{const row=Object.values(tables).flat().find(r=>r._id===id);assert(row);Object.assign(row,structuredClone(values));},
 insert:async(table,values)=>{const id=table+':'+tables[table].length;tables[table].push({_id:id,...structuredClone(values)});return id;}
};
function event(id,type='collection.succeeded',data={}){return{id,type,data:{checkout_id:'chk1',charge_id:'ch1',status:'SUCCEEDED',amount:'5.00',currency:'USD',...data}}}
async function run(e){const backup=structuredClone(tables);try{return await mod.exports.applyEvent.handler({db},{event:e})}catch(err){tables=backup;throw err}}
(async()=>{
 tables=structuredClone(initial);
 await assert.rejects(run(event('badAmount',undefined,{amount:'5.01'})),/amount/);
 await assert.rejects(run(event('badCurrency',undefined,{currency:'NGN'})),/amount/);
 await assert.rejects(run(event('unknown',undefined,{checkout_id:'foreign',charge_id:'other'})),/not ready/);
 tables.purchases[0].metadata.environment='production';await assert.rejects(run(event('wrongEnv')),/ownership/);tables.purchases[0].metadata.environment='sandbox';
 await run(event('paid'));assert.equal(tables.sandboxPaymentBalances[0].balance,100);
 assert.equal((await run(event('paid'))).duplicate,true);
 await run(event('paidAgain'));assert.equal(tables.sandboxPaymentBalances[0].balance,100);assert.equal(tables.sandboxPaymentLedger.length,1);
 await run(event('lateFail','collection.failed'));assert.equal(tables.purchases[0].status,'COMPLETED');
 await assert.rejects(run(event('differentCharge',undefined,{charge_id:'ch2'})),/different charge/);
 await run(event('refundPending','refund.created',{refund_id:'r1',requested_amount:'5.00'}));assert.equal(tables.sandboxPaymentBalances[0].balance,100);
 await assert.rejects(run(event('excessRefund','refund.paid',{refund_id:'rx',refunded_amount:'6.00'})),/amount/);
 await run(event('refund','refund.paid',{refund_id:'r1',refunded_amount:'5.00',currency:undefined}));assert.equal(tables.sandboxPaymentBalances[0].balance,0);
 await run(event('refundReplay','refund.paid',{refund_id:'r1',refunded_amount:'5.00'}));assert.equal(tables.sandboxPaymentBalances[0].balance,0);
 await run(event('lateSuccess'));assert.equal(tables.sandboxPaymentBalances[0].balance,0);assert.equal(tables.purchases[0].metadata.refundedCredits,100);
 assert.equal(tables.credits[0].balance,71);assert.equal(tables.studios[0].credits,71);
 env.BACHS_ENVIRONMENT='production';await assert.rejects(run(event('live')),/disabled/);
 for(const file of ['convex/financial.ts','convex/payments.ts']){const source=fs.readFileSync(file,'utf8');assert(source.includes('Use the server-priced checkout flow.'));}
 assert(fs.readFileSync('convex/financial.ts','utf8').includes('A verified payment event is required.'));
 console.log('PASS sandbox ledger: exact amount/currency, unknown purchase retry, environment isolation, once-only fulfillment/refund, out-of-order events, excess-refund denial, retained real credits, disabled legacy grants');
})().catch(e=>{console.error(e);process.exitCode=1});
