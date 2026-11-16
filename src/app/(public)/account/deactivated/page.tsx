import Link from 'next/link';
import { LockKeyhole } from 'lucide-react';
export const metadata = { title: 'Account access disabled' };
export default function DeactivatedAccountPage() {
  return <section className="mx-auto w-full max-w-2xl space-y-6 px-5 py-12 sm:px-8 sm:py-24"><LockKeyhole className="size-8 text-primary" aria-hidden="true" /><h1 className="ff-display text-4xl font-semibold">About closed account access</h1><p className="text-base leading-8 text-muted-foreground">When an account deletion request is accepted, access is disabled. Projects, team history and activity records stay stored. The request does not permanently delete data. A platform administrator must review any request to restore access.</p><div className="rounded-2xl border border-border bg-card p-5 sm:p-6"><h2 className="text-lg font-semibold">Need help getting back in?</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">Contact support using the email on your account. Keep your request reference if you have one. This page does not show private request status or restore access.</p><Link href="/contact" className="ff-button-primary mt-5">Contact support</Link></div></section>;
}
