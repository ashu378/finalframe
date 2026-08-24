'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthActions } from '@convex-dev/auth/react';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';

type Mode = 'signIn' | 'signUp';

export function ConvexAuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const { signIn } = useAuthActions();
  const ensureAccount = useMutation(api.account.ensureAccount);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(formData: FormData) {
    setPending(true); setError('');
    try {
      const result = await signIn('password', {
        flow: mode,
        email: String(formData.get('email') || '').trim().toLowerCase(),
        password: String(formData.get('password') || ''),
        ...(mode === 'signUp' ? { name: String(formData.get('fullName') || '').trim() } : {}),
      });
      if (!result.signingIn) {
        router.push(`/verify-email?email=${encodeURIComponent(String(formData.get('email') || ''))}`);
        return;
      }
      if (mode === 'signUp') await ensureAccount({ name: String(formData.get('fullName') || '').trim() });
      router.push('/dashboard');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Authentication failed. Please try again.');
      setPending(false);
    }
  }

  return <form action={submit} className="space-y-5" aria-busy={pending}>
    {mode === 'signUp' && <div><label htmlFor="fullName" className="text-sm font-semibold">Your name</label><input type="text" id="fullName" name="fullName" required placeholder="What should we call you?" className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-primary" /></div>}
    <div><label htmlFor="email" className="text-sm font-semibold">Email address</label><input type="email" id="email" name="email" required autoComplete="email" placeholder="you@example.com" className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-primary" /></div>
    <div><label htmlFor="password" className="text-sm font-semibold">{mode === 'signUp' ? 'Create a password' : 'Password'}</label><input type="password" id="password" name="password" required minLength={8} autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'} placeholder="At least 8 characters" className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-primary" /></div>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
    <button type="submit" disabled={pending} className="ff-button-primary w-full">{pending ? 'Connecting…' : mode === 'signUp' ? 'Create account' : 'Log in'}</button>
  </form>;
}
