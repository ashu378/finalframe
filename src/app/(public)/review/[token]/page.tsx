import { notFound } from 'next/navigation';
import { getPublicReviewData } from '@/lib/review/actions';
import { ScopedReview } from '@/components/review/scoped-review';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Private video review · FinalFrame', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    const data = await getPublicReviewData(token);
    if (!data) notFound();
    return <div className="review-theme min-h-dvh bg-background px-5 py-10 text-foreground md:px-12">
        <div className="mx-auto max-w-7xl space-y-8"><header className="space-y-2"><p className="text-sm text-muted-foreground">FinalFrame · Private client review</p><h1 className="text-3xl font-semibold">{data.projectName}</h1><p>{data.label}</p></header><ScopedReview token={token} data={data} /><p className="text-xs text-muted-foreground">This link expires {new Date(data.expiresAt).toLocaleDateString()}. Anyone with this link can watch this version and leave feedback.</p></div>
    </div>;
}
