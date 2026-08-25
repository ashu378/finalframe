'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Download, ExternalLink, FileVideo, Loader2, MessageSquare, Play, RefreshCcw, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { getRenderJobs, submitRenderJob } from '@/lib/render/actions';
import type { RenderJob } from '@/lib/types/database';
import { ReviewApprovalPanel } from '@/components/production/review';

type FinishState = 'NOT_STARTED' | 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED' | 'UNAVAILABLE';

interface FinishPanelProps {
    projectId: string;
    assemblyReady: boolean;
    downloadUrl?: string;
    initialJob?: RenderJob | null;
}

function stateFromJob(job?: RenderJob | null, downloadUrl?: string): FinishState {
    if (downloadUrl || job?.status === 'completed') return 'READY';
    if (job?.status === 'processing') return 'PROCESSING';
    if (job?.status === 'queued') return 'QUEUED';
    if (job?.status === 'failed' || job?.status === 'cancelled') return 'FAILED';
    return 'NOT_STARTED';
}

function stateCopy(state: FinishState): { label: string; description: string } {
    switch (state) {
        case 'QUEUED': return { label: 'Queued for finishing', description: 'Your assembled parts are safely in line.' };
        case 'PROCESSING': return { label: 'Putting it together', description: 'FinalFrame is blending your takes, sound, captions, and timing.' };
        case 'READY': return { label: 'Ready to download', description: 'The finished file passed the final handoff.' };
        case 'FAILED': return { label: 'Finishing needs attention', description: 'The source takes are still safe. We could not complete the final file.' };
        case 'UNAVAILABLE': return { label: 'Finishing is not connected yet', description: 'The render service is not available in this environment.' };
        default: return { label: 'Ready to put it together', description: 'Your assembled parts are waiting for the finishing service.' };
    }
}

