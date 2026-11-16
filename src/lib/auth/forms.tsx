'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, KeyRound, LockKeyhole, MailCheck, Sparkles } from 'lucide-react';
import { requestPasswordReset, updatePassword } from './actions';
import { ConvexAuthForm } from '@/components/auth/convex-auth-form';

function submit(action: (formData: FormData) => Promise<void>) {
    return async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        await action(new FormData(event.currentTarget));
    };
}

export function LoginForm() {
    return <div className="ff-card p-7 sm:p-9"><div className="mb-8"><span className="grid size-11 place-items-center rounded-2xl bg-primary/15 text-primary"><LockKeyhole className="size-5" /></span><h1 className="ff-display mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">Welcome back.</h1><p className="mt-3 text-sm leading-7 text-muted-foreground">Log in to continue your projects.</p></div><ConvexAuthForm mode="signIn" /><p className="mt-8 border-t border-border/70 pt-6 text-center text-sm text-muted-foreground">New to FinalFrame? <Link href="/signup" className="ff-link inline-flex min-h-11 items-center">Create an account</Link></p></div>;
}

export function SignupForm() {
    return <div className="ff-card p-7 sm:p-9"><div className="mb-8"><span className="grid size-11 place-items-center rounded-2xl bg-primary/15 text-primary"><Sparkles className="size-5" /></span><h1 className="ff-display mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">Start with an idea.</h1><p className="mt-3 text-sm leading-7 text-muted-foreground">Create your account. Your first project can start with a sentence.</p></div><ConvexAuthForm mode="signUp" /><p className="mt-8 border-t border-border/70 pt-6 text-center text-sm text-muted-foreground">Already have an account? <Link href="/login" className="ff-link inline-flex min-h-11 items-center">Log in</Link></p></div>;
}

export function ForgotPasswordForm({ emailEnabled = false }: { emailEnabled?: boolean }) {
    return <div className="ff-card p-7 sm:p-9"><span className="grid size-11 place-items-center rounded-2xl bg-primary/15 text-primary"><MailCheck className="size-5" /></span><h1 className="ff-display mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">Forgot your password?</h1><p className="mt-3 text-sm leading-7 text-muted-foreground">{emailEnabled ? 'Enter your email and we will send a password reset link.' : 'Password reset by email is not available yet. If you know your password, you can still log in.'}</p>{emailEnabled ? <form onSubmit={submit(requestPasswordReset)} className="mt-8 space-y-5"><div><label htmlFor="email" className="text-sm font-semibold">Email address</label><input type="email" id="email" name="email" required placeholder="you@example.com" className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-base outline-none transition focus:border-primary" /></div><button type="submit" className="ff-button-primary min-h-12 w-full">Send reset link</button></form> : <div className="mt-8 rounded-2xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">If you cannot log in, keep your account email handy. Email recovery needs to be connected before a reset link can be sent.</div>}<Link href="/login" className="ff-link mt-8 inline-flex items-center gap-2 text-sm"><ArrowLeft className="size-4" /> Back to log in</Link></div>;
}

export function ResetPasswordForm() {
    return <div className="ff-card p-7 sm:p-9"><span className="grid size-11 place-items-center rounded-2xl bg-primary/15 text-primary"><KeyRound className="size-5" /></span><h1 className="ff-display mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">Choose a new password.</h1><p className="mt-3 text-sm leading-7 text-muted-foreground">Choose a password with at least 8 characters.</p><form onSubmit={submit(updatePassword)} className="mt-8 space-y-5"><div><label htmlFor="email" className="text-sm font-semibold">Account email</label><input type="email" id="email" name="email" required placeholder="you@example.com" className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-base outline-none transition focus:border-primary" /></div><div><label htmlFor="password" className="text-sm font-semibold">New password</label><input type="password" id="password" name="password" required minLength={8} placeholder="At least 8 characters" className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-base outline-none transition focus:border-primary" /></div><div><label htmlFor="confirmPassword" className="text-sm font-semibold">Confirm new password</label><input type="password" id="confirmPassword" name="confirmPassword" required minLength={8} placeholder="Type it again" className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-base outline-none transition focus:border-primary" /></div><button type="submit" className="ff-button-primary min-h-12 w-full">Update password <ArrowRight className="size-4" /></button></form><p className="mt-8 text-sm text-muted-foreground">Need to start over? <Link href="/login" className="ff-link inline-flex min-h-11 items-center">Back to log in</Link></p></div>;
}
