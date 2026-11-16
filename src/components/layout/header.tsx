import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import { getCurrentUser } from '@/lib/guards';
import { MobilePublicMenu } from './mobile-public-menu';

export async function Header() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/90 backdrop-blur-xl">
      <div className="ff-container flex min-h-16 items-center justify-between gap-3">
        <Link href="/" className="group flex shrink-0 items-center gap-2" aria-label="FinalFrame home">
          <span className="grid size-10 place-items-center overflow-hidden rounded-[.8rem] bg-card">
            <Image src="/brand/finalframe-icon-v1.png" alt="" width={40} height={40} className="size-full object-cover" priority />
          </span>
          <span className="text-lg font-bold tracking-tight sm:text-xl">FinalFrame</span>
        </Link>

        <nav className="hidden min-w-0 items-center justify-center xl:flex" aria-label="Main navigation">
          <Link href="/methodology" className="ff-button-quiet min-h-10 whitespace-nowrap px-3">How it works</Link>
          <Link href="/case-studies" className="ff-button-quiet min-h-10 whitespace-nowrap px-3">What you can make</Link>
          <Link href="/pricing" className="ff-button-quiet min-h-10 whitespace-nowrap px-3">Credits</Link>
          <Link href="/about" className="ff-button-quiet min-h-10 whitespace-nowrap px-3">About</Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link href={user ? '/dashboard' : '/login'} className="hidden min-h-11 items-center rounded-full px-4 text-sm font-semibold text-muted-foreground transition hover:text-foreground sm:inline-flex">
            {user ? 'Open studio' : 'Log in'}
          </Link>
          <Link href={user ? '/dashboard/create' : '/signup'} className="ff-button-primary min-h-11 whitespace-nowrap px-3 sm:px-4">
            <span className="hidden sm:inline">Make a video</span><span className="sm:hidden">Start</span>
            <ArrowUpRight className="size-4" />
          </Link>
          <MobilePublicMenu authenticated={Boolean(user)} />
        </div>
      </div>
    </header>
  );
}
