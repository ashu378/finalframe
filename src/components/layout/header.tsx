import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import { getCurrentUser } from '@/lib/guards';
import { MobilePublicMenu } from './mobile-public-menu';

export async function Header() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/90 backdrop-blur-xl">
      <div className="ff-container flex min-h-16 items-center justify-between gap-6">
        <Link href="/" className="group flex items-center gap-3" aria-label="FinalFrame home">
          <span className="grid size-10 place-items-center overflow-hidden rounded-[.8rem] border border-border/70 bg-card shadow-[0_10px_22px_-14px_hsl(222_100%_72%_/_0.55)] transition group-hover:-rotate-3">
            <Image src="/brand/finalframe-mark-small.png" alt="" width={40} height={40} className="size-full object-cover" priority />
          </span>
          <span className="ff-display text-xl font-semibold tracking-[-.04em]">FinalFrame</span>
        </Link>

        <nav className="hidden min-w-0 items-center justify-center gap-1 lg:flex" aria-label="Main navigation">
          <Link href="/methodology" className="ff-button-quiet min-h-10 whitespace-nowrap px-4">How it works</Link>
          <Link href="/case-studies" className="ff-button-quiet min-h-10 whitespace-nowrap px-4">What you can make</Link>
          <Link href="/pricing" className="ff-button-quiet min-h-10 whitespace-nowrap px-4">Credits</Link>
          <Link href="/about" className="ff-button-quiet min-h-10 whitespace-nowrap px-4">About</Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link href={user ? '/dashboard' : '/login'} className="hidden min-h-11 items-center rounded-full px-4 text-sm font-semibold text-muted-foreground transition hover:text-foreground sm:inline-flex">
            {user ? 'Open studio' : 'Log in'}
          </Link>
          <Link href={user ? '/dashboard/create' : '/signup'} className="ff-button-primary min-h-11 px-4 sm:px-5">
            <span className="hidden sm:inline">Make a video</span><span className="sm:hidden">Start</span>
            <ArrowUpRight className="size-4" />
          </Link>
          <MobilePublicMenu authenticated={Boolean(user)} />
        </div>
      </div>
    </header>
  );
}
