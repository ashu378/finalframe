import Link from 'next/link';
import Image from 'next/image';
import { Plus } from 'lucide-react';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { StudioNavigation } from './studio-navigation';

export function Sidebar() {
  return <aside className="fixed inset-y-0 left-0 flex w-64 flex-col border-r border-border bg-card px-4 py-6">
    <Link href="/dashboard" className="flex min-h-11 items-center gap-3 px-3"><Image src="/brand/finalframe-mark-small.png" alt="" width={32} height={32} className="rounded-lg grayscale" /><span className="ff-display text-xl font-semibold">FinalFrame<span className="text-primary">.</span></span></Link>
    <Link href="/dashboard/create" className="ff-button-primary mb-8 mt-8 w-full"><Plus className="size-4" aria-hidden="true" />Create a video</Link>
    <StudioNavigation />
    <div className="mt-auto border-t border-border pt-5"><SignOutButton /></div>
  </aside>;
}
