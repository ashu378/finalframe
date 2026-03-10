'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CheckCircle, XCircle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { getRenderJobs, resetStuckRender } from '@/lib/render/actions';
import { getProjectById } from '@/lib/project/actions';
import { Button } from '@/components/ui/button';
import type { RenderJob } from '@/lib/types/database';

interface RenderProgressProps {
    projectId: string;
    initialJobId?: string;
}

export function RenderProgress({ projectId }: RenderProgressProps) {
    const router = useRouter();
    const [status, setStatus] = useState<'queued' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'loading'>('loading');
    const [job, setJob] = useState<RenderJob | null>(null);
    const [isResetting, setIsResetting] = useState(false);

    useEffect(() => {
        if (isResetting) return; // Pause polling while resetting

        let intervalId: NodeJS.Timeout;

        const checkStatus = async () => {
            try {
                // Check Project State first as it's the source of truth for "Rendered"
                const { project } = await getProjectById(projectId);
                if (project?.state === 'rendered') {
                    setStatus('completed');
                    return;
                }

                // Polling jobs
                const { jobs } = await getRenderJobs(projectId);
                const latestJob = jobs?.[0]; // Get most recent

                console.log(`[Diagnostic] Project: ${project?.state}, Job: ${latestJob?.status || 'NONE'} (${latestJob?.id || 'NO_ID'})`);

                if (latestJob) {
                    setJob(latestJob);
                    setStatus(latestJob.status);

                    if (latestJob.status === 'completed' || latestJob.status === 'failed' || latestJob.status === 'cancelled') {
                        clearInterval(intervalId);
                        router.refresh();
                    }
                } else {
                    setStatus('queued');
                }
            } catch (error) {
                console.error('Polling error:', error);
            }
        };

        // Poll every 3 seconds
        checkStatus();
        intervalId = setInterval(checkStatus, 3000);

        return () => clearInterval(intervalId);
    }, [projectId, router, isResetting]);

    if (status === 'completed') {
        return (
            <div className="bg-emerald-500/5 border border-emerald-500/10 p-12 text-center rounded-sm">
                <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-6" />
                <h3 className="text-xl font-black text-white uppercase tracking-[0.4em] mb-4 italic">Production Finalized</h3>
                <p className="text-zinc-400 text-sm font-bold uppercase tracking-widest leading-loose mb-8">
                    The master signal has been stabilized. Refreshing terminal for playback access.
                </p>
                <Button onClick={() => window.location.reload()} variant="primary" size="lg" className="primary-cta px-12">
                    Enter Mastering Suite
                </Button>
            </div>
        );
    }

    if (status === 'failed') {
        return (
            <div className="bg-red-500/5 border border-red-500/10 p-12 text-center rounded-sm">
                <XCircle className="w-12 h-12 text-red-500 mx-auto mb-6" />
                <h3 className="text-xl font-black text-white uppercase tracking-[0.4em] mb-4 italic">Signal Failure</h3>
                <p className="text-red-400/70 text-[11px] font-black uppercase tracking-[0.2em] mb-8">
                    {job?.error_message || 'The production engine encountered a fatal interruption.'}
                </p>
                <div className="flex gap-4 justify-center">
                    <Button
                        onClick={async () => {
                            const result = await resetStuckRender(projectId);
                            if (result.success) {
                                toast.success('Signal Reset. Ready to authorize.');
                                window.location.reload();
                            } else {
                                toast.error('Reset failed: ' + result.error);
                            }
                        }}
                        variant="secondary"
                        size="md"
                        className="uppercase tracking-widest font-black italic border-white/10 hover:bg-white/5"
                    >
                        Retry Generation
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="relative overflow-hidden rounded-sm border border-primary/10 bg-zinc-900 p-12 text-center group shadow-2xl">
            <div className="absolute inset-0 bg-grid-white/[0.01]" />
            <div className="relative z-10 flex flex-col items-center">
                <div className="relative mb-10">
                    <div className="w-20 h-20 rounded-full border-2 border-primary/10 border-t-primary animate-spin" />
                    <Sparkles className="absolute inset-0 m-auto w-8 h-8 text-primary animate-pulse" />
                </div>

                <div className="space-y-4">
                    <h3 className="text-[20px] font-black text-white uppercase tracking-[0.4em] italic leading-tight">
                        Signal Synchronization
                    </h3>
                    <p className="text-primary/70 text-[11px] font-black uppercase tracking-[0.2em] italic">
                        {job?.error_message?.startsWith('SYNTHESIZING_SCENE_')
                            ? job.error_message.replace(/_/g, ' ')
                            : job?.error_message === 'INITIALIZING_ENGINE' ? 'Initializing AI Engine...'
                                : job?.error_message === 'PREPARING_ASSETS' ? 'Loading Studio Assets...'
                                    : job?.error_message === 'VALIDATING_SIGNALS' ? 'Validating Creative Signals...'
                                        : job?.error_message === 'CALIBRATING_ENGINES' ? 'Calibrating Dynamic Models...'
                                            : status === 'queued'
                                                ? 'Awaiting bandwidth slot (QUEUED)...'
                                                : 'Synthesizing master signal (PROCESSING)...'}
                    </p>
                    <div className="max-w-[340px] mx-auto pt-4 border-t border-white/5 mt-6 space-y-4">
                        <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.25em] leading-loose italic">
                            Estimated synchronization window: 120-300 seconds. Personnel may vacate this terminal while propagation completes.
                        </p>
                        <div className="pt-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                disabled={isResetting}
                                className="h-8 px-6 text-[9px] uppercase tracking-[0.2em] bg-red-500/5 hover:bg-red-500/10 border-red-500/20 text-red-400 hover:text-red-300 transition-all font-black"
                                onClick={async (e) => {
                                    e.preventDefault();
                                    console.log('[UI Reset] Reset button clicked');
                                    setIsResetting(true);
                                    try {
                                        const result = await resetStuckRender(projectId);
                                        console.log('[UI Reset] Server Result:', result);
                                        if (result.success) {
                                            toast.success('Reset successful. Reloading...');
                                            setTimeout(() => window.location.reload(), 1500);
                                        } else {
                                            toast.error(`Reset Failed: ${result.error || 'Unknown'}`);
                                            setIsResetting(false);
                                        }
                                    } catch (err: any) {
                                        console.error('[UI Reset] Fatal Error:', err);
                                        toast.error(`System Error: ${err.message}`);
                                        setIsResetting(false);
                                    }
                                }}
                            >
                                {isResetting ? 'Executing Reset...' : 'Force Signal Reset'}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
