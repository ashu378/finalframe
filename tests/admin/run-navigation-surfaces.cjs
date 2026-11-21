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
const contracts = load('src/lib/platform-admin/contracts.ts');
let selectedPath = '/admin';
let platformRole = 'ADMIN', studioRole = 'member', hasStudio = true, authorized = true, reads = 0;
const guards = { requirePlatformRole: async () => { if (!authorized) throw Error('platform denied'); return { role: platformRole }; } };
const client = { getAuthenticatedConvexClient: async () => ({ query: async () => { reads++; return { role: studioRole, studio: hasStudio ? { name: 'Fixture studio', externalId: 'fixture' } : null }; } }) };
const common = { 'next/link': Link, '@/lib/guards/platform': guards, '@/lib/platform-admin/contracts': contracts, '@/lib/convex/server': client };
const adminNavigation = load('src/components/admin/admin-navigation.tsx', { 'next/link': Link, 'next/navigation': { usePathname: () => selectedPath } });
const layout = load('src/app/(admin)/layout.tsx', { ...common, '@/components/admin/admin-navigation': adminNavigation, '@/components/auth/sign-out-button': { SignOutButton: () => React.createElement('button', null, 'Sign out') }, 'next/image': ({ priority, ...props }) => { void priority; return React.createElement('img', props); }, '@/components/threeui/scroll-reveal-root': { ScrollRevealRoot: () => null } });
const overview = load('src/app/(admin)/admin/page.tsx', common);
const settings = load('src/app/(dashboard)/dashboard/settings/page.tsx', { ...common, '@/lib/guards': { requireAuth: async () => { if (!authorized) throw Error('account denied'); return { user: { email: 'fixture@example.test' } }; } }, '@/components/billing/credit-packs': { CreditPacks: () => null }, '@/lib/credits/service': { getStudioCreditBalance: async () => 0 } });
const html = async (component, args) => renderToStaticMarkup(await component(args));
(async () => {
  for (const role of contracts.PLATFORM_ROLES) {
    platformRole = role;
    const markup = await html(layout.default, { children: React.createElement('p', null, 'Content') });
    assert.equal((markup.match(/href="\/admin\/account-requests"/g) || []).length, role === 'ADMIN' ? 2 : 0, 'Recovery navigation is ADMIN-only on both surfaces');
    assert.equal((markup.match(/href="\/dashboard"/g) || []).length, 2, 'Desktop and mobile each provide Back to app');
    assert.equal(markup.includes('href="/admin/roles"'), role === 'ADMIN');
    assert.equal((markup.match(/href="\/admin\/payments"/g) || []).length, role === 'ADMIN' ? 2 : 0);
    assert.equal((markup.match(/Sign out/g) || []).length, 2);
    assert.equal(markup.includes('href="/admin/moderation"'), role !== 'SUPPORT');
    assert.equal(markup.includes('href="/admin/users"'), role !== 'MODERATOR');
    for (const membership of ['owner', 'admin', 'member', null]) {
      studioRole = membership;
      for (const studioExists of [true, false]) {
        hasStudio = studioExists;
        const permitted = studioExists && ['owner', 'admin'].includes(membership);
        assert.equal((await html(overview.default)).includes('href="/dashboard/settings/operations"'), permitted, `${role}/${membership}/${studioExists} overview`);
        const page = await html(settings.default);
        assert.equal(page.includes('href="/dashboard/settings/operations"'), permitted, `${role}/${membership}/${studioExists} settings`);
        assert(page.includes('href="/dashboard/settings/account"')); assert(page.includes('href="/dashboard/settings/team"'));
      }
    }
  }
  selectedPath = '/admin/jobs/details';
  const activeMarkup = renderToStaticMarkup(React.createElement(adminNavigation.AdminNavigation, { items: [{href:'/admin',label:'Overview'},{href:'/admin/jobs',label:'Video jobs'}] }));
  assert.equal((activeMarkup.match(/aria-current="page"/g)||[]).length,1);
  assert(activeMarkup.includes('href="/admin/jobs" aria-current="page"'));
  const mobileTree = adminNavigation.AdminNavigation({ mobile: true, items: [{href:'/admin/jobs',label:'Video jobs'}] });
  let focused = false; const disclosure = { open: true, querySelector: () => ({ focus: () => { focused = true; } }) };
  mobileTree.props.children[0].props.onClick({currentTarget:{closest:()=>disclosure}});
  assert.equal(disclosure.open, false); assert.equal(focused, true);
  authorized = false; const before = reads;
  await assert.rejects(layout.default({ children: null }), /platform denied/);
  await assert.rejects(overview.default(), /platform denied/);
  await assert.rejects(settings.default(), /account denied/);
  assert.equal(reads, before, 'Guards reject before account reads');
  console.log('PASS platform navigation ADMIN/SUPPORT/MODERATOR matrix, mobile return path, independent studio role visibility and guarded account reads (SSR only; no browser/DB calls)');
})().catch(error => { console.error(error); process.exitCode = 1; });
