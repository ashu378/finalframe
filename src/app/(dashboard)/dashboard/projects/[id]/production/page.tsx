import Link from 'next/link';
import { ArrowLeft, Film } from 'lucide-react';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/guards';
import { getProductionWorkspace } from '@/lib/production/actions';
import { isFeatureEnabled } from '@/lib/config/feature-flags';
import { AssembleButton } from '@/components/production/assemble-button';
import { GenerationPanel } from '@/components/production/generation';

interface ProductionPageProps { params: Promise<{ id: string }> }

export default async function ProductionPage({ params }: ProductionPageProps) {
    await requireAuth();
    const { id } = await params;
    const result = await getProductionWorkspace(id);
    if (!result.success) notFound();
    const generationEnabled = isFeatureEnabled('openRouterMedia');

    return <div className="mx-auto max-w-6xl space-y-9 py-5 sm:py-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
                <Link href={`/dashboard/projects/${id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" /> Back to project</Link>
                <p className="ff-eyebrow mt-9">{generationEnabled ? 'Make your video' : 'Production readiness'}</p>
                <h1 className="public-heading-section mt-4">{generationEnabled ? 'Make each part, then put it together.' : 'Your plan is ready for its making check.'}</h1>
                <p className="public-body-text mt-5 max-w-2xl">{generationEnabled ? 'Make one take at a time, see what is ready, and try individual parts again without losing the rest.' : 'Your plan is saved. The making workflow is still being tested and is not available for this project yet.'}</p>
            </div>
            {generationEnabled && result.production && <AssembleButton productionId={result.production._id} />}
        </div>
        {!result.production ? <div className="ff-card flex flex-col items-center p-10 text-center"><span className="grid size-12 place-items-center rounded-2xl bg-[#f6dfb1]"><Film className="size-5" aria-hidden="true" /></span><h2 className="ff-display mt-6 text-2xl font-semibold">Your plan is not approved yet.</h2><p className="mt-3 max-w-md leading-7 text-muted-foreground">Review the plan and approve it before the making stage becomes available.</p><Link href={`/dashboard/projects/${id}/blueprint`} className="ff-button-primary mt-7">Open my plan</Link></div> : <GenerationPanel productionId={result.production._id} sequences={result.sequences || []} jobs={result.jobs || []} enabled={generationEnabled} />}
    </div>;
}
