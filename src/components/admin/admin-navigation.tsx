'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, AlertTriangle, CreditCard, LayoutDashboard, ScrollText, Settings2, Users, ArrowUpRight } from 'lucide-react';

export type AdminNavigationItem = { href: string; label: string };
const icons: Record<string, typeof Users> = {
  '/admin': LayoutDashboard, '/admin/users': Users, '/admin/roles': Users,
  '/admin/account-requests': Users, '/admin/moderation': AlertTriangle,
  '/admin/jobs': Activity, '/admin/credits': CreditCard, '/admin/audit': ScrollText,
  '/admin/payments': CreditCard,
  '/admin/video-routing': Settings2,
};

/** The server supplies only destinations allowed for the current platform role. */
export function AdminNavigation({ items, mobile = false }: { items: AdminNavigationItem[]; mobile?: boolean }) {
  const pathname = usePathname();
  return <nav className={mobile ? 'grid gap-1 p-3 sm:grid-cols-2' : 'space-y-1'} aria-label={mobile ? 'Mobile platform navigation' : 'Platform navigation'}>{items.map(({ href, label }) => {
    const active = pathname === href || (href !== '/admin' && pathname.startsWith(`${href}/`));
    const Icon = icons[href] || Users;
    return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`group flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}><Icon className="size-[18px] shrink-0" aria-hidden="true" /><span className="min-w-0 flex-1">{label}</span>{active ? <ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" /> : null}</Link>;
  })}</nav>;
}
