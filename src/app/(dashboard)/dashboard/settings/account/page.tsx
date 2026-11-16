import Link from 'next/link';
import { requireAuth } from '@/lib/guards';
import { getAccountProfile } from '@/lib/account-lifecycle/actions';
import { AccountSettings } from '@/components/account/account-settings';
export const metadata = { title: 'Account settings | FinalFrame' };
export default async function AccountSettingsPage() {
  await requireAuth(); const profile = await getAccountProfile();
  return <div className="mx-auto max-w-4xl space-y-7 py-3 sm:py-8"><header><Link href="/dashboard/settings" className="ff-link inline-flex min-h-11 items-center text-sm">Back to settings</Link><h1 className="ff-display mt-3 text-3xl font-semibold sm:text-4xl">Your account</h1><p className="mt-4 text-sm leading-7 text-muted-foreground">Change your name, download a list of your account and projects, or request account closure.</p></header><AccountSettings profile={profile} /></div>;
}
