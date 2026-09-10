'use client';

import { useRouter } from 'next/navigation';
import { useAuthActions } from '@convex-dev/auth/react';
import { LogOut } from 'lucide-react';

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const { signOut } = useAuthActions();
  return <button type="button" aria-label="Sign out of FinalFrame" onClick={async () => { await signOut(); router.push('/'); router.refresh(); }} className={`flex min-h-11 items-center gap-3 rounded-xl border border-border/70 bg-secondary/45 text-sm font-semibold text-foreground transition hover:border-red-400/50 hover:bg-red-500/10 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${compact ? 'size-11 justify-center px-0' : 'w-full px-3'}`}><LogOut className="size-4 shrink-0" />{compact ? <span className="sr-only">Sign out</span> : 'Sign out'}</button>;
}