function extractDownloadUrl(job?: RenderJob | null): string | undefined {
    const output = job?.output_result;
    if (!output) return undefined;
    const candidate = output.video_url || output.url || output.download_url;
    return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

export function FinishPanel({ projectId, assemblyReady, downloadUrl: initialDownloadUrl, initialJob }: FinishPanelProps) {
    const [state, setState] = useState<FinishState>(stateFromJob(initialJob, initialDownloadUrl));
    const [job, setJob] = useState<RenderJob | null>(initialJob || null);
    const [downloadUrl, setDownloadUrl] = useState(initialDownloadUrl || extractDownloadUrl(initialJob));
    const [error, setError] = useState<string | undefined>();
    const [isStarting, setIsStarting] = useState(false);
    const [progress, setProgress] = useState(state === 'READY' ? 100 : state === 'PROCESSING' ? 45 : state === 'QUEUED' ? 8 : 0);

    useEffect(() => {
        if (state !== 'QUEUED' && state !== 'PROCESSING') return;
        const interval = window.setInterval(() => setProgress((value) => Math.min(92, value + (state === 'QUEUED' ? 2 : 4))), 1200);
        return () => window.clearInterval(interval);
    }, [state]);

    useEffect(() => {
        if (state !== 'QUEUED' && state !== 'PROCESSING') return;
        let cancelled = false;
        const poll = async () => {
            const result = await getRenderJobs(projectId);
            if (cancelled || !result.success || !result.jobs?.length) return;
            const latest = result.jobs[0];
            setJob(latest);
            const nextUrl = extractDownloadUrl(latest);
            if (nextUrl) setDownloadUrl(nextUrl);
            if (latest.status === 'completed' && nextUrl) {
                setProgress(100);
                setState('READY');
            } else if (latest.status === 'failed' || latest.status === 'cancelled') {
                setError(latest.error_message || 'The finishing service stopped before a file was ready.');
                setState('FAILED');
            } else if (latest.status === 'processing') setState('PROCESSING');
        };
        void poll();
        const interval = window.setInterval(() => void poll(), 4000);
        return () => { cancelled = true; window.clearInterval(interval); };
    }, [projectId, state]);

    async function startFinishing() {
        if (!assemblyReady || isStarting) return;
        setIsStarting(true);
        setError(undefined);
        try {
            const result = await submitRenderJob(projectId);
            if (!result.success) {
                const message = result.error || 'The finishing service is not available yet.';
                setError(message);
                setState(message.includes('UNSUPPORTED_CONVEX_OPERATION') ? 'UNAVAILABLE' : 'FAILED');
                return;
            }
            setProgress(8);
            setState('QUEUED');
            toast.success('Your video is queued for finishing.');
        } catch (requestError) {
            const message = requestError instanceof Error ? requestError.message : 'The finishing service is not available yet.';
            setError(message);
            setState('FAILED');
        } finally {
            setIsStarting(false);
        }
    }

    const copy = stateCopy(state);
    if (!assemblyReady) return <section className="ff-card p-6 sm:p-8" aria-labelledby="finish-title"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary"><FileVideo className="size-5 text-muted-foreground" aria-hidden="true" /></span><div><p className="ff-eyebrow">Put it together</p><h2 id="finish-title" className="ff-display mt-2 text-2xl font-semibold">Finish your video when every take is ready</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Once all parts have a take you like, FinalFrame will place them in order and prepare the sound, captions, and final format.</p></div></div><div className="mt-6 rounded-2xl bg-secondary/45 p-4 text-sm text-muted-foreground"><span className="font-semibold text-foreground">Not ready yet.</span> Complete or choose a take for every part before putting the video together.</div></section>;

    return <section className="ff-card overflow-hidden" aria-labelledby="finish-title"><div className="border-b border-border/70 bg-secondary/35 p-6 sm:p-8"><div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#d8cee8]"><Sparkles className="size-5" aria-hidden="true" /></span><div><p className="ff-eyebrow">Put it together</p><h2 id="finish-title" className="ff-display mt-2 text-2xl font-semibold">{copy.label}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{copy.description}</p></div></div><span className="inline-flex items-center gap-2 rounded-full bg-background px-3 py-2 text-xs font-semibold text-muted-foreground"><ShieldCheck className="size-4" aria-hidden="true" /> Sources stay attached</span></div></div><div className="space-y-5 p-6 sm:p-8">{(state === 'QUEUED' || state === 'PROCESSING') && <div className="rounded-2xl border border-primary/25 bg-[#fff8e9] p-5" aria-live="polite"><div className="flex items-center justify-between gap-3 text-sm font-semibold"><span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> {copy.label}</span><span>{progress}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-primary/15"><div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} /></div><p className="mt-3 text-sm leading-6 text-muted-foreground">You can leave this page. We will keep the status attached to your project.</p></div>}{state === 'NOT_STARTED' && <div className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-background/55 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">The parts are assembled and ready.</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Start the finishing step when you want the final sound, captions, and format prepared.</p></div><button type="button" onClick={startFinishing} disabled={isStarting} className="ff-button-primary min-h-11 shrink-0">{isStarting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />} Make the finished video</button></div>}{state === 'UNAVAILABLE' && <div className="rounded-2xl border border-border/70 bg-secondary/45 p-5"><div className="flex gap-3"><ExternalLink className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden="true" /><div><p className="font-semibold">The finishing service is not connected yet.</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Your assembly is ready, but this environment does not expose the render worker. No fake download is shown. Connect the finishing service before promising a final file.</p><p className="mt-3 text-xs text-muted-foreground">{error}</p></div></div></div>}{state === 'FAILED' && <div className="rounded-2xl border border-[#d88f79]/45 bg-[#fff4ef] p-5"><div className="flex gap-3"><AlertTriangle className="mt-1 size-5 shrink-0 text-[#8d3f2c]" aria-hidden="true" /><div><p className="font-semibold text-[#7e3828]">We could not finish the video.</p><p className="mt-2 text-sm leading-6 text-[#7e3828]">{error || copy.description}</p><button type="button" onClick={() => { setState('NOT_STARTED'); setProgress(0); setError(undefined); }} className="ff-button-quiet mt-4 min-h-11 border border-[#d88f79]/45 text-[#7e3828]"><RefreshCcw className="size-4" aria-hidden="true" /> Try finishing again</button></div></div></div>}{state === 'READY' && downloadUrl && <div className="rounded-2xl border border-[#8fbda8]/60 bg-[#f0faf5] p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="inline-flex items-center gap-2 font-semibold text-[hsl(var(--success))]"><Check className="size-4" aria-hidden="true" /> Download ready</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Your finished video is available to review and download.</p></div><a href={downloadUrl} download className="ff-button-primary min-h-11"><Download className="size-4" aria-hidden="true" /> Download video</a></div></div>}{state === 'READY' && !downloadUrl && <div className="rounded-2xl border border-border/70 bg-secondary/45 p-5"><p className="font-semibold">The finishing status is complete, but no download link is available.</p><p className="mt-2 text-sm leading-6 text-muted-foreground">We will not show a download until the final file is verified and securely attached.</p></div>}<ReviewApprovalPanel videoUrl={downloadUrl} available={Boolean(downloadUrl)} actionsAvailable={false} /></div></section>;
}
