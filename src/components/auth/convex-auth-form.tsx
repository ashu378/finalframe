'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuthActions } from '@convex-dev/auth/react';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { authenticatedReturnPath } from '@/lib/auth/return-path';

type Mode = 'signIn' | 'signUp';

function safeAuthError(mode: Mode) {
  return mode === 'signUp'
    ? 'We couldn’t create your account. Check your details and try again.'
    : 'We couldn’t log you in. Check your email and password and try again.';
}

export function ConvexAuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const { signIn } = useAuthActions();
  const ensureAccount = useMutation(api.account.ensureAccount);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function submit(formData: FormData) {
    setPending(true); setError('');
    const returnTo = authenticatedReturnPath(new URLSearchParams(window.location.search).get('redirect'));
    try {
      const result = await signIn('password', {
        flow: mode,
        email: String(formData.get('email') || '').trim().toLowerCase(),
        password: String(formData.get('password') || ''),
        ...(mode === 'signUp' ? { name: String(formData.get('fullName') || '').trim() } : {}),
      });
      if (!result.signingIn) {
        router.push(`/verify-email?email=${encodeURIComponent(String(formData.get('email') || ''))}&redirect=${encodeURIComponent(returnTo)}`);
        return;
      }
      await ensureAccount(mode === 'signUp' ? { name: String(formData.get('fullName') || '').trim() } : {});
      router.push(returnTo);
      router.refresh();
    } catch {
      // Convex errors can contain implementation details and request traces.
      // Keep those in server logs; never render them to an end user.
      setError(safeAuthError(mode));
      setPending(false);
    }
  }

  const inputClass = "mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-base outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15";
  return <form action={submit} className="space-y-5" aria-busy={pending}>
    {mode === 'signUp' && <div><label htmlFor="fullName" className="text-sm font-semibold">Your name</label><input type="text" id="fullName" name="fullName" required autoComplete="name" placeholder="What should we call you?" className={inputClass} /></div>}
    <div><label htmlFor="email" className="text-sm font-semibold">Email address</label><input type="email" id="email" name="email" required autoComplete="email" placeholder="you@example.com" className={inputClass} /></div>
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2"><label htmlFor="password" className="text-sm font-semibold">{mode === 'signUp' ? 'Create a password' : 'Password'}</label>{mode === 'signIn' ? <Link href="/forgot-password" className="inline-flex min-h-8 items-center text-xs font-medium text-muted-foreground hover:text-primary">Forgot password?</Link> : null}</div>
      <div className="relative"><input type={showPassword ? 'text' : 'password'} id="password" name="password" required minLength={8} autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'} aria-describedby={mode === 'signUp' ? 'password-help' : undefined} placeholder={mode === 'signUp' ? 'At least 8 characters' : 'Your password'} className={`${inputClass} pr-14`} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)} className="absolute bottom-0 right-0 grid size-12 place-items-center rounded-r-xl text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}</button></div>
      {mode === 'signUp' ? <p id="password-help" className="mt-2 text-xs leading-5 text-muted-foreground">Use at least 8 characters. Choose a password you don’t use elsewhere.</p> : null}
    </div>
    {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive">{error}</p>}
    <button type="submit" disabled={pending} className="ff-button-primary min-h-12 w-full">{pending ? <><Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />{mode === 'signUp' ? 'Creating account…' : 'Logging in…'}</> : <>{mode === 'signUp' ? 'Create account' : 'Log in'}<ArrowRight className="size-4" aria-hidden="true" /></>}</button>
  </form>;
}
