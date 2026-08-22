import Link from 'next/link';
import { Activity, ArrowRight, CheckCircle2, CircleAlert, Film, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { requireAdmin } from '@/lib/guards';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Admin overview', description: 'FinalFrame operational overview.' };

export default async function AdminDashboardPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [profiles, studios, projects, jobs, failedJobs] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('studios').select('*', { count: 'exact', head: true }),
    supabase.from('projects').select('*', { count: 'exact', head: true }),
    supabase.from('render_jobs').select('*', { count: 'exact', head: true }),
    supabase.from('render_jobs').select('*', { count: 'exact', head: true }).eq('status', 'failed'),
  ]);
  const metrics: Array<{ icon: LucideIcon; value: number; label: string }> = [
    { icon: Users, value: profiles.count ?? 0, label: 'People' },
    { icon: Film, value: studios.count ?? 0, label: 'Studios' },
    { icon: CheckCircle2, value: projects.count ?? 0, label: 'Projects' },
    { icon: Activity, value: jobs.count ?? 0, label: 'Jobs' },
  ];
  return <div className="space-y-10"><header><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#cbb7a4]">Operations</p><h1 className="ff-display mt-4 text-4xl font-semibold sm:text-5xl">A clear view of the studio.</h1><p className="mt-4 max-w-2xl leading-7 text-[#cbb7a4]">Live counts from the connected application. No sample activity is shown here.</p></header><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ icon: Icon, value, label }) => <div key={label} className="rounded-[1.2rem] border border-[#6c5746]/45 bg-[#2a231f] p-6"><Icon className="size-5 text-[#f6dfb1]" /><p className="mt-8 text-3xl font-semibold">{value}</p><p className="mt-1 text-sm text-[#cbb7a4]">{label}</p></div>)}</div><section className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]"><div className="rounded-[1.25rem] border border-[#6c5746]/45 bg-[#2a231f] p-7"><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#cbb7a4]">Job health</p><h2 className="mt-3 text-2xl font-semibold">Keep an eye on interruptions.</h2></div><span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${failedJobs.count ? 'bg-[#f1c7b7] text-[#211b18]' : 'bg-[#c8ddd5] text-[#211b18]'}`}>{failedJobs.count ?? 0} failed</span></div><p className="mt-5 max-w-xl leading-7 text-[#cbb7a4]">Generation failures should be explainable, recoverable, and visible to the team that can help.</p><Link href="/admin/moderation" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[#f6dfb1]">Open operational queues <ArrowRight className="size-4" /></Link></div><div className="rounded-[1.25rem] border border-[#6c5746]/45 bg-[#342b25] p-7"><CircleAlert className="size-5 text-[#f1c7b7]" /><h2 className="mt-8 text-xl font-semibold">Read-only by default</h2><p className="mt-3 text-sm leading-6 text-[#cbb7a4]">This view shows live records without exposing payment secrets or allowing unsafe bulk actions.</p></div></section></div>;
}
