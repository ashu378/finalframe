'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FolderOpen, Images, LayoutGrid, LayoutTemplate, Settings } from 'lucide-react';

const items = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { href: '/dashboard/projects', label: 'Projects', icon: FolderOpen },
  { href: '/dashboard/assets', label: 'Media library', icon: Images },
  { href: '/dashboard/templates', label: 'Templates', icon: LayoutTemplate },
  { href: '/dashboard/settings', label: 'Settings & credits', icon: Settings },
];

/** Identical destinations and active state on desktop and mobile. */
export function StudioNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return <nav className="space-y-1.5" aria-label="Studio navigation">{items.map(({ href, label, icon: Icon }) => {
    const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
    return <Link key={href} href={href} onClick={onNavigate} aria-current={active ? 'page' : undefined} className={`flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}><Icon className="size-[18px] shrink-0" aria-hidden="true" /><span className="min-w-0 flex-1">{label}</span></Link>;
  })}</nav>;
}
