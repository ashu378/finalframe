import { decodeProjectRouteId } from '@/lib/project/route-id';
/**
 * FinalFrame — Blueprint Editor Page
 * Reference: MASTER_PRD.md § 5.II — AI Director Blueprint
 * Reference: BUILD_PHASES.md — Phase 2 Blueprint editing, Scene reordering
 */

import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/guards';
import { getProjectById } from '@/lib/project/actions';
import { getScenesForProject } from '@/lib/scene/actions';
import { BlueprintEditor } from '@/components/project';
import { getProjectAssets } from '@/lib/assets/actions';
import { getEpisodeNavigation } from '@/lib/production/episode-actions';
import { getProductionWorkspace } from '@/lib/production/actions';
import { EpisodePicker } from '@/components/production-workspace/episode-picker';
import { EpisodeBlueprint } from '@/components/production-workspace/episode-blueprint';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { makeFunctionReference } from 'convex/server';

export const metadata = {
    title: 'Blueprint Editor',
    description: 'Edit your project blueprint',
};

interface BlueprintPageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ production?: string }>;
}

export default async function BlueprintPage({ params, searchParams }: BlueprintPageProps) {
    await requireAuth();
    const { id: routeId } = await params;
    const id = decodeProjectRouteId(routeId);
    const query = await searchParams;
    const navigation = await getEpisodeNavigation(id);
    if (!navigation) notFound();
    const selectedProductionId = query.production || (navigation.options.length === 1 ? navigation.options[0].productionId : undefined);
    if (selectedProductionId && !navigation.options.some((option) => option.productionId === selectedProductionId)) notFound();
    const picker = <EpisodePicker projectExternalId={id} options={navigation.options} selectedProductionId={selectedProductionId} nextEpisodeNumber={navigation.nextEpisodeNumber} />;
    if (!selectedProductionId && navigation.options.length > 1) return <div className="space-y-6">{picker}<p className="text-sm text-muted-foreground">Select an episode to review its plan.</p></div>;
    if (selectedProductionId) {
        const workspace = await getProductionWorkspace(id, selectedProductionId);
        if (!workspace.success || !workspace.production) notFound();
        const plan = workspace.plan;
        const version = workspace.version;
        const exactPlan = Boolean(plan && version?.sourcePlanId === plan._id);
        const client = await getAuthenticatedConvexClient();
        const access = await client.query(makeFunctionReference<'query'>('continuity:resourceVersionPage'), { projectId: workspace.production.projectId, paginationOpts: { numItems: 1, cursor: null } });
        const canEdit = ['OWNER', 'EDITOR'].includes(access.projectRole);
        const rows = version?.status === 'APPROVED' ? version.snapshot?.sequences : workspace.sequences;
        const active = (row: {status?:string}) => !['ARCHIVED','DELETED'].includes(row.status ?? '');
        const sequences = (Array.isArray(rows) ? rows : []).filter(active).map((sequence:any) => ({
            title: sequence.title,
            scenes: (Array.isArray(sequence.scenes) ? sequence.scenes : []).filter(active).map((scene:any) => ({
                title: scene.title, purpose: scene.purpose ?? '',
                shots: (Array.isArray(scene.shots) ? scene.shots : []).filter(active).map((shot:any) => ({ title:shot.title,prompt:shot.prompt,durationSeconds:shot.durationSeconds })),
            })),
        }));
        return <div className="mx-auto max-w-6xl space-y-6 py-5 sm:py-8">{picker}<EpisodeBlueprint
            projectId={id} productionId={selectedProductionId} planId={exactPlan && version?.status === 'DRAFT' ? plan?._id : undefined} versionId={version?._id} canEdit={canEdit}
            summary={(version?.status === 'APPROVED' ? version.snapshot?.summary : plan?.plan?.summary) || ''}
            approved={version?.status === 'APPROVED' && exactPlan}
            sequences={sequences}
        /></div>;
    }

    const [result, scenesResult] = await Promise.all([
        getProjectById(id),
        getScenesForProject(id, selectedProductionId)
    ]);

    if (!result.success || !result.project) {
        notFound();
        return null;
    }

    const project = result.project;
    const scenes = scenesResult.success ? (scenesResult.scenes || []) : [];

    // Fetch assets for the studio
    const assets = await getProjectAssets(project.id);

    return (
        <div className="mx-auto max-w-6xl py-5 sm:py-8">
            {picker}
            <header className="mb-10 space-y-4">
                <Link href={`/dashboard/projects/${id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground">
                    <ArrowLeft className="size-4" /> Back to project
                </Link>
                <div className="rounded-[1.5rem] bg-[#0f141c] p-7 sm:p-10"><p className="ff-eyebrow flex items-center gap-2"><Sparkles className="size-4 text-accent" /> Your video plan</p><h1 className="public-heading-section mt-4">{project.name}</h1><p className="public-body-text mt-4 max-w-2xl">Read the story, adjust the parts that matter, and approve the plan when it feels right.</p></div>
            </header>

            <BlueprintEditor project={project} scenes={scenes} studioAssets={assets} />
        </div>
    );
}
