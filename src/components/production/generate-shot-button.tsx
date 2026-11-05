'use client';

import { useRef, useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { confirmShotGeneration, previewShotGeneration } from '@/lib/generation/actions';
import type { ShotGenerationEstimate } from '@/lib/generation/shot-estimate';

export function GenerateShotButton({ productionId, shotId, disabled, label = 'Generate' }: {
    productionId: string; shotId: string; disabled?: boolean; label?: string;
}) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [quote, setQuote] = useState<ShotGenerationEstimate>();
    const requestId = useRef<string | undefined>(undefined);
    const busy = useRef(false);

    async function run(confirm: boolean) {
        if (busy.current || disabled || (confirm && !quote)) return;
        busy.current = true;
        setLoading(true);
        setError('');
        try {
            if (confirm && quote) {
                const result = await confirmShotGeneration({ estimateId: quote.estimateId, quoteHash: quote.quoteHash });
                if (!result.success || !result.jobId) {
                    const message = result.error || 'Could not confirm the take. Retry this confirmation to check its status.';
                    setError(message);
                    toast.error(message);
                    return;
                }
                setQuote(undefined);
                requestId.current = undefined;
                toast.success('Shot queued. You can leave this page while FinalFrame works.');
                return;
            }
            requestId.current ??= crypto.randomUUID();
            const result = await previewShotGeneration({ productionId, shotId, requestId: requestId.current });
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
        <button type="button" onClick={() => run(false)} disabled={loading || disabled} className="ff-button-quiet min-h-11 border border-border">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {quote ? 'Refresh estimate' : `${label} · Review cost`}
        </button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {quote && <div className="space-y-2 rounded-lg border border-border p-3 text-sm" aria-live="polite">
            <p>{quote.model} · {quote.totalCredits} credits</p>
            <p>Estimated provider cost ${quote.baseProviderUsd.toFixed(4)}. Budget hold ${(quote.providerHoldMicros / 1e6).toFixed(4)}.</p>
            <p className="text-xs text-muted-foreground">Estimate valid until {new Date(quote.expiresAt).toLocaleTimeString()}.</p>
            <div className="flex flex-wrap gap-2">
                <button type="button" className="ff-button-primary min-h-11" disabled={loading || disabled} onClick={() => run(true)}>Confirm and make take</button>
                <button type="button" className="ff-button-quiet min-h-11" disabled={loading} onClick={() => setQuote(undefined)}>Close estimate</button>
            </div>
        </div>}
    </div>;
}
