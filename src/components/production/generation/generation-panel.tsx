'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Clock3, Film, Info, Loader2, Play, RefreshCcw, Sparkles, WandSparkles } from 'lucide-react';
import { toast } from 'sonner';
import { createShotGenerationJob } from '@/lib/generation/actions';
import type { GenerationJobView, GenerationSequenceView, GenerationShotView } from './types';

interface GenerationPanelProps {
    productionId: string;
    sequences: GenerationSequenceView[];
    jobs: GenerationJobView[];
    enabled: boolean;
}

type LocalJob = GenerationJobView & { jobId: string; progress: number };

function normalizedStatus(status?: string): string {
    return status?.toUpperCase() || 'PLANNING';
}

function statusCopy(status?: string): { label: string; description: string; tone: 'neutral' | 'warm' | 'success' | 'danger' } {
    switch (normalizedStatus(status)) {
        case 'QUEUED': return { label: 'Waiting to start', description: 'Your take is safely in line.', tone: 'warm' };
        case 'PROCESSING':
        case 'SUBMITTED':
        case 'POLLING':
        case 'DOWNLOADING': return { label: 'Making this take', description: 'FinalFrame is working through the visual direction.', tone: 'warm' };
        case 'COMPLETED': return { label: 'Ready to review', description: 'This take is ready for you to compare.', tone: 'success' };
        case 'FAILED':
        case 'RETRYABLE_FAILURE': return { label: 'Needs another try', description: 'This take could not finish, but the rest of your plan is safe.', tone: 'danger' };
        default: return { label: 'Not made yet', description: 'The take is planned and ready when making is enabled.', tone: 'neutral' };
    }
}

function progressFor(job?: GenerationJobView): number {
    const status = normalizedStatus(job?.status);
    if (status === 'COMPLETED') return 100;
    if (status === 'PROCESSING' || status === 'SUBMITTED' || status === 'POLLING' || status === 'DOWNLOADING') return Math.max(8, Math.min(92, job?.progress ?? 35));
    if (status === 'QUEUED') return Math.max(2, Math.min(8, job?.progress ?? 4));
    return 0;
}

function ToneIcon({ tone }: { tone: ReturnType<typeof statusCopy>['tone'] }) {
    if (tone === 'success') return <Check className="size-4" aria-hidden="true" />;
    if (tone === 'danger') return <AlertTriangle className="size-4" aria-hidden="true" />;
    if (tone === 'warm') return <Loader2 className="size-4 animate-spin" aria-hidden="true" />;
    return <Clock3 className="size-4" aria-hidden="true" />;
}

function statusClasses(tone: ReturnType<typeof statusCopy>['tone']): string {
    if (tone === 'success') return 'bg-[#c8ddd5] text-[hsl(var(--success))]';
    if (tone === 'danger') return 'bg-[#f1c7b7] text-[#8d3f2c]';
    if (tone === 'warm') return 'bg-[#f6dfb1] text-foreground';
    return 'bg-secondary text-muted-foreground';
}

function initialJobForShot(jobs: GenerationJobView[], shot: GenerationShotView): GenerationJobView | undefined {
    return jobs.filter((job) => job.shotId === shot._id).sort((a, b) => progressFor(b) - progressFor(a))[0];
}

