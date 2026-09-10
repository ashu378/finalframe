import Link from 'next/link';
import { ArrowLeft, Mail, UserRound } from 'lucide-react';
import { requireAdmin } from '@/lib/guards';
import { api } from '@/../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';

export const metadata = { title: 'People | Admin', description: 'FinalFrame people management.' };

export default async function AdminUsersPage() {
  await requireAdmin();
  const profiles = await (await getAuthenticatedConvexClient()).query(api.app.adminUsers, {});
  return <div className="space-y-9"><div><Link href="/admin" className="inline-flex items-center gap-2 text-sm text-[#91a0b8] transition hover:text-[#eaf0fa]"><ArrowLeft className="size-4" /> Overview</Link><p className="mt-9 text-xs font-semibold uppercase tracking-[.16em] text-[#91a0b8]">People</p><h1 className="ff-display mt-4 text-4xl font-semibold">The people making things.</h1><p className="mt-4 max-w-2xl leading-7 text-[#91a0b8]">A live list of accounts from Convex. Keep support and access decisions human.</p></div><div className="overflow-hidden rounded-[1.25rem] border border-[#263143]/45 bg-[#151b25]"><div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-[#263143]/45 px-5 py-4 text-xs font-semibold uppercase tracking-[.12em] text-[#91a0b8]"><span>Person</span><span className="hidden sm:block">Onboarding</span><span>Role</span></div>{profiles?.length ? profiles.map((profile: any) => <div key={profile._id} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-[#263143]/30 px-5 py-5 last:border-0"><div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#1c2533]"><UserRound className="size-4 text-[#86a7ff]" /></span><div className="min-w-0"><p className="truncate text-sm font-semibold">{profile.name || 'Unnamed account'}</p><p className="mt-1 flex items-center gap-1 truncate text-xs text-[#91a0b8]"><Mail className="size-3" /> {profile.email || 'No email'}</p></div></div><span className="hidden rounded-full bg-[#9be3c3] px-3 py-1.5 text-xs font-semibold text-[#0b0d12] sm:inline-flex">{profile.metadata?.onboardingCompleted ? 'Ready' : 'In progress'}</span><span className="text-xs text-[#91a0b8]">Creator</span></div>) : <div className="p-12 text-center text-[#91a0b8]">No accounts are available yet.</div>}</div></div>;
}
