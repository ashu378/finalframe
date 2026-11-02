import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOnboardingComplete } from '@/lib/guards';
import { decodeProjectRouteId } from '@/lib/project/route-id';
import { getEpisodeNavigation } from '@/lib/production/episode-actions';
import { MovieStudio } from '@/components/movies/movie-studio';

export default async function MoviesPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOnboardingComplete();
  const { id } = await params; const navigation = await getEpisodeNavigation(decodeProjectRouteId(id));
  if (!navigation) notFound();
  return <div className="space-y-7"><Link className="ff-link text-sm" href={`/dashboard/projects/${id}/workspace`}>Back to production workspace</Link><header><p className="ff-eyebrow">Movie assembly</p><h1 className="ff-display mt-2 text-4xl font-semibold">Bring the chapters together.</h1><p className="mt-3 max-w-2xl text-muted-foreground">Keep every episode and source version intact while assembling, reviewing and exporting a longer movie.</p></header><MovieStudio projectId={navigation.projectId} options={navigation.options} /></div>;
}
