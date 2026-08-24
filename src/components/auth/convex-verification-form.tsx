'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthActions } from '@convex-dev/auth/react';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';

export function ConvexVerificationForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { signIn } = useAuthActions();
  const ensureAccount = useMutation(api.account.ensureAccount);
  const [email, setEmail] = useState(params.get('email') || '');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const result = await signIn('password', { flow: 'email-verification', email: email.trim().toLowerCase(), code: code.trim() });
      if (!result.signingIn) throw new Error('That code is not ready yet. Please try again.');
      await ensureAccount({});
      router.push('/dashboard');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Verification failed. Please try again.');
      setPending(false);
    }
  }

  return <form onSubmit={submit} className="space-y-5" aria-busy={pending}>
    <div>
      <label htmlFor="verification-email" className="text-sm font-semibold">Email address</label>
      <input id="verification-email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" required autoComplete="email" className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-primary" />
    </div>
    <div>
      <label htmlFor="verification-code" className="text-sm font-semibold">Verification code</label>
      <input id="verification-code" value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" required placeholder="Enter the code from your email" className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-sm tracking-[.25em] outline-none transition focus:border-primary" />
    </div>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
    <button type="submit" disabled={pending} className="ff-button-primary w-full">{pending ? 'Verifying…' : 'Verify email'}</button>
  </form>;
}
