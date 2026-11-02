import { decodeProjectRouteId } from '@/lib/project/route-id';
import { redirect } from 'next/navigation';

export default async function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: routeId } = await params;
  const id = decodeProjectRouteId(routeId);
  redirect(`/dashboard/projects/${id}/workspace/overview`);
}
