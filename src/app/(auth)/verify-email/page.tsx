import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { ConvexVerificationForm } from '@/components/auth/convex-verification-form';

export const metadata = { title: 'Verify your email', description: 'Confirm your FinalFrame email address.' };

export default function VerifyEmailPage() {
  return <div className="ff-card p-7 sm:p-9">
    <span className="grid size-11 place-items-center rounded-2xl bg-primary/15"><MailCheck className="size-5 text-primary" /></span>
    <h1 className="ff-display mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">Check your email.</h1>
    <p className="mt-3 text-sm leading-7 text-muted-foreground">Enter the code from your FinalFrame email to confirm your address.</p>
    <div className="mt-8"><ConvexVerificationForm /></div>
    <Link href="/login" className="ff-link mt-8 inline-flex min-h-11 items-center text-sm">Back to log in</Link>
  </div>;
}
