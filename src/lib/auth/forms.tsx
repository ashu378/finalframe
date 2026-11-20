'use client';

import Link from 'next/link';
import { LockKeyhole, Sparkles } from 'lucide-react';
import { PasswordRecoveryForm } from '@/components/auth/password-recovery-form';
import { ConvexAuthForm } from '@/components/auth/convex-auth-form';

export function LoginForm() {
    return <div className="ff-card p-7 sm:p-9"><div className="mb-8"><span className="grid size-11 place-items-center rounded-2xl bg-primary/15 text-primary"><LockKeyhole className="size-5" /></span><h1 className="ff-display mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">Welcome back.</h1><p className="mt-3 text-sm leading-7 text-muted-foreground">Log in to continue your projects.</p></div><ConvexAuthForm mode="signIn" /><p className="mt-8 border-t border-border/70 pt-6 text-center text-sm text-muted-foreground">New to FinalFrame? <Link href="/signup" className="ff-link inline-flex min-h-11 items-center">Create an account</Link></p></div>;
}

export function SignupForm() {
    return <div className="ff-card p-7 sm:p-9"><div className="mb-8"><span className="grid size-11 place-items-center rounded-2xl bg-primary/15 text-primary"><Sparkles className="size-5" /></span><h1 className="ff-display mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">Start with an idea.</h1><p className="mt-3 text-sm leading-7 text-muted-foreground">Create your account. Your first project can start with a sentence.</p></div><ConvexAuthForm mode="signUp" /><p className="mt-8 border-t border-border/70 pt-6 text-center text-sm text-muted-foreground">Already have an account? <Link href="/login" className="ff-link inline-flex min-h-11 items-center">Log in</Link></p></div>;
}

export function ForgotPasswordForm() {
    return <PasswordRecoveryForm mode="request" />;
}

export function ResetPasswordForm() {
    return <PasswordRecoveryForm mode="reset" />;
}
