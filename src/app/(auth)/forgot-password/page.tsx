import Link from 'next/link';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { requestPasswordReset } from '@/lib/auth/actions';

export const metadata = { title: 'Reset your password', description: 'Reset your FinalFrame password.' };

export default function ForgotPasswordPage() {
  return <div className="ff-card p-7 sm:p-9"><span className="grid size-11 place-items-center rounded-2xl bg-[#c8ddd5]"><MailCheck className="size-5 text-[hsl(var(--success))]" /></span><h1 className="ff-display mt-7 text-3xl font-semibold">Find your way back in.</h1><p className="mt-3 leading-6 text-muted-foreground">Enter your email and we will send a password reset link.</p><form action={requestPasswordReset} className="mt-8 space-y-5"><div><label htmlFor="email" className="text-sm font-semibold">Email address</label><input type="email" id="email" name="email" required placeholder="you@example.com" className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-primary" /></div><button type="submit" className="ff-button-primary w-full">Send reset link</button></form><Link href="/login" className="ff-link mt-8 inline-flex items-center gap-2 text-sm"><ArrowLeft className="size-4" /> Back to log in</Link></div>;
}
