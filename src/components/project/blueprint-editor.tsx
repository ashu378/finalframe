'use client';

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

import { useState, useTransition, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SceneCard } from './scene-card';
import { Button } from '@/components/ui/button';
import { generateBlueprint } from '@/lib/ai/blueprint-director';
import { reorderScenes } from '@/lib/scene/actions';
import { approveBlueprint, unlockBlueprint } from '@/lib/project/actions';
import type { Scene, FullProject, StudioAsset } from '@/lib/types/database';
import { PencilLine, CheckCircle2, Film, Loader2, Workflow, Plus, LayoutGrid, Maximize2, ChevronLeft, ChevronRight, Sparkles, Lock, Unlock } from 'lucide-react';
import { ValidationMonitor } from './validation-monitor';
import { validateProjectSignals } from '@/lib/project/signal-validator';

interface BlueprintEditorProps {
    project: FullProject;
    scenes: Scene[];
    studioAssets: StudioAsset[];
}

export function BlueprintEditor({ project, scenes: initialScenes, studioAssets }: BlueprintEditorProps) {
    const router = useRouter();
    const [scenes, setScenes] = useState(initialScenes);
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isGenerating, startGenerating] = useTransition();
    const [isApproving, startApproving] = useTransition();
    const [isUnlocking, startUnlocking] = useTransition();
    const [isReordering, startReordering] = useTransition();
    const [viewMode, setViewMode] = useState<'focused' | 'sequence'>('focused');
    const [activeSceneIndex, setActiveSceneIndex] = useState(0);

    // Custom Dialog State
    const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);

    // Sync local state when props change & clamp index
    useEffect(() => {
        setScenes(initialScenes);
        if (activeSceneIndex >= initialScenes.length && initialScenes.length > 0) {
            setActiveSceneIndex(initialScenes.length - 1);
        } else if (initialScenes.length === 0) {
            setActiveSceneIndex(0);
        }
    }, [initialScenes, activeSceneIndex]);

    const canEdit = project.state === 'draft' || project.state === 'blueprint_ready';
    const canApprove = scenes.length > 0 && canEdit;

    // Reference: BUILD_PLACEHOLDERS.md — Rendering must remain blocked until approval is complete
    const isApproved = project.state === 'approved' ||
        project.state === 'rendering' ||
        project.state === 'rendered' ||
        project.state === 'exported';

    // Validation checks for the Authorize button
    const hasEnoughScenes = scenes.length >= 1;
    const hasIdentity = !!project.identity_presence;
    const isValidationPassed = hasEnoughScenes && hasIdentity;

    const handleGenerate = () => {
        startGenerating(async () => {
            setError(null);
            const result = await generateBlueprint(project.id);
            if (result.success) {
                router.refresh();
            } else {
                setError(result.error || 'Failed to generate blueprint');
            }
        });
    };

    // ... (same const definitions)

    const handleConfirmApprove = () => {
        startApproving(async () => {
            setError(null);
            try {
                const result = await approveBlueprint(project.id);
                if (result.success) {
                    setIsApproveDialogOpen(false);
                    router.refresh();
                } else {
                    setError(result.error || 'Failed to approve blueprint');
                }
            } catch (err) {
                console.error(err);
                setError('An unexpected error occurred during approval');
            }
        });
    };

    const handleUnlock = () => {
        startUnlocking(async () => {
            setError(null);
            try {
                const result = await unlockBlueprint(project.id);
                if (result.success) {
                    toast.success('Blueprint unlocked for editing');
                    router.refresh();
                } else {
                    setError(result.error || 'Failed to unlock blueprint');
                }
            } catch (err) {
                console.error(err);
                setError('An unexpected error occurred while unlocking');
            }
        });
    };

    // Drag and drop handlers
    const handleDragStart = useCallback((e: React.DragEvent, sceneId: string) => {
        setDraggedId(sceneId);
        e.dataTransfer.effectAllowed = 'move';
    }, []);

    const handleDragEnd = useCallback(() => {
        setDraggedId(null);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }, []);

    const handleDrop = useCallback((e: React.DragEvent, targetIndex: number) => {
        e.preventDefault();

        if (!draggedId || !canEdit) return;

        const draggedIndex = scenes.findIndex(s => s.id === draggedId);
        if (draggedIndex === -1 || draggedIndex === targetIndex) return;

        // Reorder locally first for immediate feedback
        const newScenes = [...scenes];
        const [removed] = newScenes.splice(draggedIndex, 1);
        newScenes.splice(targetIndex, 0, removed);
        setScenes(newScenes);

        // Persist to database
        startReordering(async () => {
            const orderedIds = newScenes.map(s => s.id);
            const result = await reorderScenes(project.id, orderedIds);
            if (!result.success) {
                // Revert on error
                setScenes(scenes);
                setError(result.error || 'Failed to reorder scenes');
            }
        });
    }, [draggedId, scenes, canEdit, project.id]);

    return (
        <div className="blueprint-theme space-y-6 pb-20 animate-in fade-in duration-500">
            {/* Blueprint Metrics & Status */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-8 rounded-sm bg-zinc-900 border border-zinc-800 shadow-2xl">
                <div className="flex items-center gap-8">
                    <div className="space-y-2">
                        <p className="text-metadata text-zinc-500 uppercase tracking-widest">Project Status</p>
                        <div className="flex items-center gap-2">
                            <div className={cn(
                                "w-2 h-2 rounded-none",
                                isApproved ? "bg-emerald-500 shadow-[0_0_10px_#10b981]" : "bg-primary animate-pulse shadow-[0_0_10px_#fbbf24]"
                            )} />
                            <span className="text-sm font-black text-zinc-50 uppercase tracking-widest italic">
                                {isApproved ? 'Authorized Output' : 'Synthesis Pending'}
                            </span>
                        </div>
                    </div>
                    <div className="w-px h-10 bg-zinc-800" />
                    <div className="space-y-2">
                        <p className="text-metadata text-zinc-500 uppercase tracking-widest">Segment Count</p>
                        <p className="text-base font-black text-zinc-50 uppercase italic">{scenes.length} Units</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {canEdit && (
                        <Button
                            onClick={handleGenerate}
                            disabled={isGenerating}
                            className="h-14 px-8 rounded-sm bg-zinc-950 border border-zinc-800 text-zinc-50 font-bold text-metadata uppercase tracking-widest hover:border-zinc-700 active:scale-[0.98] transition-all"
                        >
                            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-3" /> : <Sparkles className="w-4 h-4 mr-3" />}
                            Generate Blueprint
                        </Button>
                    )}

                    {canApprove && (
                        <Button
                            onClick={() => setIsApproveDialogOpen(true)}
                            disabled={isApproving || !isValidationPassed}
                            className={cn(
                                "h-14 px-8 rounded-sm font-black text-metadata uppercase tracking-widest active:scale-[0.98] transition-all",
                                isValidationPassed
                                    ? "primary-cta"
                                    : "bg-zinc-800 text-zinc-500 border border-zinc-700 cursor-not-allowed opacity-50"
                            )}
                        >
                            {isApproving ? <Loader2 className="w-4 h-4 animate-spin mr-3" /> : <CheckCircle2 className="w-4 h-4 mr-3" />}
                            Approve & Finalize
                        </Button>
                    )}
                </div>
            </div>

            {/* Validation Monitoring (Gap Group D) */}
            {!isApproved && (
                <ValidationMonitor
                    project={project}
                    scenes={scenes}
                    studioAssets={studioAssets}
                />
            )}

            {error && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-sm">
                    {error}
                </div>
            )}

            {isApproved && (
                <div className="p-10 rounded-sm bg-zinc-900 border border-emerald-500/20 flex items-center justify-between gap-8 group shadow-2xl">
                    <div className="flex items-center gap-8">
                        <div className="w-14 h-14 rounded-sm bg-emerald-500/10 flex items-center justify-center shrink-0 border border-emerald-500/20 group-hover:scale-110 transition-transform duration-700">
                            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                        </div>
                        <div>
                            <strong className="text-sm font-black text-emerald-400 uppercase tracking-widest block mb-1">Plan approved</strong>
                            <p className="text-metadata text-zinc-500 uppercase tracking-widest italic">
                                Blueprint locked and synced with production engines. Ready for high-fidelity execution.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            onClick={handleUnlock}
                            disabled={isUnlocking}
                            className="text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 h-14 px-6 uppercase tracking-widest font-bold"
                        >
                            {isUnlocking ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Unlock className="w-4 h-4 mr-2" />}
                            Unlock to Edit
                        </Button>
                        <Link href={`/dashboard/projects/${project.id}`}>
                            <Button className="primary-cta px-10 h-14">
                                Go to Magic Oven
                            </Button>
                        </Link>
                    </div>
                </div>
            )}

            {scenes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-6">
                        <span className="text-3xl">🎬</span>
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2">No scenes yet</h3>
                    <p className="text-muted-foreground text-center max-w-sm">
                        Click &quot;Generate Blueprint&quot; on the top right to create a scene plan based on your studio settings.
                    </p>
                </div>
            ) : (
                <div className="space-y-10">
                    {/* Reassurance Callout */}
                    <div className="p-4 rounded-sm bg-primary/5 border border-primary/20 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-1.5 h-1.5 rounded-none bg-primary shadow-[0_0_8px_#fbbf24]" />
                            <p className="text-metadata text-primary font-bold uppercase tracking-widest italic">
                            Your idea, media, and story structure are lined up.
                            </p>
                        </div>

                        {/* View Mode Switcher */}
                        <div className="flex bg-zinc-950 border border-zinc-800 p-1 rounded-sm">
                            <button
                                onClick={() => setViewMode('focused')}
                                className={cn(
                                    "px-4 py-2 rounded-sm flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all",
                                    viewMode === 'focused' ? "bg-zinc-800 text-zinc-50" : "text-zinc-500 hover:text-zinc-400"
                                )}
                            >
                                <Maximize2 className="w-3 h-3" />
                                Focused
                            </button>
                            <button
                                onClick={() => setViewMode('sequence')}
                                className={cn(
                                    "px-4 py-2 rounded-sm flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all",
                                    viewMode === 'sequence' ? "bg-zinc-800 text-zinc-50" : "text-zinc-500 hover:text-zinc-400"
                                )}
                            >
                                <LayoutGrid className="w-3 h-3" />
                                Sequence
                            </button>
                        </div>
                    </div>

                    {/* Creative Segment Navigator */}
                    {viewMode === 'focused' && scenes.length > 1 && (
                        <div className="flex flex-col gap-6">
                            <div className="flex items-center justify-between">
                                <h3 className="text-caption text-zinc-500 flex items-center gap-3">
                                    <div className="w-1 h-1 bg-zinc-700" />
                                    Choose a part
                                </h3>
                                <p className="text-metadata font-black text-zinc-600 uppercase tracking-widest italic">
                                    Unit <span className="text-primary">{activeSceneIndex + 1}</span> of <span className="text-zinc-50">{scenes.length}</span>
                                </p>
                            </div>

                            <div className="flex items-center gap-3 h-16 bg-zinc-950 border border-zinc-900 rounded-sm p-3 relative overflow-hidden group/nav">
                                {/* Navigation Glow */}
                                <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-zinc-950 to-transparent z-10" />
                                <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-zinc-950 to-transparent z-10" />

                                <button
                                    onClick={() => setActiveSceneIndex(Math.max(0, activeSceneIndex - 1))}
                                    disabled={activeSceneIndex === 0}
                                    className="w-10 h-10 shrink-0 flex items-center justify-center border border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-primary disabled:opacity-20 z-20 transition-all active:scale-90"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>

                                <div className="flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar py-2 px-10">
                                    {scenes.map((_, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setActiveSceneIndex(idx)}
                                            className={cn(
                                                "min-w-[40px] h-2 rounded-none transition-all duration-500",
                                                activeSceneIndex === idx
                                                    ? "bg-primary shadow-[0_0_8px_#fbbf24] flex-1"
                                                    : "bg-zinc-800 hover:bg-zinc-700"
                                            )}
                                            title={`Scene ${idx + 1}`}
                                        />
                                    ))}
                                </div>

                                <button
                                    onClick={() => setActiveSceneIndex(Math.min(scenes.length - 1, activeSceneIndex + 1))}
                                    disabled={activeSceneIndex === scenes.length - 1}
                                    className="w-10 h-10 shrink-0 flex items-center justify-center border border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-primary disabled:opacity-20 z-20 transition-all active:scale-90"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}

                    <div className={cn(
                        "transition-all duration-700",
                        viewMode === 'focused' ? "space-y-0" : "space-y-6"
                    )}>
                        {viewMode === 'focused' ? (
                            <div key={scenes[activeSceneIndex].id} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <SceneCard
                                    scene={scenes[activeSceneIndex]}
                                    index={activeSceneIndex}
                                    studioAssets={studioAssets}
                                    studioId={project.studio_id}
                                    isReadOnly={!canEdit}
                                />
                            </div>
                        ) : (
                            scenes.map((scene, index) => (
                                <SceneCard
                                    key={scene.id}
                                    scene={scene}
                                    index={index}
                                    studioAssets={studioAssets}
                                    studioId={project.studio_id}
                                    isReadOnly={!canEdit}
                                    isDragging={draggedId === scene.id}
                                    onDragStart={canEdit ? handleDragStart : undefined}
                                    onDragEnd={canEdit ? handleDragEnd : undefined}
                                    onDragOver={canEdit ? handleDragOver : undefined}
                                    onDrop={canEdit ? handleDrop : undefined}
                                />
                            ))
                        )}
                    </div>
                </div>
            )}

            {isReordering && (
                <div className="fixed bottom-6 right-6 px-4 py-2 rounded-full bg-slate-900 border border-white/10 text-xs font-medium text-slate-400 shadow-xl flex items-center gap-2 z-50 animate-in slide-in-from-bottom-5">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Saving order...
                </div>
            )}

            {/* Approval Confirmation Dialog */}
            <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
                <DialogContent className="sm:max-w-md border-white/10 bg-zinc-950/90 backdrop-blur-2xl shadow-2xl">
                    <DialogHeader className="space-y-4">
                        <div className="w-12 h-12 rounded-full bg-violet-500/10 flex items-center justify-center mx-auto border border-violet-500/20">
                            <CheckCircle2 className="w-6 h-6 text-violet-400" />
                        </div>
                        <div className="space-y-1 text-center">
                            <DialogTitle className="text-xl">Approve Blueprint?</DialogTitle>
                            <DialogDescription className="text-zinc-400">
                                This will lock your scenes and prepare the project for rendering.
                            </DialogDescription>
                        </div>
                    </DialogHeader>

                    <div className="my-4 p-4 rounded-xl bg-amber-500/5 border border-amber-500/10 flex gap-3">
                        <div className="mt-0.5 shrink-0">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        </div>
                        <div className="space-y-1">
                            <p className="text-xs font-medium text-amber-500 uppercase tracking-wider">Warning</p>
                            <p className="text-sm text-amber-200/80 leading-relaxed">
                                You won&apos;t be able to edit scenes or regenerate the blueprint after this step.
                            </p>
                        </div>
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            variant="ghost"
                            onClick={() => setIsApproveDialogOpen(false)}
                            disabled={isApproving}
                            className="w-full sm:w-auto hover:bg-white/5"
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleConfirmApprove}
                            disabled={isApproving}
                            className="w-full sm:w-auto"
                        >
                            {isApproving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                            Yes, Approve Blueprint
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
