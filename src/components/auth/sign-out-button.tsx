'use client';

import { useRouter } from 'next/navigation';
import { useAuthActions } from '@convex-dev/auth/react';

export function SignOutButton() {
  const router = useRouter();
  const { signOut } = useAuthActions();
  return <button onClick={async () => { await signOut(); router.push('/'); router.refresh(); }} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition hover:bg-red-50 hover:text-red-700">Log out</button>;
}
