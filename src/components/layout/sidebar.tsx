import Link from 'next/link';
import Image from 'next/image';
import { Plus } from 'lucide-react';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { StudioNavigation } from './studio-navigation';

export function Sidebar() {
  return <aside className="fixed inset-y-0 left-0 flex w-64 flex-col border-r border-border bg-card/60 px-4 py-5">
    <Link href="/dashboard" className="flex min-h-11 items-center gap-3 px-3"><Image src="/brand/finalframe-mark-small.png" alt="" width={32} height={32} className="rounded-lg grayscale" /><span className="ff-display text-xl font-semibold">FinalFrame<span className="text-primary">.</span></span></Link>
    <Link href="/dashboard/create" className="ff-button-primary mb-6 mt-7 w-full"><Plus className="size-4" aria-hidden="true" />Create a video</Link>
    <div className="flex-1 overflow-y-auto pb-6"><StudioNavigation /></div>
    <div className="mt-auto border-t border-border pt-4"><Link href="/dashboard/settings/account" className="mb-3 flex min-h-11 items-center rounded-xl px-4 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">Your account</Link><SignOutButton /></div>
  </aside>;
}
