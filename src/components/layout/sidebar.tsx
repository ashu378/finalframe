'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Film, FolderOpen, LayoutGrid, LayoutTemplate, LogOut, Plus, Settings, Sparkles, WalletCards } from 'lucide-react';
import { SignOutButton } from '@/components/auth/sign-out-button';

const navItems = [
  { href: '/dashboard', label: 'Projects', icon: LayoutGrid },
  { href: '/dashboard/assets', label: 'Media library', icon: FolderOpen },
  { href: '/dashboard/templates', label: 'Templates', icon: LayoutTemplate },
  { href: '/dashboard/settings', label: 'Settings & credits', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return <aside className="fixed inset-y-0 left-0 flex w-64 flex-col border-r border-border/70 bg-card/95 px-4 py-5 backdrop-blur-xl">
    <Link href="/dashboard" className="flex items-center gap-3 px-3"><span className="grid size-9 place-items-center rounded-xl bg-foreground text-background"><Film className="size-4" /></span><span className="ff-display text-lg font-semibold">FinalFrame</span></Link>
    <Link href="/dashboard/create" className="ff-button-primary mt-8 w-full"><Plus className="size-4" /> Create a video</Link>
    <nav className="mt-8 space-y-1" aria-label="Studio navigation">{navItems.map((item) => { const Icon = item.icon; const active = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href)); return <Link key={item.href} href={item.href} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition ${active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/65 hover:text-foreground'}`}><Icon className="size-4" />{item.label}</Link>; })}</nav>
    <div className="mt-auto space-y-3"><div className="rounded-2xl bg-[#f4ead6] p-4"><div className="flex items-center gap-2 text-xs font-semibold"><Sparkles className="size-4 text-accent" /> Make something new</div><p className="mt-2 text-xs leading-5 text-muted-foreground">Start with a sentence. You can add the details later.</p><Link href="/dashboard/create" className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-foreground underline decoration-primary/60 underline-offset-4">Start now <Plus className="size-3.5" /></Link></div><Link href="/dashboard/settings" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground"><WalletCards className="size-4" /> Credits and account</Link><SignOutButton /></div>
  </aside>;
}
