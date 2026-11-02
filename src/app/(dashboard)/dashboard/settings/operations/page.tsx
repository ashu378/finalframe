import Link from 'next/link';
import { requireStudioAdmin } from '@/lib/guards/platform';
import { getAdminOperations } from '@/lib/admin/actions';
import { OperationsTable } from '@/components/admin/operations-table';
import { TestCreditGrantForm } from '@/components/admin/test-credit-grant-form';
import { api } from '@/../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';

export const metadata = { title: 'Studio operations | FinalFrame' };
export default async function StudioOperationsPage() {
  const access = await requireStudioAdmin();
  const client = await getAuthenticatedConvexClient();
  const [overview, people, operations] = await Promise.all([client.query(api.app.adminOverview, {}), client.query(api.app.adminUsers, {}), getAdminOperations()]);
  return <div className="mx-auto max-w-6xl space-y-8 py-5"><header><Link href="/dashboard/settings" className="ff-link text-sm">Settings</Link><p className="ff-eyebrow mt-7">Studio administration</p><h1 className="ff-display mt-3 text-4xl font-semibold">{access.studio.name} operations</h1><p className="mt-4 text-sm leading-6 text-muted-foreground">These records belong to your current studio. This membership does not grant platform access.</p><div className="mt-5 flex flex-wrap gap-3"><Link href="/dashboard/settings/operations/video-routing" className="ff-button-primary min-h-11">Studio video routing</Link><Link href="/dashboard/settings/team" className="ff-button-quiet min-h-11 border border-border">Team access</Link><Link href="/dashboard/settings/reports" className="ff-button-quiet min-h-11 border border-border">Your content reports</Link></div></header><section className="ff-card p-6"><h2 className="text-xl font-semibold">Studio overview</h2><dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">{[[overview.counts.users, 'Active members'], [overview.counts.projects, 'Projects'], [overview.counts.jobs, 'Generation jobs'], [overview.counts.failedJobs, 'Failed jobs']].map(([value, label]) => <div key={String(label)}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-2 text-2xl font-semibold">{value}</dd></div>)}</dl></section><section className="ff-card p-6"><h2 className="text-xl font-semibold">Studio accounts</h2><p className="mt-2 text-sm text-muted-foreground">Up to 100 recent member records.</p><ul className="mt-4 space-y-3">{people.map((person) => <li key={person._id} className="break-words text-sm">{person.name || person.email || person._id}</li>)}</ul></section><OperationsTable data={operations} kind="jobs" /><OperationsTable data={operations} kind="credits" /><TestCreditGrantForm /><OperationsTable data={operations} kind="audit" /></div>;
}
