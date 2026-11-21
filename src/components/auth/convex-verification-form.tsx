'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthActions } from '@convex-dev/auth/react';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { authenticatedReturnPath } from '@/lib/auth/return-path';

export function ConvexVerificationForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { signIn } = useAuthActions();
  const ensureAccount = useMutation(api.account.ensureAccount);
  const [email, setEmail] = useState(params.get('email') || '');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cooldown, setCooldown] = useState(false);

  async function resend() {
    setPending(true); setError('');
    try { await signIn('password', { flow: 'email-verification', email: email.trim().toLowerCase() }); }
    catch { /* Do not disclose account existence or provider internals. */ }
    finally { setPending(false); setNotice('If your account needs verification and sending is available, a new code is on its way. Check spam too. Wait a minute before resending.'); setCooldown(true); setTimeout(() => setCooldown(false), 60_000); }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const result = await signIn('password', { flow: 'email-verification', email: email.trim().toLowerCase(), code: code.trim() });
      if (!result.signingIn) throw new Error('That code is not ready yet. Please try again.');
      await ensureAccount({});
      router.push(authenticatedReturnPath(params.get('redirect')));
      router.refresh();
    } catch {
      // Do not expose Convex/Auth stack traces or internal request details.
      setError('Check your email and the latest six-digit code. Codes expire after 10 minutes and work once. After several failed attempts, wait before trying again.');
      setPending(false);
    }
  }

  return <form onSubmit={submit} className="space-y-5" aria-busy={pending}>
    <div>
      <label htmlFor="verification-email" className="text-sm font-semibold">Email address</label>
      <input id="verification-email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" required autoComplete="email" className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-base outline-none transition focus:border-primary" />
    </div>
    <div>
      <label htmlFor="verification-code" className="text-sm font-semibold">Verification code</label>
      <input id="verification-code" value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required placeholder="Enter the code from your email" className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-base tracking-[.25em] outline-none transition focus:border-primary" />
    </div>
    <p className="text-sm text-muted-foreground">Use the latest six-digit code within 10 minutes.</p>
    {notice ? <p role="status" className="text-sm">{notice}</p> : null}
    {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive">{error}</p>}
    <button type="submit" disabled={pending} className="ff-button-primary min-h-12 w-full">{pending ? 'Verifying…' : 'Verify email'}</button>
    <button type="button" onClick={() => void resend()} disabled={pending || cooldown || !email} className="ff-link min-h-11">{cooldown ? 'Wait one minute before resending' : 'Send me a new code'}</button>
  </form>;
}
