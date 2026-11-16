import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api } from '../../../../../../../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { requireAuth } from '@/lib/guards';
import { decodeProjectRouteId } from '@/lib/project/route-id';
import { ProjectAccessSettings } from '@/components/project/project-access-settings';

export const metadata = { title: 'Project access' };

export default async function ProjectSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const { id } = await params;
  const client = await getAuthenticatedConvexClient();
  const project = await client.query(api.projects.accessSettings, { externalId: decodeProjectRouteId(id) });
  if (!project) notFound();

  return <div className="mx-auto max-w-4xl space-y-7 py-3">
    <Link href="/dashboard/projects" className="ff-link inline-flex min-h-11 items-center text-sm">Project library</Link>
    <header><h1 className="ff-display mt-3 break-words text-3xl font-semibold">Who can use {project.name}?</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Choose which people in your workspace can open this project and what they can do.</p></header>
    <ProjectAccessSettings projectId={project.projectId} />
  </div>;
}
