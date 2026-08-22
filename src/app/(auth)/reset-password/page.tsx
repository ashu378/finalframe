import Link from 'next/link';
import { ArrowRight, KeyRound } from 'lucide-react';
import { updatePassword } from '@/lib/auth/actions';

export const metadata = { title: 'Choose a new password', description: 'Set a new FinalFrame password.' };

export default function ResetPasswordPage() {
  return <div className="ff-card p-7 sm:p-9"><span className="grid size-11 place-items-center rounded-2xl bg-[#f6dfb1]"><KeyRound className="size-5" /></span><h1 className="ff-display mt-7 text-3xl font-semibold">Choose a new password.</h1><p className="mt-3 leading-6 text-muted-foreground">A fresh password will keep your studio safe.</p><form action={updatePassword} className="mt-8 space-y-5"><div><label htmlFor="password" className="text-sm font-semibold">New password</label><input type="password" id="password" name="password" required minLength={8} placeholder="At least 8 characters" className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-primary" /></div><div><label htmlFor="confirmPassword" className="text-sm font-semibold">Confirm new password</label><input type="password" id="confirmPassword" name="confirmPassword" required minLength={8} placeholder="Type it again" className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-primary" /></div><button type="submit" className="ff-button-primary w-full">Update password <ArrowRight className="size-4" /></button></form><p className="mt-8 text-sm text-muted-foreground">Need to start over? <Link href="/login" className="ff-link">Back to log in</Link></p></div>;
}
