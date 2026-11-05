import { redirect } from 'next/navigation';
import { decodeProjectRouteId } from '@/lib/project/route-id';
import { requireAuth } from '@/lib/guards';

/** The canonical workspace owns editing, version selection, and exports. */
export default async function EditorPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ production?: string; timeline?: string | string[] }>;
}) {
  await requireAuth();
  const { id } = await params;
  const selection = await searchParams;
  const selected = new URLSearchParams();
  if (selection.production) selected.set('production', selection.production);
  if (selection.timeline !== undefined) {
    // Preserve invalid/multiple selections too so the canonical route rejects
    // them explicitly instead of silently opening a different timeline.
    for (const timeline of Array.isArray(selection.timeline) ? selection.timeline : [selection.timeline]) selected.append('timeline', timeline);
  }
  const query = selected.size ? `?${selected}` : '';
  redirect(`/dashboard/projects/${encodeURIComponent(decodeProjectRouteId(id))}/workspace/edit${query}`);
}
