'use client';

import { useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { createShotGenerationJob } from '@/lib/generation/actions';

export function GenerateShotButton({ productionId, shotId }: { productionId: string; shotId: string }) {
    const [loading, setLoading] = useState(false);
    async function handleClick() {
        setLoading(true);
        const result = await createShotGenerationJob({ productionId, shotId });
        setLoading(false);
        if (!result.success) toast.error(result.error || 'Unable to start shot generation');
        else {
            toast.success(`Shot queued. Estimated cost: ${result.estimate?.totalCredits || 0} credits.`);
            void fetch(`/api/generation/${result.jobId}`, { method: 'POST' });
        }
    }
    return <button onClick={handleClick} disabled={loading} className="inline-flex items-center gap-2 border border-primary/30 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-primary hover:bg-primary hover:text-black disabled:opacity-40">{loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} Generate</button>;
}
