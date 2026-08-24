'use client';

import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';

const links = [
  { href: '/methodology', label: 'How it works' },
  { href: '/case-studies', label: 'What you can make' },
  { href: '/pricing', label: 'Credits' },
  { href: '/about', label: 'About' },
];

export function MobilePublicMenu({ authenticated }: { authenticated: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-border/70 text-foreground transition hover:bg-secondary focus-visible:outline-none"
        aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={open}
        aria-controls="mobile-public-navigation"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
      </button>

      {open ? (
        <div
          id="mobile-public-navigation"
          className="absolute inset-x-0 top-full border-b border-border/70 bg-background px-5 pb-5 pt-3 shadow-xl"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
        >
          <nav className="grid gap-1" aria-label="Mobile main navigation">
            {links.map((link) => (
              <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="flex min-h-12 items-center rounded-xl px-4 text-base font-semibold transition hover:bg-secondary">
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 grid gap-2 border-t border-border/70 pt-3 sm:grid-cols-2">
            <Link href={authenticated ? '/dashboard' : '/login'} onClick={() => setOpen(false)} className="ff-button-quiet min-h-12 w-full">
              {authenticated ? 'Open studio' : 'Log in'}
            </Link>
            <Link href={authenticated ? '/dashboard/create' : '/signup'} onClick={() => setOpen(false)} className="ff-button-primary min-h-12 w-full">
              Make a video
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
