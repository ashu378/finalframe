const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '../..');
function load(file, stubs = {}) {
  const filename = path.join(root, file), mod = new Module(filename, module);
  mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const normal = mod.require.bind(mod); mod.require = name => Object.hasOwn(stubs, name) ? stubs[name] : normal(name);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
  return mod.exports;
}
const Link = ({ children, ...props }) => React.createElement('a', props, children);
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const pricing = load('src/app/(public)/pricing/page.tsx', {
  'next/link': Link,
  '@/lib/payments/config': load('src/lib/payments/config.ts'),
  '@/components/finalframe/section-heading': { SectionHeading: ({ title, description }) => React.createElement('div', null, React.createElement('h2', null, title), description) },
}).default;
const html = render(pricing);
assert(html.includes('Credit purchases and checkout are disabled'));
assert.equal((html.match(/A planned pack for future purchases/g) || []).length, 3);
assert.equal((html.match(/It is not available to buy today/g) || []).length, 3);
assert(html.includes('Pack sizes are planned and may change'));
assert(html.includes('Expiry terms for future purchased credits have not been published'));
assert(html.includes('Accepted or uncertain provider work keeps its hold'));
assert(html.includes('Workspace membership and access to individual projects remain separate'));
const answers = [...html.matchAll(/<details\b[^>]*>.*?<\/summary><p[^>]*>(.*?)<\/p><\/details>/g)].map(match => match[1]);
assert.equal(answers.length, 4); assert.equal(new Set(answers).size, 4);
assert(!/Local currency checkout is shown|Failed work releases its reservation|applicable answer|Start with starter|>Popular</.test(html));
assert(!/<form|<button|href="[^\"]*(checkout|payment)/.test(html), 'Pricing is information and signup links only');
assert.equal((html.match(/href="\/signup"/g) || []).length, 4);
const footer = load('src/components/layout/footer.tsx', { 'next/link': Link, 'next/image': props => React.createElement('img', props) });
const footerHtml = render(footer.Footer);
assert(!footerHtml.includes('systems online'));
for (const policy of ['terms', 'privacy', 'cookies', 'gdpr']) assert(footerHtml.includes(`href="/legal/${policy}"`));
const closed = load('src/components/layout/mobile-public-menu.tsx', { 'next/link': Link });
assert(render(closed.MobilePublicMenu, { authenticated: false }).includes('aria-expanded="false"'));
let focused = 0, closedState, effect, keydown, removed = 0;
const hooks = { ...React, useState: () => [true, value => { closedState = value; }], useRef: () => ({ current: { focus: () => focused++ } }), useEffect: callback => { effect = callback; } };
const open = load('src/components/layout/mobile-public-menu.tsx', { 'next/link': Link, react: hooks });
for (const authenticated of [false, true]) {
  const menu = render(open.MobilePublicMenu, { authenticated });
  assert(menu.includes('aria-expanded="true"')); assert(menu.includes('aria-controls="mobile-public-navigation"'));
  assert(menu.includes('aria-label="Mobile main navigation"'));
  assert(!menu.includes('role="dialog"')); assert(!menu.includes('aria-modal'));
  assert(menu.includes('focus-visible:ring-2'));
  assert(menu.includes(`href="${authenticated ? '/dashboard' : '/login'}"`));
  assert(menu.includes(`href="${authenticated ? '/dashboard/create' : '/signup'}"`));
}
const previousDocument = global.document;
try {
  global.document = { addEventListener: (type, listener) => { assert.equal(type, 'keydown'); keydown = listener; }, removeEventListener: (type, listener) => { assert.equal(type, 'keydown'); assert.equal(listener, keydown); removed++; } };
  const cleanup = effect(); keydown({ key: 'Tab' }); assert.equal(focused, 0);
  keydown({ key: 'Escape' }); assert.equal(closedState, false); assert.equal(focused, 1);
  cleanup(); assert.equal(removed, 1);
} finally { if (previousDocument === undefined) delete global.document; else global.document = previousDocument; }
console.log('PASS public pricing disabled/planned copy and four specific FAQ answers, no purchase controls, policy links, disclosure/auth destinations and Escape focus handler (SSR only; no browser/DB/provider calls)');
