import Link from 'next/link';
import { ArrowUpRight, ShieldCheck } from 'lucide-react';
import { requirePlatformRole } from '@/lib/guards/platform';
import { PLATFORM_READ_ROLES, type PlatformInventoryKind } from '@/lib/platform-admin/contracts';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { api } from '../../../../convex/_generated/api';

export const metadata = { title: 'Platform admin' };
const sections: Array<{ href: string; kind: PlatformInventoryKind; label: string; description: string }> = [
  { href: '/admin/users', kind: 'users', label: 'Accounts', description: 'Find accounts and review changes to their access.' },
  { href: '/admin/account-requests', kind: 'roles', label: 'Account requests', description: 'Review requests to close an account or restore access. Saved work is kept.' },
  { href: '/admin/roles', kind: 'roles', label: 'Platform access', description: 'Choose who can manage FinalFrame. The last administrator cannot be removed.' },
  { href: '/admin/jobs', kind: 'jobs', label: 'Video jobs', description: 'See work in progress, failed jobs and reported AI costs across studios.' },
  { href: '/admin/moderation', kind: 'reports', label: 'Content reports', description: 'Review reported content and record your decision.' },
  { href: '/admin/credits', kind: 'credits', label: 'Credit history', description: 'Check credits added, held, used or returned. Payments stay off.' },
  { href: '/admin/audit', kind: 'audit', label: 'Activity log', description: 'See who changed account access, reviewed content or changed AI settings.' },
  { href: '/admin/video-routing', kind: 'routing', label: 'AI model settings', description: 'Check available AI models and restrict one when needed.' },
];
export default async function AdminDashboardPage() {
  const access = await requirePlatformRole();
  const current = await (await getAuthenticatedConvexClient()).query(api.account.current, {});
  const canManageStudio = !!current.studio && (current.role === 'owner' || current.role === 'admin');
  const permitted = sections.filter((section) => PLATFORM_READ_ROLES[section.kind].includes(access.role));
  const groups = [
    { title: 'People & access', description: 'Help people use their accounts safely.', kinds: ['users', 'roles'] },
    { title: 'Production & support', description: 'Find a failed job or review reported content.', kinds: ['jobs', 'reports'] },
    { title: 'Records & AI settings', description: 'Trace changes and check how models are used.', kinds: ['credits', 'audit', 'routing'] },
  ];
  return <div className="space-y-9 sm:space-y-12">
    <header className="flex flex-wrap items-start justify-between gap-5 border-b border-border pb-8">
      <div className="max-w-2xl"><p className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><ShieldCheck className="size-4 text-primary" aria-hidden="true" />Private platform administration</p><h1 className="ff-display mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">Manage FinalFrame.</h1><p className="mt-4 text-sm leading-7 text-muted-foreground">Review accounts, support video production and keep a clear record of changes. Choose an area below to get started.</p></div>
      <div className="rounded-xl border border-border bg-card px-4 py-3"><p className="text-xs text-muted-foreground">Your platform role</p><p className="mt-1 text-sm font-semibold capitalize">{access.role.toLowerCase()}</p></div>
    </header>
    {groups.map((group) => { const items = permitted.filter((section) => group.kinds.includes(section.kind)); return items.length ? <section key={group.title} className="grid gap-5 xl:grid-cols-[220px_1fr] xl:gap-8"><div><h2 className="text-lg font-semibold">{group.title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{group.description}</p></div><div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">{items.map((section) => <Link key={section.href} href={section.href} className="group flex min-h-24 items-start gap-4 p-5 transition-colors hover:bg-secondary/50 sm:p-6"><div className="min-w-0 flex-1"><h3 className="font-semibold group-hover:text-primary">{section.label}</h3><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{section.description}</p></div><ArrowUpRight className="mt-1 size-4 shrink-0 text-muted-foreground transition group-hover:text-primary" aria-hidden="true" /></Link>)}</div></section> : null; })}
    {access.role === 'ADMIN' ? <section className="rounded-2xl border border-border bg-card p-5 sm:p-6"><h2 className="text-lg font-semibold">Payment readiness</h2><p className="mt-2 text-sm leading-7 text-muted-foreground">Planned top-ups start at $3. Purchased credits will not expire. Live payments stay off until the app is ready and you approve activation.</p><Link href="/admin/payments" className="ff-link mt-3 inline-flex min-h-11 items-center">Review the launch policy<ArrowUpRight className="ml-2 size-4" aria-hidden="true" /></Link></section> : null}
    {canManageStudio ? <aside className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-secondary/40 p-5"><div><h2 className="text-sm font-semibold">Looking for your own studio?</h2><p className="mt-2 text-sm text-muted-foreground">Your studio’s team and settings are separate from platform administration.</p></div><Link href="/dashboard/settings/operations" className="ff-button-quiet min-h-11 border border-border">Open your studio settings<ArrowUpRight className="size-4" aria-hidden="true" /></Link></aside> : null}
  </div>;
}
