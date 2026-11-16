import Link from 'next/link';
import Image from 'next/image';
import { Activity, AlertTriangle, ArrowLeft, CreditCard, LayoutDashboard, ScrollText, Settings2, Users, Menu } from 'lucide-react';
import { AdminNavigation } from '@/components/admin/admin-navigation';
import { requirePlatformRole } from '@/lib/guards/platform';
import { PLATFORM_READ_ROLES, type PlatformInventoryKind } from '@/lib/platform-admin/contracts';

const navigation = [
  [LayoutDashboard, 'Overview', '/admin'],
  [Users, 'Accounts', '/admin/users'],
  [Users, 'Admin access', '/admin/roles'],
  [Users, 'Account requests', '/admin/account-requests'],
  [AlertTriangle, 'Content reports', '/admin/moderation'],
  [Activity, 'Video jobs', '/admin/jobs'],
  [CreditCard, 'Credit history', '/admin/credits'],
  [ScrollText, 'Activity log', '/admin/audit'],
  [Settings2, 'AI model settings', '/admin/video-routing'],
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const role = await requirePlatformRole();
  const kinds: Record<string, PlatformInventoryKind> = { '/admin/users': 'users', '/admin/roles': 'roles', '/admin/account-requests': 'roles', '/admin/moderation': 'reports', '/admin/jobs': 'jobs', '/admin/credits': 'credits', '/admin/audit': 'audit', '/admin/video-routing': 'routing' };
  const permittedNavigation = navigation.filter(([, , href]) => href === '/admin' || PLATFORM_READ_ROLES[kinds[href]].includes(role.role));
  return <div className="min-h-dvh bg-background text-foreground">
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-card p-5 lg:flex">
      <Link href="/admin" className="flex min-h-11 items-center gap-3"><Image src="/brand/finalframe-mark-small.png" alt="" width={32} height={32} className="rounded-lg grayscale" priority /><span className="ff-display text-xl font-semibold">FinalFrame<span className="text-primary">.</span></span></Link>
      <p className="mt-6 rounded-xl border border-border bg-background px-3 py-3 text-xs leading-5 text-muted-foreground">Private platform admin<br /><span className="font-semibold text-foreground">{role.role.toLowerCase()}</span></p>
      <div className="mt-7 min-h-0 flex-1 overflow-y-auto"><AdminNavigation items={permittedNavigation.map(([, label, href]) => ({ label, href }))} /></div>
      <Link href="/dashboard" className="mt-5 flex min-h-12 items-center gap-2 border-t border-border pt-5 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" />Back to app</Link>
    </aside>
    <main id="main-content" className="min-h-dvh lg:ml-64">
      <div className="sticky top-0 z-30 border-b border-border bg-background lg:hidden"><div className="flex items-center justify-between px-4 py-3"><Link href="/dashboard" className="flex min-h-11 items-center gap-2 text-sm font-semibold"><ArrowLeft className="size-4" aria-hidden="true" />Back to app</Link><span className="text-sm text-muted-foreground">Platform admin</span></div><details className="border-t border-border"><summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 text-sm font-semibold"><Menu className="size-4" aria-hidden="true" />Admin menu</summary><AdminNavigation mobile items={permittedNavigation.map(([, label, href]) => ({ label, href }))} /></details></div>
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-8 sm:py-10 xl:px-12">{children}</div>
    </main>
  </div>;
}
