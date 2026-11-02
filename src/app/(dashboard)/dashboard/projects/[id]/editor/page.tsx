import { redirect } from 'next/navigation';
import { decodeProjectRouteId } from '@/lib/project/route-id';
import { requireAuth } from '@/lib/guards';

/** The canonical workspace owns editing, version selection, and exports. */
export default async function EditorPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ production?: string }>;
}) {
  await requireAuth();
  const { id } = await params;
  const selection = await searchParams;
  const query = selection.production ? `?${new URLSearchParams({ production: selection.production })}` : '';
  redirect(`/dashboard/projects/${encodeURIComponent(decodeProjectRouteId(id))}/workspace/edit${query}`);
}
