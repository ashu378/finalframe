import Link from 'next/link';
import { Activity, ArrowRight, CheckCircle2, CircleAlert, Film, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { requireAdmin } from '@/lib/guards';
import { api } from '@/../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { ThreeUIAmbient } from '@/components/threeui/ambient';

export const metadata = { title: 'Admin overview', description: 'FinalFrame operational overview.' };

export default async function AdminDashboardPage() {
  await requireAdmin();
  const overview = await (await getAuthenticatedConvexClient()).query(api.app.adminOverview, {});
  const metrics: Array<{ icon: LucideIcon; value: number; label: string }> = [
    { icon: Users, value: overview.counts.users, label: 'People' },
    { icon: Film, value: overview.counts.studios, label: 'Studios' },
    { icon: CheckCircle2, value: overview.counts.projects, label: 'Projects' },
    { icon: Activity, value: overview.counts.jobs, label: 'Jobs' },
  ];
  return <div className="space-y-10"><header className="relative overflow-hidden rounded-2xl border border-[#263143] bg-[#101722] p-7 sm:p-10"><ThreeUIAmbient variant="diagnostics" className="opacity-30" label="Operational diagnostics background" /><div className="relative z-10"><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#91a0b8]">Operations</p><h1 className="ff-display mt-4 text-4xl font-semibold sm:text-5xl">A clear view of the studio.</h1><p className="mt-4 max-w-2xl leading-7 text-[#91a0b8]">Live counts from Convex. No sample activity is shown here.</p></div></header><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ icon: Icon, value, label }) => <div key={label} className="rounded-[1.2rem] border border-[#263143]/45 bg-[#151b25] p-6"><Icon className="size-5 text-[#86a7ff]" /><p className="mt-8 text-3xl font-semibold">{value}</p><p className="mt-1 text-sm text-[#91a0b8]">{label}</p></div>)}</div><section className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]"><div className="rounded-[1.25rem] border border-[#263143]/45 bg-[#151b25] p-7"><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#91a0b8]">Job health</p><h2 className="mt-3 text-2xl font-semibold">Keep an eye on interruptions.</h2></div><span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${overview.counts.failedJobs ? 'bg-[#ff9e9e] text-[#0b0d12]' : 'bg-[#9be3c3] text-[#0b0d12]'}`}>{overview.counts.failedJobs} failed</span></div><p className="mt-5 max-w-xl leading-7 text-[#91a0b8]">Generation failures should be explainable, recoverable, and visible to the team that can help.</p><Link href="/admin/moderation" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[#86a7ff]">Open operational queues <ArrowRight className="size-4" /></Link></div><div className="rounded-[1.25rem] border border-[#263143]/45 bg-[#1c2533] p-7"><CircleAlert className="size-5 text-[#ff9e9e]" /><h2 className="mt-8 text-xl font-semibold">Read-only by default</h2><p className="mt-3 text-sm leading-6 text-[#91a0b8]">This view shows live records without exposing payment secrets or allowing unsafe bulk actions.</p></div></section></div>;
}
