import Link from 'next/link';
import { ArrowRight, CreditCard, Mail, Users } from 'lucide-react';
import { requireAuth } from '@/lib/guards';
import { createClient } from '@/lib/supabase/server';
import { CreditPacks } from '@/components/billing/credit-packs';
import { getStudioCreditBalance } from '@/lib/credits/service';

export const metadata = { title: 'Settings and credits', description: 'Manage your FinalFrame account, team, and video credits.' };

export default async function SettingsPage() {
  const { user } = await requireAuth();
  const supabase = await createClient();
  const { data: studio } = await supabase.from('studios').select('id,name').eq('user_id', user.id).single();
  const balance = studio ? await getStudioCreditBalance(studio.id) : 0;
  return <div className="mx-auto max-w-5xl space-y-10 py-5 sm:py-8"><div><p className="ff-eyebrow">Settings</p><h1 className="public-heading-section mt-4">Make your studio work the way you do.</h1><p className="public-body-text mt-5 max-w-2xl">Manage your account, your people, and the credits you use to make videos.</p></div><section className="ff-card p-6 sm:p-8"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-secondary"><Mail className="size-5" /></span><div><h2 className="font-semibold">Your account</h2><p className="text-sm text-muted-foreground">The email connected to your studio.</p></div></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><div className="rounded-xl bg-secondary/55 p-4"><p className="ff-eyebrow">Email</p><p className="mt-2 truncate text-sm font-semibold">{user.email}</p></div><div className="rounded-xl bg-secondary/55 p-4"><p className="ff-eyebrow">Studio</p><p className="mt-2 text-sm font-semibold">{studio?.name || 'Your studio'}</p></div></div></section><section className="ff-card p-6 sm:p-8"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#f1c7b7]"><Users className="size-5 text-accent" /></span><div><h2 className="font-semibold">People and access</h2><p className="text-sm text-muted-foreground">Invite people to review or help make projects.</p></div></div><Link href="/dashboard/settings/team" className="ff-button-quiet">Manage team <ArrowRight className="size-4" /></Link></div></section><section className="ff-card p-6 sm:p-8"><div className="mb-6 flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#f6dfb1]"><CreditCard className="size-5" /></span><div><h2 className="font-semibold">Video credits</h2><p className="text-sm text-muted-foreground">See your balance and buy more when you need them.</p></div></div><CreditPacks balance={balance} /></section></div>;
}
