import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LayerList } from '@/components/editor/layer-list';
import { EditorSidebar } from '@/components/editor/editor-sidebar';
import { SnapshotSelector } from '@/components/editor/snapshot-selector';
import { ExportButton } from '@/components/editor/export-button';
import { api } from '../../../../../../../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';

type RemixLayerType = 'background' | 'text' | 'motion' | 'actor' | 'audio' | 'overlay';

type EditorLayer = {
    id: string;
    type: RemixLayerType;
    url: string;
    isOriginal: boolean;
};

function getMediaUrl(response: unknown) {
    if (!response || typeof response !== 'object') return null;
    const value = response as Record<string, unknown>;
    const url = value.videoUrl ?? value.assetUrl ?? value.outputUrl ?? value.url;
    return typeof url === 'string' && url.length > 0 ? url : null;
}

export default async function EditorPage({
    params,
    searchParams
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ snapshotId?: string }>;
}) {
    const { id } = await params;
    const { snapshotId } = await searchParams;

    const convex = await getAuthenticatedConvexClient();
    let current;
    try {
        current = await convex.query(api.account.current, {});
    } catch {
        redirect(`/login?next=/dashboard/projects/${encodeURIComponent(id)}/editor`);
    }

    const studioExternalId = current?.studio?.externalId;
    if (!studioExternalId) redirect('/onboarding');

    const projects = await convex.query(api.projects.list, { studioExternalId });
    const project = projects.find((candidate) => candidate.externalId === id);
    if (!project) notFound();

    const workspace = await convex.query(api.productions.getWorkspaceByProject, { projectExternalId: id });
    if (!workspace.production || !workspace.version) redirect(`/dashboard/projects/${id}`);

    const snapshots = [{
        id: workspace.version._id,
        label: `Version ${workspace.version.versionNumber}`,
        created_at: new Date(workspace.version.createdAt).toISOString(),
    }];
    const activeSnapshotId = snapshots.some((snapshot) => snapshot.id === snapshotId && snapshotId)
        ? snapshotId!
        : snapshots[0].id;

    const activeLayers = workspace.jobs.reduce<EditorLayer[]>((layers, job) => {
        if (job.status !== 'COMPLETED') return layers;
            const url = getMediaUrl(job.response);
            if (!url) return layers;
            layers.push({
                id: String(job._id),
                type: 'background',
                url,
                isOriginal: false,
            });
            return layers;
        }, []);

    const latestJob = [...workspace.jobs].sort((a, b) => b.createdAt - a.createdAt)[0];
    const renderJob = {
        id: latestJob?._id ?? workspace.production._id,
        remix_locked: workspace.jobs.some((job) => ['QUEUED', 'PROCESSING', 'SUBMITTED', 'POLLING'].includes(job.status)),
    };

    const chatHistory: { role: 'user' | 'assistant', content: string }[] = [];

    return (
        <div className="studio-surface flex min-h-dvh flex-col animate-in fade-in">
            {/* ... Header ... */}
            <div className="h-16 border-b border-zinc-800 flex items-center px-6 justify-between flex-shrink-0">
                <div className="flex items-center gap-4">
                    <Link href={`/dashboard/projects/${id}`}>
                        <Button variant="ghost" size="sm" className="h-10 w-10 p-0 border border-zinc-800 hover:bg-zinc-900">
                            <ArrowLeft className="w-5 h-5 text-zinc-400" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-sm font-black uppercase tracking-[0.2em] text-zinc-50 italic">{project.name}</h1>
                        <p className="text-sm text-[#cbb7a4] mt-0.5">Finishing studio · {snapshots?.length || 0} versions</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-metadata px-3 py-1.5 rounded-sm bg-primary/10 text-primary border border-primary/20 font-black uppercase tracking-widest">
                            Ready for finishing
                    </span>
                    {snapshots && snapshots.length > 0 ? (
                        <ExportButton
                            projectId={id}
                            snapshotId={activeSnapshotId}
                            snapshotLabel={snapshots.find(s => s.id === activeSnapshotId)?.label}
                            // Block export if remixing
                            disabled={renderJob.remix_locked}
                        />
                    ) : (
                        <Button variant="primary" size="sm" disabled>Export</Button>
                    )}
                </div>
            </div>

            {/* Main Workspace */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left: Preview & Timeline */}
                <div className="flex-1 flex flex-col min-w-0 border-r border-zinc-800">

                    {/* Top: Preview Player */}
                    <div className="flex-1 bg-zinc-900 flex items-center justify-center p-8 relative">
                        <div className="aspect-video bg-black rounded-sm border border-white/5 w-full max-w-4xl flex items-center justify-center overflow-hidden relative shadow-2xl">
                            {renderJob.remix_locked ? (
                                <div className="flex flex-col items-center gap-4 z-10">
                                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse shadow-[0_0_15px_rgba(255,255,0,0.5)]" />
                                        <span className="text-sm font-semibold text-primary">Preparing your preview…</span>
                                </div>
                            ) : (
                                activeLayers.find(l => l.type === 'background')?.url ? (
                                    <video
                                        src={activeLayers.find(l => l.type === 'background')?.url}
                                        controls
                                        className="w-full h-full object-contain"
                                        key={activeLayers.find(l => l.type === 'background')?.url} // Force reload on URL change
                                    />
                                ) : (
                                    <div className="flex flex-col items-center gap-2 text-zinc-600">
                                        <span>No preview yet</span>
                                        <span className="text-xs">Your first version may still be processing.</span>
                                    </div>
                                )
                            )}
                        </div>
                    </div>

                    {/* Bottom: Layer List (Timeline) */}
                    <div className="flex-1 flex flex-col min-h-0 border-t border-zinc-800 bg-zinc-950">
                        <div className="flex-1 overflow-y-auto p-4">
                            <LayerList layers={activeLayers} />
                        </div>
                        {snapshots && <SnapshotSelector snapshots={snapshots} currentSnapshotId={snapshotId} />}
                    </div>
                </div>

                {/* Right: Sidebar (Chat + Assets) */}
                <EditorSidebar
                    projectId={id}
                    studioId={workspace.production.studioExternalId}
                    renderJobId={renderJob.id}
                    isRemixing={renderJob.remix_locked}
                    initialMessages={chatHistory}
                />
            </div>
        </div>
    );
}
