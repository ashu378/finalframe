import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireAuth } from '@/lib/guards';
import { CreateProductionForm } from '@/components/production/create-production-form';
import { getStudioContext } from '@/lib/project/actions';
import { getPlanningContinuityOptions, getSelectedProductionDefaults, getProjectCreatorPreference } from '@/lib/production/episode-actions';
import { getTemplateDefaultsForProject } from '@/lib/templates/actions';
import { parseStartingMode } from '@/lib/templates/catalog';
import { CREATOR_PATHS, CREATOR_INVOLVEMENT, parseCreatorIntent } from '@/lib/production/creator-intent';

export const metadata = { title: 'Create | FinalFrame', description: 'Create a video from an idea, script, voice, images, or footage.' };

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ project?: string; production?: string; mode?: string; intent?: string; involvement?: string }> }) {
    await requireAuth();
    const selection = await searchParams;
    if (selection.production && !selection.project) notFound();
    if(selection.intent&&!CREATOR_PATHS.some(path=>path.id===selection.intent)||selection.involvement&&!CREATOR_INVOLVEMENT.some(level=>level.id===selection.involvement))notFound();
    const [studio, continuityOptions, templateDefaults, projectPreference] = await Promise.all([getStudioContext(), selection.project ? getPlanningContinuityOptions(selection.project, selection.production) : Promise.resolve(undefined), selection.project ? getTemplateDefaultsForProject(selection.project) : Promise.resolve(undefined), selection.project?getProjectCreatorPreference(selection.project):Promise.resolve(undefined)]);
    const selectedProductionId = selection.production ?? continuityOptions?.productionId;
    let productionDefaults;
    if (selection.project && selectedProductionId) {
        productionDefaults = await getSelectedProductionDefaults(selection.project, selectedProductionId);
        if (!productionDefaults) notFound();
    }
    const selectedIntent=productionDefaults?.creatorIntent??projectPreference;
    const baseIntent=selectedIntent?{...selectedIntent,involvement:projectPreference?.involvement??selectedIntent.involvement}:undefined;
    const initialCreatorIntent=baseIntent||selection.intent||selection.involvement?parseCreatorIntent({...baseIntent,version:1,path:selection.intent??baseIntent?.path??'CREATE_VIDEO',involvement:selection.involvement??baseIntent?.involvement??'KEY_STAGE_REVIEW',videoKind:baseIntent?.videoKind??'CINEMATIC',visualStyle:baseIntent?.visualStyle??{id:'REALISTIC'},...(selection.intent&&selection.intent!==baseIntent?.path?{tool:undefined}:{})}):undefined;
    return <div className="mx-auto max-w-5xl space-y-10 py-5 sm:py-8"><div><Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground"><ArrowLeft className="size-4" /> Back to projects</Link><p className="ff-eyebrow mt-10">Create a video</p><h1 className="public-heading-section mt-4">What do you want to make?</h1><p className="public-body-text mt-5 max-w-2xl">Describe it, paste it, upload it, or bring your own media. We will prepare the plan and show the credit cost before anything expensive starts.</p></div><CreateProductionForm key={`${selection.project ?? 'new'}:${selectedProductionId ?? 'new'}:${selection.mode ?? ''}:${selection.intent??''}:${selection.involvement??''}`} initialCreatorIntent={initialCreatorIntent} initialMode={parseStartingMode(selection.mode)} templateDefaults={templateDefaults} productionDefaults={productionDefaults} studioId={productionDefaults?.studioExternalId ?? studio.studioId} existingProjectId={selection.project} productionId={selectedProductionId} continuityOptions={continuityOptions} /></div>;
}
