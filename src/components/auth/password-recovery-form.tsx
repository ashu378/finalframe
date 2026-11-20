'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthActions } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';

const inputClass = 'mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-base focus:outline-none focus:ring-2 focus:ring-primary';
export function PasswordRecoveryForm({ mode }: { mode: 'request' | 'reset' }) {
  const router = useRouter();
  const params = useSearchParams();
  const { signIn } = useAuthActions();
  const availability = useQuery(api.auth.emailAvailability, {});
  const [email, setEmail] = useState(params.get('email') || '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const enabled = availability?.enabled === true;

  async function requestCode() {
    setPending(true); setError('');
    try { await signIn('password', { flow: 'reset', email: email.trim().toLowerCase() }); }
    catch { /* Same response for unknown accounts, throttling and provider failure. */ }
    finally { setPending(false); setSent(true); setCooldown(true); setTimeout(() => setCooldown(false), 60_000); }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === 'request') { await requestCode(); return; }
    const data = new FormData(event.currentTarget);
    if (data.get('password') !== data.get('confirmPassword')) { setError('The passwords do not match. Please enter them again.'); return; }
    setPending(true); setError('');
    try {
      const result = await signIn('password', { flow: 'reset-verification', email: email.trim().toLowerCase(), code: String(data.get('code') || '').trim(), newPassword: String(data.get('password') || '') });
      if (!result.signingIn) throw new Error('Not signed in');
      router.push('/dashboard'); router.refresh();
    } catch { setError('We couldn’t reset your password. Check your email and latest code. Codes expire after 10 minutes and work once. If you have tried several times, wait before trying again.'); }
    finally { setPending(false); }
  }
  return <div className="ff-card p-7 sm:p-9">
    <h1 className="ff-display text-3xl font-semibold">{mode === 'request' ? 'Forgot your password?' : 'Choose a new password.'}</h1>
    <p className="mt-3 text-sm leading-7 text-muted-foreground">{mode === 'request' ? 'We’ll email you a six-digit code. Your password stays unchanged until you use it.' : 'Enter the latest code from your email and a new password with at least 8 characters.'}</p>
    {availability === undefined ? <p role="status" className="mt-6">Checking email availability…</p> : !enabled ? <p role="status" className="mt-6">Email recovery is being configured. Please try again shortly.</p> : <form onSubmit={submit} className="mt-6 space-y-5" aria-busy={pending}>
      <div><label htmlFor="recovery-email">Email address</label><input id="recovery-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} className={inputClass} /></div>
      {mode === 'reset' ? <>
        <div><label htmlFor="recovery-code">Six-digit code</label><input id="recovery-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required className={inputClass} /></div>
        <div><label htmlFor="recovery-password">New password</label><input id="recovery-password" name="password" type="password" autoComplete="new-password" minLength={8} required className={inputClass} /></div>
        <div><label htmlFor="recovery-confirm">Confirm new password</label><input id="recovery-confirm" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required className={inputClass} /></div>
      </> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {sent ? <p role="status" className="text-sm">If an account uses this email and sending is available, a code is on its way. Check spam too. Use the latest code within 10 minutes. If nothing arrives, wait a minute and try again.</p> : null}
      <button type="submit" disabled={pending || (mode === 'request' && cooldown)} className="ff-button-primary min-h-12 w-full">{pending ? 'Please wait…' : mode === 'request' ? (cooldown ? 'Wait one minute before resending' : 'Send reset code') : 'Update password'}</button>
      {mode === 'request' && sent ? <Link className="ff-link inline-flex min-h-11 items-center" href={`/reset-password?email=${encodeURIComponent(email.trim().toLowerCase())}`}>I have a code — set my new password</Link> : null}
      {mode === 'reset' ? <button type="button" onClick={() => void requestCode()} disabled={pending || cooldown || !email} className="ff-link min-h-11">{cooldown ? 'Wait one minute before resending' : 'Send me a new code'}</button> : null}
    </form>}
    <Link href="/login" className="ff-link mt-6 inline-flex min-h-11 items-center">Back to log in</Link>
  </div>;
}
