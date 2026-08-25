'use client';

import { useState } from 'react';
import { AlertTriangle, Check, Film, Layers3, Loader2, PackageCheck, RefreshCcw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { createAssemblyJob } from '@/lib/assembly/actions';
import { FinishPanel } from '@/components/render';

interface AssemblyPanelProps {
    productionId: string;
    totalTakes: number;
    readyTakes: number;
    enabled: boolean;
}

type AssemblyState = 'READY_TO_BUILD' | 'BUILDING' | 'ASSEMBLED' | 'FAILED' | 'UNAVAILABLE';

export function AssemblyPanel({ productionId, totalTakes, readyTakes, enabled }: AssemblyPanelProps) {
    const [state, setState] = useState<AssemblyState>(readyTakes === totalTakes && totalTakes > 0 ? 'READY_TO_BUILD' : 'READY_TO_BUILD');
    const [isBuilding, setIsBuilding] = useState(false);
    const [error, setError] = useState<string>();
    const [manifestCount, setManifestCount] = useState(0);
    const complete = totalTakes > 0 && readyTakes === totalTakes;

    async function buildAssembly() {
        if (!enabled || !complete || isBuilding) return;
        setIsBuilding(true);
        setError(undefined);
        setState('BUILDING');
        try {
            const result = await createAssemblyJob(productionId);
            if (!result.success) {
                const message = result.error || 'FinalFrame could not put the takes together.';
                setError(message);
                setState(message.includes('UNSUPPORTED_CONVEX_OPERATION') ? 'UNAVAILABLE' : 'FAILED');
                return;
            }
            setManifestCount(result.manifest?.items?.length || readyTakes);
            setState('ASSEMBLED');
            toast.success('Your parts are assembled and ready for finishing.');
        } catch (assemblyError) {
            const message = assemblyError instanceof Error ? assemblyError.message : 'FinalFrame could not put the takes together.';
            setError(message);
            setState('FAILED');
        } finally {
            setIsBuilding(false);
        }
    }

    if (!enabled) {
        return (
            <section className="ff-card p-6 sm:p-8" aria-labelledby="assembly-disabled-title">
                <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary">
                        <Layers3 className="size-5 text-muted-foreground" aria-hidden="true" />
                    </span>
                    <div>
                        <p className="ff-eyebrow">Put it together</p>
                        <h2 id="assembly-disabled-title" className="ff-display mt-2 text-2xl font-semibold">
                            Finishing is not available yet
                        </h2>
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                            The making workflow is still behind a quality flag, so assembly and final export controls stay hidden until it is ready.
                        </p>
                    </div>
                </div>
            </section>
        );
    }

    if (!totalTakes) {
        return (
            <section className="ff-card flex flex-col items-center p-10 text-center" aria-live="polite">
                <span className="grid size-12 place-items-center rounded-2xl bg-secondary">
                    <Film className="size-5" aria-hidden="true" />
                </span>
                <h2 className="ff-display mt-6 text-2xl font-semibold">Your parts will appear here</h2>
                <p className="mt-3 max-w-md leading-7 text-muted-foreground">
                    Assembly becomes available after your approved plan has at least one take.
                </p>
            </section>
        );
    }

    if (!complete) {
        return (
            <section className="ff-card p-6 sm:p-8" aria-labelledby="assembly-waiting-title">
                <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f6dfb1]">
                        <PackageCheck className="size-5" aria-hidden="true" />
                    </span>
                    <div>
                        <p className="ff-eyebrow">Put it together</p>
                        <h2 id="assembly-waiting-title" className="ff-display mt-2 text-2xl font-semibold">
                            Finish the remaining takes first
                        </h2>
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                            Assembly waits until every part has a take to place in order. Nothing is discarded while you finish the missing parts.
                        </p>
                    </div>
                </div>
                <div className="mt-6 flex flex-col gap-4 rounded-2xl bg-secondary/45 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="font-semibold">{readyTakes} of {totalTakes} takes ready</p>
                        <p className="mt-1 text-sm text-muted-foreground">Return to the take cards above to make or retry the missing parts.</p>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-background sm:max-w-56" role="progressbar" aria-valuemin={0} aria-valuemax={totalTakes} aria-valuenow={readyTakes} aria-label="Takes ready for assembly">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, (readyTakes / totalTakes) * 100)}%` }} />
                    </div>
                </div>
            </section>
        );
    }

    const title = state === 'ASSEMBLED'
        ? 'Your parts are assembled.'
        : state === 'BUILDING'
            ? 'Putting your parts together…'
            : state === 'UNAVAILABLE'
                ? 'Assembly is not connected yet'
                : state === 'FAILED'
                    ? 'Assembly needs attention'
                    : 'Everything is ready to assemble.';
    const description = state === 'ASSEMBLED'
        ? `${manifestCount} ordered take${manifestCount === 1 ? '' : 's'} prepared for finishing.`
        : state === 'BUILDING'
            ? 'We are checking the order and preparing the finishing handoff.'
            : state === 'UNAVAILABLE'
                ? 'This environment does not expose the assembly worker yet. No fake completion is shown.'
                : state === 'FAILED'
                    ? error || 'The assembly step stopped before a manifest was ready.'
                    : 'All approved takes are present and ready to place in sequence.';

    return (
        <div className="space-y-5">
            <section className="ff-card p-6 sm:p-8" aria-labelledby="assembly-title" aria-live="polite">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#c8ddd5]">
                            <Sparkles className="size-5 text-[hsl(var(--success))]" aria-hidden="true" />
                        </span>
                        <div>
                            <p className="ff-eyebrow">Put it together</p>
                            <h2 id="assembly-title" className="ff-display mt-2 text-2xl font-semibold">{title}</h2>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
                        </div>
                    </div>
                    {state === 'READY_TO_BUILD' && (
                        <button type="button" onClick={buildAssembly} disabled={isBuilding} className="ff-button-primary min-h-11 shrink-0">
                            {isBuilding ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Layers3 className="size-4" aria-hidden="true" />}
                            Put it together
                        </button>
                    )}
                </div>
                {state === 'FAILED' && (
                    <button type="button" onClick={() => { setState('READY_TO_BUILD'); setError(undefined); }} className="ff-button-quiet mt-5 border border-border">
                        <RefreshCcw className="size-4" aria-hidden="true" /> Try assembly again
                    </button>
                )}
                {state === 'UNAVAILABLE' && (
                    <div className="mt-5 rounded-xl bg-secondary/45 p-4 text-sm text-muted-foreground">
                        <AlertTriangle className="mr-2 inline size-4" aria-hidden="true" />{error}
                    </div>
                )}
                {state === 'ASSEMBLED' && (
                    <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#c8ddd5]/60 px-3 py-2 text-xs font-semibold text-[hsl(var(--success))]">
                        <Check className="size-4" aria-hidden="true" /> Ready for finishing
                    </div>
                )}
            </section>
            {state === 'ASSEMBLED' && <FinishPanel projectId={productionId} assemblyReady />}
        </div>
    );
}
