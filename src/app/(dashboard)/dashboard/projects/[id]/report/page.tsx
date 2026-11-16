import Link from 'next/link';
import { requireAuth } from '@/lib/guards';
import { decodeProjectRouteId } from '@/lib/project/route-id';
import { getReportContext } from '@/lib/platform-admin/actions';
import { ModerationReportForm } from '@/components/project/moderation-report-form';

export const metadata = { title: 'Report a content concern' };
export default async function ProjectReportPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const { id } = await params;
  const project = await getReportContext(decodeProjectRouteId(id));
  return <div className="mx-auto max-w-3xl space-y-7 py-5"><Link href="/dashboard/projects" className="ff-link inline-flex min-h-11 items-center text-sm">Project library</Link><header><h1 className="ff-display ff-display mt-3 text-3xl font-semibold sm:text-4xl">Report a concern about {project.name}</h1><p className="mt-4 text-sm leading-6 text-muted-foreground">Our review team will check your report. They can close it or restrict the project if needed. Its history stays saved.</p></header>{project.moderationStatus === 'RESTRICTED' ? <p role="status" className="ff-soft-card p-4 text-sm leading-6">This project is restricted. Production and media access remain blocked while the restriction is in effect. You can still report a concern and follow your own reports.</p> : null}<ModerationReportForm projectId={project.projectId} /><Link href="/dashboard/settings/reports" className="ff-link inline-flex min-h-11 items-center text-sm">Your content reports</Link></div>;
}
