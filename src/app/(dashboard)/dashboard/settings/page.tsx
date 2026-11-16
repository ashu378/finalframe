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
  return <div className="mx-auto max-w-5xl space-y-8">
    <header className="border-b border-border pb-6"><h1 className="ff-display text-3xl font-semibold sm:text-4xl">Settings</h1><p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">Your account, the people you work with and your video credits.</p></header>
    <div className="grid items-start gap-8 lg:grid-cols-[12rem_minmax(0,1fr)]">
      <nav aria-label="Settings sections" className="flex flex-wrap gap-2 pb-2 lg:sticky lg:top-6 lg:flex-col"><a href="#account" className="flex min-h-11 shrink-0 items-center gap-3 rounded-xl bg-card px-4 text-sm font-medium hover:text-primary"><Mail className="size-4" aria-hidden="true" />Your account</a><a href="#people" className="flex min-h-11 shrink-0 items-center gap-3 rounded-xl px-4 text-sm text-muted-foreground hover:bg-card hover:text-foreground"><Users className="size-4" aria-hidden="true" />People and access</a><a href="#credits" className="flex min-h-11 shrink-0 items-center gap-3 rounded-xl px-4 text-sm text-muted-foreground hover:bg-card hover:text-foreground"><CreditCard className="size-4" aria-hidden="true" />Video credits</a></nav>
      <div className="min-w-0 space-y-8">
        <section id="account" className="scroll-mt-24 overflow-hidden rounded-2xl border border-border"><div className="flex flex-col justify-between gap-4 bg-card p-5 sm:flex-row sm:items-center sm:p-6"><div><h2 className="text-lg font-semibold">Your account</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Your name, account information and access settings.</p></div><Link href="/dashboard/settings/account" className="ff-button-secondary min-h-11 shrink-0">Manage account<ArrowRight className="size-4" aria-hidden="true" /></Link></div><dl className="divide-y divide-border px-5 sm:px-6"><div className="grid gap-2 py-5 sm:grid-cols-[7rem_1fr]"><dt className="text-sm text-muted-foreground">Email</dt><dd className="break-all text-sm font-medium">{user.email}</dd></div><div className="grid gap-2 py-5 sm:grid-cols-[7rem_1fr]"><dt className="text-sm text-muted-foreground">Studio</dt><dd className="break-words text-sm font-medium">{studio?.name || 'Your studio'}</dd></div></dl></section>
        <section id="people" className="scroll-mt-24"><h2 className="text-lg font-semibold">People and access</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Choose who can help make videos, review work or manage your workspace.</p><div className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border"><Link href="/dashboard/settings/team" className="flex min-h-16 items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-card"><span><span className="block text-sm font-semibold">Manage team</span><span className="mt-1 block text-sm text-muted-foreground">Invitations, roles and workspace access</span></span><ArrowRight className="size-4 shrink-0" aria-hidden="true" /></Link>{canManageStudio ? <Link href="/dashboard/settings/operations" className="flex min-h-16 items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-card"><span><span className="block text-sm font-semibold">Studio operations</span><span className="mt-1 block text-sm text-muted-foreground">Generation settings and workspace controls</span></span><ArrowRight className="size-4 shrink-0" aria-hidden="true" /></Link> : null}<Link href="/dashboard/settings/reports" className="flex min-h-16 items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-card"><span><span className="block text-sm font-semibold">Your content reports</span><span className="mt-1 block text-sm text-muted-foreground">Follow up on a concern you reported</span></span><ArrowRight className="size-4 shrink-0" aria-hidden="true" /></Link></div></section>
        <section id="credits" className="scroll-mt-24 border-t border-border pt-8"><h2 className="text-lg font-semibold">Video credits</h2><p className="mb-5 mt-2 text-sm leading-6 text-muted-foreground">Check the credits available for making videos.</p><CreditPacks balance={balance} /></section>
      </div>
    </div>
  </div>;
}
