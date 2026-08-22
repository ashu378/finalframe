import Link from 'next/link';
import { Film, Mail } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-border/70 bg-secondary/35">
      <div className="ff-container py-14 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-foreground text-background"><Film className="size-4" /></span>
              <span className="ff-display text-lg font-semibold">FinalFrame</span>
            </Link>
            <p className="mt-5 max-w-sm text-sm leading-6 text-muted-foreground">A friendly production studio for turning ideas, scripts, footage, and brand assets into finished video.</p>
            <Link href="/contact" className="ff-link mt-6 inline-flex items-center gap-2 text-sm"><Mail className="size-4" /> Talk to us</Link>
          </div>
          <div>
            <p className="ff-eyebrow">Make</p>
            <nav className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground">
              <Link href="/methodology" className="transition hover:text-foreground">How it works</Link>
              <Link href="/case-studies" className="transition hover:text-foreground">What you can make</Link>
              <Link href="/pricing" className="transition hover:text-foreground">Credits</Link>
              <Link href="/signup" className="transition hover:text-foreground">Start creating</Link>
            </nav>
          </div>
          <div>
            <p className="ff-eyebrow">Company</p>
            <nav className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground">
              <Link href="/about" className="transition hover:text-foreground">About FinalFrame</Link>
              <Link href="/contact" className="transition hover:text-foreground">Contact</Link>
              <Link href="/login" className="transition hover:text-foreground">Log in</Link>
            </nav>
          </div>
          <div>
            <p className="ff-eyebrow">Good to know</p>
            <nav className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground">
              <Link href="/legal/terms" className="transition hover:text-foreground">Terms</Link>
              <Link href="/legal/privacy" className="transition hover:text-foreground">Privacy</Link>
              <Link href="/legal/cookies" className="transition hover:text-foreground">Cookies</Link>
              <Link href="/legal/gdpr" className="transition hover:text-foreground">GDPR</Link>
            </nav>
          </div>
        </div>
        <div className="mt-14 flex flex-col gap-3 border-t border-border/70 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} FinalFrame. Make something worth watching.</p>
          <p className="flex items-center gap-2"><span className="size-2 rounded-full bg-[hsl(var(--success))]" /> Studio systems online</p>
        </div>
      </div>
    </footer>
  );
}
