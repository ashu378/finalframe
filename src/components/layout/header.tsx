import Link from 'next/link';
import { ArrowUpRight, Film } from 'lucide-react';
import { getCurrentUser } from '@/lib/guards';
import { MobilePublicMenu } from './mobile-public-menu';

export async function Header() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/90 backdrop-blur-xl">
      <div className="ff-container flex min-h-16 items-center justify-between gap-6">
        <Link href="/" className="group flex items-center gap-3" aria-label="FinalFrame home">
          <span className="grid size-10 place-items-center rounded-[.8rem] bg-foreground text-background shadow-[0_10px_22px_-14px_hsl(24_22%_16%)] transition group-hover:-rotate-3">
            <Film className="size-5" strokeWidth={2.2} />
          </span>
          <span className="ff-display text-xl font-semibold tracking-[-.04em]">FinalFrame</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
          <Link href="/methodology" className="ff-button-quiet min-h-10 px-4">How it works</Link>
          <Link href="/case-studies" className="ff-button-quiet min-h-10 px-4">What you can make</Link>
          <Link href="/pricing" className="ff-button-quiet min-h-10 px-4">Credits</Link>
          <Link href="/about" className="ff-button-quiet min-h-10 px-4">About</Link>
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
