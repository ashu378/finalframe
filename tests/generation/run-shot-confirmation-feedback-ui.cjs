const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');

const filename = path.resolve(__dirname, '../../src/components/production/generate-shot-button.tsx');
const cells = [];
const references = [];
let cursor = 0;
let refCursor = 0;
let quoteCalls = 0;
const quoteRequests=[];
let confirmCalls = 0;
let safeToRefresh=false;
let confirmationError = 'This estimate is no longer valid. Review a fresh estimate before making the take.';
const quote = { estimateId: 'estimate', quoteHash: 'hash', model: 'reviewed-model', totalCredits: 64, generationDurationSeconds:8,plannedUseDurationSeconds:6,baseProviderUsd: .12, providerHoldMicros: 136000, expiresAt: Date.now() + 60000 };
const actions = {
    async previewShotGeneration(args) { quoteRequests.push(args);quoteCalls++; return { success: true, quote }; },
    async confirmShotGeneration(args) {
        confirmCalls++;
        assert.deepEqual(args, { estimateId: quote.estimateId, quoteHash: quote.quoteHash });
        return confirmationError ? { success: false, error: confirmationError,safeToRefresh } : { success: true, jobId: 'job' };
    },
};
const hooks = {
    ...React,
    useState(initial) {
        const index = cursor++;
        if (!(index in cells)) cells[index] = initial;
        return [cells[index], value => { cells[index] = value; }];
    },
    useRef(initial) {
        const index = refCursor++;
        if (!(index in references)) references[index] = { current: initial };
        return references[index];
    },
};
const stubs = {
    react: hooks,
    'lucide-react': { Loader2: () => null, Play: () => null },
    sonner: { toast: { error() {}, success() {} } },
    '@/lib/generation/actions': actions,
    '@/lib/generation/finish-options': require('../recipes/backend-fixture.cjs').load('src/lib/generation/finish-options.ts'),
};
const moduleFixture = new Module(filename, module);
moduleFixture.filename = filename;
moduleFixture.paths = Module._nodeModulePaths(path.dirname(filename));
const originalRequire = moduleFixture.require.bind(moduleFixture);
moduleFixture.require = name => Object.prototype.hasOwnProperty.call(stubs, name) ? stubs[name] : originalRequire(name);
moduleFixture._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename);

let tree;
function render() {
    cursor = 0;
    refCursor = 0;
    tree = moduleFixture.exports.GenerateShotButton({ productionId: 'production', shotId: 'shot' });
}
function find(predicate, node) {
    if (arguments.length === 1) node = tree;
    if (!node || typeof node !== 'object') return undefined;
    if (Array.isArray(node)) {
        for (const child of node) {
            const match = find(predicate, child);
            if (match) return match;
        }
        return undefined;
    }
    return predicate(node) ? node : find(predicate, node.props?.children);
}
const button = label => find(node => node.type === 'button' && node.props.children === label);
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); render(); };

(async () => {
    render();
    assert.equal(quoteCalls, 0);
    assert.equal(confirmCalls, 0);
    find(node=>node.type==='select'&&node.props['aria-label']==='Take finish').props.onChange({target:{value:'ECONOMY'}});render();
    find(node=>node.type==='select'&&node.props['aria-label']==='Take generation resolution').props.onChange({target:{value:'480p'}});render();assert.equal(quoteCalls,0);
    find(node => node.type === 'button').props.onClick();
    await flush();
    assert.equal(quoteCalls, 1);assert.equal(quoteRequests[0].qualityTier,'ECONOMY');assert.equal(quoteRequests[0].generationResolution,'480p');
    const previousId=quoteRequests[0].requestId;find(node=>node.type==='select'&&node.props['aria-label']==='Take generation resolution').props.onChange({target:{value:'720p'}});render();assert.equal(button('Confirm and make take'),undefined);assert.equal(quoteCalls,1);find(node=>node.type==='button').props.onClick();await flush();assert.equal(quoteCalls,2);assert.notEqual(quoteRequests[1].requestId,previousId);assert.equal(quoteRequests[1].generationResolution,'720p');
    assert.equal(confirmCalls, 0);
    const reviewedMarkup=require('react-dom/server').renderToStaticMarkup(tree);assert.match(reviewedMarkup,/Generate 8s; planned edit 6s/);assert.match(reviewedMarkup,/Cost covers the full generated clip/);
    button('Confirm and make take').props.onClick();
    await flush();
    assert.equal(confirmCalls, 1);const frozenChoice=find(node=>node.type==='select'&&node.props['aria-label']==='Take generation resolution');assert.equal(frozenChoice.props.disabled,true);frozenChoice.props.onChange({target:{value:'480p'}});render();assert.equal(find(node=>node.type==='select'&&node.props['aria-label']==='Take generation resolution').props.value,'720p');
    assert.equal(find(node => node.props?.role === 'alert').props.children, confirmationError);
    render();
    assert(find(node => node.props?.role === 'alert'), 'feedback survives an ordinary rerender');
    assert(button('Check the same confirmation'), 'failure retains the same quote for deliberate reconciliation');
    confirmationError = '';
    button('Check the same confirmation').props.onClick();
    await flush();
    assert.equal(confirmCalls, 2);
    assert.equal(find(node => node.props?.role === 'alert'), undefined);
    assert.equal(button('Confirm and make take'), undefined);
    find(node=>node.type==='button').props.onClick();await flush();confirmationError='This estimate expired.';safeToRefresh=true;button('Confirm and make take').props.onClick();await flush();assert.equal(button('Confirm and make take'),undefined);assert.equal(find(node=>node.type==='select'&&node.props['aria-label']==='Take finish').props.disabled,false);assert(find(node=>node.props?.role==='alert'));
    console.log('PASS explicit finish/resolution selection never starts work, changes invalidate estimates, uncertain confirmation freezes settings, and safe confirmation errors stay visible, deliberate retry reuses the reviewed quote, and successful submission clears feedback. No browser, network or database calls.');
})().catch(error => { console.error(error); process.exitCode = 1; });
