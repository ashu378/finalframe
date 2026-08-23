import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CheckCircle2, ShieldCheck } from 'lucide-react';
import { requireAdmin } from '@/lib/guards';
import { api } from '@/../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';

export const metadata = { title: 'Moderation | Admin', description: 'FinalFrame content and job review.' };

export default async function AdminModerationPage() {
  await requireAdmin();
  const { counts } = await (await getAuthenticatedConvexClient()).query(api.app.adminOverview, {});
  return <div className="space-y-9"><div><Link href="/admin" className="inline-flex items-center gap-2 text-sm text-[#cbb7a4] transition hover:text-[#f7f0e3]"><ArrowLeft className="size-4" /> Overview</Link><p className="mt-9 text-xs font-semibold uppercase tracking-[.16em] text-[#cbb7a4]">Review queues</p><h1 className="ff-display mt-4 text-4xl font-semibold">Keep the studio safe and useful.</h1><p className="mt-4 max-w-2xl leading-7 text-[#cbb7a4]">Operational signals are shown from Convex records. User-generated content review will appear here when a moderation source is enabled.</p></div><div className="grid gap-5 md:grid-cols-2"><div className="rounded-[1.25rem] border border-[#6c5746]/45 bg-[#2a231f] p-7"><div className="flex items-center justify-between"><div className="grid size-11 place-items-center rounded-2xl bg-[#f1c7b7]"><AlertTriangle className="size-5 text-[#211b18]" /></div><span className="rounded-full bg-[#f1c7b7] px-3 py-1.5 text-xs font-semibold text-[#211b18]">{counts.failedJobs} jobs</span></div><h2 className="mt-10 text-2xl font-semibold">Failed generation</h2><p className="mt-3 leading-7 text-[#cbb7a4]">Review interruptions, understand the failure, and help the creator recover without losing their credits.</p></div><div className="rounded-[1.25rem] border border-[#6c5746]/45 bg-[#2a231f] p-7"><div className="grid size-11 place-items-center rounded-2xl bg-[#c8ddd5]"><ShieldCheck className="size-5 text-[#211b18]" /></div><h2 className="mt-10 text-2xl font-semibold">Content reports</h2><p className="mt-3 leading-7 text-[#cbb7a4]">No moderation queue is connected yet. When reports are enabled, this area will show only records requiring review.</p><div className="mt-7 flex items-center gap-2 text-sm font-semibold text-[#c8ddd5]"><CheckCircle2 className="size-4" /> No active reports</div></div></div></div>;
}
