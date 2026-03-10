import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LayerList } from '@/components/editor/layer-list';
import { EditorSidebar } from '@/components/editor/editor-sidebar';
import { SnapshotSelector } from '@/components/editor/snapshot-selector';
import { ExportButton } from '@/components/editor/export-button';
import type { RemixLayerType } from '@/lib/types/database';

export default async function EditorPage({
    params,
    searchParams
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ snapshotId?: string }>;
}) {
    const supabase = await createClient();
    const { id } = await params;
    const { snapshotId } = await searchParams;

    // 1. Fetch Project
    const { data: project } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .single();

    if (!project) notFound();

    // 2. Fetch Active Render Job
    // We assume the latest render job is the active one
    const { data: renderJob } = await supabase
        .from('render_jobs')
        .select('*')
        .eq('project_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (!renderJob) {
        // No render job found? Redirect back or show error
        redirect(`/dashboard/projects/${id}`);
    }

    // 3. Fetch Snapshots
    const { data: snapshots } = await supabase
        .from('render_snapshots')
        .select('id, label, created_at, layer_manifest')
        .eq('render_job_id', renderJob.id)
        .order('created_at', { ascending: false });

    // 4. Determine Active Layers
    let activeLayersPlain: any[] = [];

    if (snapshotId && snapshots) {
        // Load from Snapshot Manifest
        const snapshot = snapshots.find(s => s.id === snapshotId);
        if (snapshot && snapshot.layer_manifest) {
            // Manifest is { type: id }
            const layerIds = Object.values(snapshot.layer_manifest);
            if (layerIds.length > 0) {
                const { data: layers } = await supabase
                    .from('render_layers')
                    .select('*')
                    .in('id', layerIds); // TS cast needed if layerIds is any[]
                activeLayersPlain = layers || [];
            }
        }
    } else {
        // Load Latest
        const { data: allLayers } = await supabase
            .from('render_layers')
            .select('*')
            .eq('render_job_id', renderJob.id)
            .order('created_at', { ascending: false });
        activeLayersPlain = allLayers || [];
    }

    // Deduplicate/Format Layers
    const layerMap = new Map<string, any>();
    activeLayersPlain.forEach((layer) => {
        if (!layerMap.has(layer.layer_type)) {
            layerMap.set(layer.layer_type, {
                id: layer.id,
                type: layer.layer_type as RemixLayerType,
                url: layer.asset_url,
                isOriginal: layer.is_original
            });
        }
    });

    const activeLayers = Array.from(layerMap.values());

    // 5. Fetch Remix History (for Chat)
    const { data: remixJobs } = await supabase
        .from('remix_jobs')
        .select('intent, status, target_layer, error_message, created_at')
        .eq('render_job_id', renderJob.id)
        .order('created_at', { ascending: true }); // Oldest first

    const chatHistory: { role: 'user' | 'assistant', content: string }[] = [];
    if (remixJobs) {
        remixJobs.forEach(job => {
            // User Request
            chatHistory.push({ role: 'user', content: job.intent });

            // System Response
            if (job.status === 'completed') {
                chatHistory.push({ role: 'assistant', content: `Remix complete! I've updated the ${job.target_layer} layer.` });
            } else if (job.status === 'failed') {
                chatHistory.push({ role: 'assistant', content: `Remix failed: ${job.error_message || 'Unknown error'}` });
            } else {
                chatHistory.push({ role: 'assistant', content: `Remix started! I'm updating the ${job.target_layer} layer...` });
            }
        });
    }

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] bg-zinc-950 text-white animate-in fade-in">
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
                        <p className="text-metadata text-zinc-500 font-bold uppercase tracking-widest mt-0.5">Mastering Registry</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-metadata px-3 py-1.5 rounded-sm bg-primary/10 text-primary border border-primary/20 font-black uppercase tracking-widest">
                        Status: Finalizing
                    </span>
                    {snapshots && snapshots.length > 0 ? (
                        <ExportButton
                            projectId={id}
                            snapshotId={snapshotId || snapshots[0].id} // Default to latest if no ID param
                            snapshotLabel={
                                snapshotId
                                    ? snapshots.find(s => s.id === snapshotId)?.label
                                    : snapshots[0].label
                            }
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
                                    <span className="text-metadata font-black uppercase tracking-[0.2em] text-primary italic">Processing Signal...</span>
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
                                        <span>No Video Source</span>
                                        <span className="text-xs">Initial render may be incomplete</span>
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
                    studioId={project.studio_id}
                    renderJobId={renderJob.id}
                    isRemixing={renderJob.remix_locked}
                    initialMessages={chatHistory}
                />
            </div>
        </div>
    );
}