export function GenerationPanel({ productionId, sequences, jobs, enabled }: GenerationPanelProps) {
    const [localJobs, setLocalJobs] = useState<Record<string, LocalJob>>({});
    const [pendingShotId, setPendingShotId] = useState<string | null>(null);

    useEffect(() => {
        if (!pendingShotId) return;
        const interval = window.setInterval(() => {
            setLocalJobs((current) => {
                const active = current[pendingShotId];
                if (!active || normalizedStatus(active.status) === 'COMPLETED' || normalizedStatus(active.status) === 'FAILED') return current;
                return { ...current, [pendingShotId]: { ...active, status: 'PROCESSING', progress: Math.min(92, Math.max(12, active.progress + 4)) } };
            });
        }, 1200);
        return () => window.clearInterval(interval);
    }, [pendingShotId]);

    const takeCount = useMemo(() => sequences.reduce((total, sequence) => total + sequence.scenes.reduce((sceneTotal, scene) => sceneTotal + scene.shots.length, 0), 0), [sequences]);
    const madeCount = useMemo(() => sequences.reduce((total, sequence) => total + sequence.scenes.reduce((sceneTotal, scene) => sceneTotal + scene.shots.filter((shot) => normalizedStatus(localJobs[shot._id]?.status || initialJobForShot(jobs, shot)?.status || shot.status) === 'COMPLETED').length, 0), 0), [jobs, localJobs, sequences]);

    function jobFor(shot: GenerationShotView): GenerationJobView | undefined {
        return localJobs[shot._id] || initialJobForShot(jobs, shot);
    }

    async function makeTake(shot: GenerationShotView) {
        if (!enabled || pendingShotId) return;
        setPendingShotId(shot._id);
        setLocalJobs((current) => ({ ...current, [shot._id]: { shotId: shot._id, jobId: `pending-${shot._id}`, status: 'QUEUED', progress: 4 } }));
        try {
            const result = await createShotGenerationJob({ productionId, shotId: shot._id });
            if (!result.success || !result.jobId) throw new Error(result.error || 'FinalFrame could not queue this take.');
            const jobId = result.jobId;
            setLocalJobs((current) => ({ ...current, [shot._id]: { ...current[shot._id], shotId: shot._id, jobId, status: 'PROCESSING', progress: 12 } }));
            const response = await fetch(`/api/generation/${jobId}`, { method: 'POST' });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload.success) throw new Error(payload.error || 'The making step could not finish this take.');
            setLocalJobs((current) => ({ ...current, [shot._id]: { ...current[shot._id], shotId: shot._id, jobId, status: 'COMPLETED', progress: 100, assetId: payload.assetId } }));
            toast.success(`${shot.title} is ready to review.`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'The making step could not finish this take.';
            setLocalJobs((current) => ({ ...current, [shot._id]: { ...current[shot._id], shotId: shot._id, jobId: current[shot._id]?.jobId || `failed-${shot._id}`, status: 'FAILED', progress: 0, errorMessage: message } }));
            toast.error(message);
        } finally {
            setPendingShotId(null);
        }
    }

    if (!enabled) {
        return <section className="ff-card overflow-hidden" aria-labelledby="making-disabled-title"><div className="flex flex-col items-center p-8 text-center sm:p-12"><span className="grid size-14 place-items-center rounded-2xl bg-secondary"><WandSparkles className="size-6 text-muted-foreground" aria-hidden="true" /></span><p className="ff-eyebrow mt-6">Making is not enabled yet</p><h2 id="making-disabled-title" className="ff-display mt-3 text-2xl font-semibold">Your plan is safe and ready</h2><p className="mt-3 max-w-lg leading-7 text-muted-foreground">This workflow is still being tested before it is opened to creators. Your parts, takes, and estimate are saved; no generation is available from this screen yet.</p><div className="mt-6 inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-xs font-semibold text-muted-foreground"><Info className="size-4" aria-hidden="true" /> We will show the making controls when the workflow passes its quality check.</div></div></section>;
    }

    if (!sequences.length) {
        return <section className="ff-card flex flex-col items-center p-10 text-center" aria-live="polite"><span className="grid size-12 place-items-center rounded-2xl bg-[#f6dfb1]"><Film className="size-5" aria-hidden="true" /></span><h2 className="ff-display mt-6 text-2xl font-semibold">Preparing your parts</h2><p className="mt-3 max-w-md leading-7 text-muted-foreground">Your approved plan is being prepared. The take controls will appear here when it is ready.</p><div className="mt-6 h-2 w-44 overflow-hidden rounded-full bg-secondary"><span className="block h-full w-1/2 animate-pulse rounded-full bg-primary" /></div></section>;
    }

    return <div className="space-y-6" aria-label="Video making workspace"><section className="rounded-[1.4rem] bg-[#211b18] p-6 text-[#f7f0e3] sm:p-8"><div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="ff-eyebrow text-[#f6dfb1]">Make your video</p><h2 className="ff-display mt-3 text-3xl font-semibold">Make one take at a time.</h2><p className="mt-3 max-w-2xl leading-7 text-[#cbb7a4]">Each take can be made, checked, and tried again without losing the rest of your plan.</p></div><div className="rounded-2xl bg-white/10 px-4 py-3 text-sm"><span className="font-semibold text-[#f6dfb1]">{madeCount}/{takeCount}</span><span className="ml-2 text-[#cbb7a4]">takes ready</span></div></div><div className="mt-6 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#f6dfb1] transition-all duration-500" style={{ width: `${takeCount ? (madeCount / takeCount) * 100 : 0}%` }} /></div></section>{sequences.map((sequence) => <section key={sequence._id} className="ff-card overflow-hidden"><div className="flex flex-col justify-between gap-4 border-b border-border/70 bg-[#f4ead6] p-6 sm:flex-row sm:items-center sm:p-8"><div><p className="ff-eyebrow">Part group {sequence.orderIndex + 1}</p><h3 className="ff-display mt-3 text-2xl font-semibold">{sequence.title}</h3><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{sequence.description}</p></div><span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Film className="size-4" aria-hidden="true" /> {sequence.scenes.reduce((count, scene) => count + scene.shots.length, 0)} takes</span></div><div className="divide-y divide-border/70">{sequence.scenes.map((scene) => <div key={scene._id} className="p-6 sm:p-8"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="ff-eyebrow">Part {scene.orderIndex + 1}</p><h4 className="mt-2 text-lg font-semibold">{scene.title}</h4><p className="mt-2 text-sm leading-6 text-muted-foreground">{scene.purpose}</p></div><span className="text-sm text-muted-foreground">{scene.shots.length} {scene.shots.length === 1 ? 'take' : 'takes'}</span></div><div className="mt-6 grid gap-3 lg:grid-cols-2">{scene.shots.map((shot) => <TakeCard key={shot._id} shot={shot} job={jobFor(shot)} pending={pendingShotId === shot._id} enabled={enabled} onMake={() => makeTake(shot)} />)}</div></div>)}</div></section>)}</div>;
}

