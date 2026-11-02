'use client';

import { useState } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { LogOut } from 'lucide-react';

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const { signOut } = useAuthActions();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  return <div><button type="button" aria-label="Sign out of FinalFrame" disabled={pending} onClick={async () => {
    setPending(true);
    setFailed(false);
    try {
      await signOut();
      // A fresh document removes private cached screens after session removal.
      window.location.replace('/');
    } catch {
      setFailed(true);
      setPending(false);
    }
  }} className={`flex min-h-11 items-center gap-3 rounded-xl border border-border/70 bg-secondary/45 text-sm font-semibold text-foreground transition hover:border-red-400/50 hover:bg-red-500/10 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 disabled:opacity-60 ${compact ? 'size-11 justify-center px-0' : 'w-full px-3'}`}><LogOut className="size-4 shrink-0" />{compact ? <span className="sr-only">{pending ? 'Signing out' : 'Sign out'}</span> : pending ? 'Signing out…' : 'Sign out'}</button>{failed ? <p role="alert" className="mt-2 max-w-52 text-xs text-destructive">We couldn’t sign you out. Please try again.</p> : null}</div>;
}
