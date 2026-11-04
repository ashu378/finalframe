import { notFound } from 'next/navigation';
import { SharedMovieReview } from '@/components/movies/shared-movie-review';
import { assertReviewToken } from '../../../../../convex/reviewLinkContracts';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Private movie review · FinalFrame', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default async function MovieReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; try { assertReviewToken(token); } catch { notFound(); }
  return <div className="review-theme min-h-dvh bg-background px-5 py-10 text-foreground md:px-12"><div className="mx-auto max-w-5xl"><SharedMovieReview token={token} /></div></div>;
}
