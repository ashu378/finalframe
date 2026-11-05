'use client';

import { useRef, useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { confirmShotGeneration, previewShotGeneration } from '@/lib/generation/actions';
import { GENERATION_FINISH_OPTIONS, GENERATION_RESOLUTIONS, type GenerationResolution } from '@/lib/generation/finish-options';
import type { QualityTier } from '@/lib/types/database';
import type { ShotGenerationEstimate } from '@/lib/generation/shot-estimate';

export function GenerateShotButton({ productionId, shotId, disabled, label = 'Generate' }: {
    productionId: string; shotId: string; disabled?: boolean; label?: string;
}) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [quote, setQuote] = useState<ShotGenerationEstimate>();
    const [qualityTier,setQualityTier]=useState<QualityTier>('STANDARD');
    const [resolution,setResolution]=useState<GenerationResolution|''>('');
    const [confirmationPending,setConfirmationPending]=useState(false);
    function changeChoice(change:()=>void){if(loading||confirmationPending)return;change();setQuote(undefined);setError('');requestId.current=undefined;}
    const requestId = useRef<string | undefined>(undefined);
    const busy = useRef(false);

    async function run(confirm: boolean) {
        if (busy.current || disabled || (confirm && !quote)) return;
        busy.current = true;
        setLoading(true);
        setError('');
        try {
            if (confirm && quote) {
                setConfirmationPending(true);
                const result = await confirmShotGeneration({ estimateId: quote.estimateId, quoteHash: quote.quoteHash });
                if (!result.success || !result.jobId) {
                    if(result.success===false&&result.safeToRefresh===true){setConfirmationPending(false);setQuote(undefined);requestId.current=undefined;}
                    const message = result.error || 'Could not confirm the take. Retry this confirmation to check its status.';
                    setError(message);
                    toast.error(message);
                    return;
                }
                setQuote(undefined);setConfirmationPending(false);
                requestId.current = undefined;
                toast.success('Shot queued. You can leave this page while FinalFrame works.');
                return;
            }
            requestId.current ??= crypto.randomUUID();
            const result = await previewShotGeneration({ productionId, shotId,qualityTier,...(resolution?{generationResolution:resolution}:{}), requestId: requestId.current });
            if (!result.success || !result.quote) {
                const message = result.error || 'Could not estimate this take.';
                setError(message);
                toast.error(message);
                return;
            }
            setQuote(result.quote);
        } catch {
            const message = 'FinalFrame could not reach the server. Try again.';
            setError(message);
            toast.error(message);
        } finally {
            busy.current = false;
            setLoading(false);
        }
    }

    return <div className="max-w-sm space-y-2">
        <label className="block text-sm">Take finish<select aria-label="Take finish" className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background p-2" disabled={loading||disabled||confirmationPending} value={qualityTier} onChange={event=>changeChoice(()=>setQualityTier(event.target.value as QualityTier))}>{GENERATION_FINISH_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="block text-sm">Generation resolution<select aria-label="Take generation resolution" className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background p-2" disabled={loading||disabled||confirmationPending} value={resolution} onChange={event=>changeChoice(()=>setResolution(event.target.value as GenerationResolution|''))}><option value="">Use the approved shot / reviewed route</option>{GENERATION_RESOLUTIONS.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
        <p className="text-xs text-muted-foreground">For new footage and frame animation only. Preview plus 480p is a deliberate lower-cost choice. Final canvas, approved content and saved takes stay unchanged. Unsupported settings stop before purchase.</p>
        <button type="button" onClick={() => run(false)} disabled={loading || disabled || confirmationPending} className="ff-button-quiet min-h-11 border border-border">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {quote ? 'Refresh estimate' : `${label} · Review cost`}
        </button>
        {confirmationPending&&<p role="status" className="text-xs text-muted-foreground">This confirmation has been attempted. Check the same request or inspect saved takes before starting different work. Its settings stay frozen.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {quote && <div className="space-y-2 rounded-lg border border-border p-3 text-sm" aria-live="polite">
            <p>{quote.model} · {quote.totalCredits} credits</p><p>{quote.qualityTier ?? qualityTier} · generation {quote.generationResolution ?? 'reviewed route dimensions'} · final export settings unchanged</p>
            <p>Estimated provider cost ${quote.baseProviderUsd.toFixed(4)}. Budget hold ${(quote.providerHoldMicros / 1e6).toFixed(4)}.</p>
            <p className="text-xs text-muted-foreground">Estimate valid until {new Date(quote.expiresAt).toLocaleTimeString()}.</p>
            <div className="flex flex-wrap gap-2">
                <button type="button" className="ff-button-primary min-h-11" disabled={loading || disabled} onClick={() => run(true)}>{confirmationPending?'Check the same confirmation':'Confirm and make take'}</button>
                <button type="button" className="ff-button-quiet min-h-11" disabled={loading||confirmationPending} onClick={() => setQuote(undefined)}>Close estimate</button>
            </div>
        </div>}
    </div>;
}
