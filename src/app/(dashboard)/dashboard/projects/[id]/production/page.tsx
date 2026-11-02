import Link from 'next/link';
import { ArrowLeft, Film } from 'lucide-react';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/guards';
import { getProductionWorkspace } from '@/lib/production/actions';
import { isFeatureEnabled } from '@/lib/config/feature-flags';
import { AssembleButton } from '@/components/production/assemble-button';
import { GenerationPanel } from '@/components/production/generation';
import { AssemblyPanel } from '@/components/production/assembly';
import { ThreeUIAmbient } from '@/components/threeui/ambient';
import { getEpisodeNavigation } from '@/lib/production/episode-actions';
import { EpisodePicker } from '@/components/production-workspace/episode-picker';

interface ProductionPageProps { params: Promise<{ id: string }>; searchParams: Promise<{ production?: string }> }

export default async function ProductionPage({ params, searchParams }: ProductionPageProps) {
    await requireAuth();
    const { id } = await params;
    const query = await searchParams;
    const navigation = await getEpisodeNavigation(id);
    if (!navigation) notFound();
    const selectedProductionId = query.production || (navigation.options.length === 1 ? navigation.options[0].productionId : undefined);
    if (selectedProductionId && !navigation.options.some((option) => option.productionId === selectedProductionId)) notFound();
    const picker = <EpisodePicker projectExternalId={id} options={navigation.options} selectedProductionId={selectedProductionId} nextEpisodeNumber={navigation.nextEpisodeNumber} />;
    if (!selectedProductionId && navigation.options.length > 1) return <div className="space-y-6">{picker}<p className="text-sm text-muted-foreground">Select an episode to make its shots.</p></div>;
    const result = await getProductionWorkspace(id, selectedProductionId);
    if (!result.success) notFound();
    const generationEnabled = isFeatureEnabled('openRouterMedia');
    const allShots = (result.sequences || []).flatMap((sequence: any) => sequence.scenes.flatMap((scene: any) => scene.shots));
    const completedShotIds = new Set((result.jobs || []).filter((job: any) => String(job.status || '').toUpperCase() === 'COMPLETED').map((job: any) => String(job.shotId)));
    const readyTakes = allShots.filter((shot: any) => String(shot.status || '').toUpperCase() === 'COMPLETED' || completedShotIds.has(String(shot._id))).length;

    return <div className="relative mx-auto max-w-6xl space-y-9 py-5 sm:py-8">
        {picker}
        <ThreeUIAmbient variant="flow" className="-z-10 opacity-20" label="Production flow background" />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
                <Link href={`/dashboard/projects/${id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" /> Back to project</Link>
                <p className="ff-eyebrow mt-9">{generationEnabled ? 'Make your video' : 'Production readiness'}</p>
                <h1 className="public-heading-section mt-4">{generationEnabled ? 'Make each part, then put it together.' : 'Your plan is ready for its making check.'}</h1>
                <p className="public-body-text mt-5 max-w-2xl">{generationEnabled ? 'Make one take at a time, see what is ready, and try individual parts again without losing the rest.' : 'Your plan is saved. The making workflow is still being tested and is not available for this project yet.'}</p>
            </div>
            {generationEnabled && result.production && <AssembleButton productionId={result.production._id} />}
        </div>
        {!result.production ? <div className="ff-card flex flex-col items-center p-10 text-center"><span className="grid size-12 place-items-center rounded-2xl bg-[#86a7ff]"><Film className="size-5" aria-hidden="true" /></span><h2 className="ff-display mt-6 text-2xl font-semibold">Your plan is not approved yet.</h2><p className="mt-3 max-w-md leading-7 text-muted-foreground">Review the plan and approve it before the making stage becomes available.</p><Link href={`/dashboard/projects/${id}/blueprint`} className="ff-button-primary mt-7">Open my plan</Link></div> : <div className="space-y-6"><GenerationPanel productionId={result.production._id} sequences={result.sequences || []} jobs={result.jobs || []} enabled={generationEnabled} /><AssemblyPanel productionId={result.production._id} totalTakes={allShots.length} readyTakes={readyTakes} enabled={generationEnabled} /></div>}
    </div>;
}
