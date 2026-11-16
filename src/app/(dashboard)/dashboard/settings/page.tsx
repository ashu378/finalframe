import Link from 'next/link';
import { ArrowRight, CreditCard, Mail, Users } from 'lucide-react';
import { requireAuth } from '@/lib/guards';
import { api } from '../../../../../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { CreditPacks } from '@/components/billing/credit-packs';
import { getStudioCreditBalance } from '@/lib/credits/service';

export const metadata = { title: 'Settings and credits', description: 'Manage your FinalFrame account, team, and video credits.' };

export default async function SettingsPage() {
  const { user } = await requireAuth();
  const current = await (await getAuthenticatedConvexClient()).query(api.account.current, {});
  const studio = current.studio;
  const canManageStudio = !!studio && (current.role === 'owner' || current.role === 'admin');
  const balance = studio ? await getStudioCreditBalance(studio.externalId) : 0;
  return <div className="mx-auto max-w-5xl space-y-8 py-3 sm:py-6"><div><h1 className="ff-display mt-4 text-3xl font-semibold sm:text-4xl">Account and workspace settings</h1><p className="public-body-text mt-5 max-w-2xl">Manage your account, your people, and the credits you use to make videos.</p></div><section className="ff-card p-6 sm:p-8"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-secondary"><Mail className="size-5" /></span><div><h2 className="font-semibold">Your account</h2><p className="text-sm text-muted-foreground">Your name, saved account information and access settings.</p></div></div><Link href="/dashboard/settings/account" className="ff-button-quiet mt-5 inline-flex min-h-11 items-center">Manage account <ArrowRight className="size-4" /></Link><div className="mt-6 grid gap-4 sm:grid-cols-2"><div className="rounded-xl bg-secondary/55 p-4"><p className="ff-eyebrow">Email</p><p className="mt-2 truncate text-sm font-semibold">{user.email}</p></div><div className="rounded-xl bg-secondary/55 p-4"><p className="ff-eyebrow">Studio</p><p className="mt-2 text-sm font-semibold">{studio?.name || 'Your studio'}</p></div></div></section><section className="ff-card p-6 sm:p-8"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary/10"><Users className="size-5 text-accent" /></span><div><h2 className="font-semibold">People and access</h2><p className="text-sm text-muted-foreground">Invite people to review or help make projects.</p></div></div><div className="flex flex-wrap gap-3"><Link href="/dashboard/settings/team" className="ff-button-quiet">Manage team <ArrowRight className="size-4" /></Link>{canManageStudio ? <Link href="/dashboard/settings/operations" className="ff-button-quiet">Studio operations <ArrowRight className="size-4" /></Link> : null}<Link href="/dashboard/settings/reports" className="ff-button-quiet">Your content reports <ArrowRight className="size-4" /></Link></div></div></section><section className="ff-card p-6 sm:p-8"><div className="mb-6 flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary"><CreditCard className="size-5" /></span><div><h2 className="font-semibold">Video credits</h2><p className="text-sm text-muted-foreground">Check the credits available for making videos.</p></div></div><CreditPacks balance={balance} /></section></div>;
}