function TakeCard({ shot, job, pending, enabled, onMake }: { shot: GenerationShotView; job?: GenerationJobView; pending: boolean; enabled: boolean; onMake: () => void }) {
    const status = statusCopy(job?.status || shot.status);
    const progress = progressFor(job);
    const completed = normalizedStatus(job?.status || shot.status) === 'COMPLETED';
    const failed = normalizedStatus(job?.status) === 'FAILED' || normalizedStatus(job?.status) === 'RETRYABLE_FAILURE';
    return <article className="rounded-[1rem] border border-border/70 bg-secondary/25 p-4 sm:p-5"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-sm font-semibold">{shot.title}</p><p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{shot.prompt}</p></div><span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-semibold ${statusClasses(status.tone)}`}><ToneIcon tone={status.tone} />{status.label}</span></div>{(pending || ['QUEUED', 'PROCESSING', 'SUBMITTED', 'POLLING', 'DOWNLOADING'].includes(normalizedStatus(job?.status))) && <div className="mt-5 rounded-xl bg-card p-3" aria-live="polite"><div className="flex items-center justify-between gap-3 text-xs font-semibold"><span>{status.description}</span><span>{progress}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} /></div></div>}{failed && <div className="mt-5 rounded-xl border border-[#d88f79]/45 bg-[#fff4ef] p-3 text-sm leading-6 text-[#7e3828]"><div className="flex gap-2"><AlertTriangle className="mt-1 size-4 shrink-0" aria-hidden="true" /><div><p className="font-semibold">We could not finish this take.</p><p className="mt-1">{job?.errorMessage || 'The making service stopped before a video was ready.'}</p><p className="mt-2 text-xs">Your other parts are unchanged. You can try this take again when the making service is available.</p></div></div></div>}{completed && <div className="mt-5 flex items-center gap-2 rounded-xl bg-[#c8ddd5]/55 px-3 py-3 text-sm font-semibold text-[hsl(var(--success))]"><Check className="size-4" aria-hidden="true" /> Take ready for review</div>}<div className="mt-5 flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between"><span className="text-xs text-muted-foreground">{shot.durationSeconds}s · cost shown before making</span>{completed ? <button type="button" onClick={onMake} disabled={pending || !enabled} className="ff-button-quiet min-h-11 border border-border"><RefreshCcw className="size-4" aria-hidden="true" /> Regenerate take</button> : failed ? <button type="button" onClick={onMake} disabled={pending || !enabled} className="ff-button-primary min-h-11"><RefreshCcw className="size-4" aria-hidden="true" /> Try this take again</button> : <button type="button" onClick={onMake} disabled={pending || !enabled} className="ff-button-primary min-h-11"><Play className="size-4" aria-hidden="true" /> {pending ? 'Starting…' : 'Make this take'}</button>}</div>{job?.errorMessage && !failed && <details className="group mt-3 text-xs text-muted-foreground"><summary className="flex cursor-pointer list-none items-center gap-2"><ChevronDown className="size-3 transition group-open:rotate-180" aria-hidden="true" /> See technical details</summary><p className="mt-2 rounded-lg bg-background p-3 leading-5">{job.errorMessage}</p></details>}</article>;
}
