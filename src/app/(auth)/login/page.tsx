import Link from 'next/link';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { signIn } from '@/lib/auth/actions';

export const metadata = { title: 'Log in', description: 'Log in to your FinalFrame studio.' };

export default function LoginPage() {
  return <div className="ff-card p-7 sm:p-9"><div className="mb-8"><span className="grid size-11 place-items-center rounded-2xl bg-[#f6dfb1]"><LockKeyhole className="size-5" /></span><h1 className="ff-display mt-7 text-3xl font-semibold">Welcome back.</h1><p className="mt-3 leading-6 text-muted-foreground">Pick up where your next video left off.</p></div><form action={signIn} className="space-y-5"><div><label htmlFor="email" className="text-sm font-semibold">Email address</label><input type="email" id="email" name="email" required placeholder="you@example.com" className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-primary" /></div><div><div className="flex items-center justify-between gap-3"><label htmlFor="password" className="text-sm font-semibold">Password</label><Link href="/forgot-password" className="text-xs font-semibold text-accent underline underline-offset-4">Forgot password?</Link></div><input type="password" id="password" name="password" required placeholder="Your password" className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-primary" /></div><button type="submit" className="ff-button-primary w-full">Log in <ArrowRight className="size-4" /></button></form><p className="mt-8 border-t border-border/70 pt-6 text-center text-sm text-muted-foreground">New to FinalFrame? <Link href="/signup" className="ff-link">Create an account</Link></p></div>;
}
