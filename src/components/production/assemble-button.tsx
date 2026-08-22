'use client';

import { useState } from 'react';
import { Loader2, Film } from 'lucide-react';
import { toast } from 'sonner';
import { createAssemblyJob } from '@/lib/assembly/actions';

export function AssembleButton({ productionId }: { productionId: string }) {
    const [loading, setLoading] = useState(false);
    async function handleClick() {
        setLoading(true);
        const result = await createAssemblyJob(productionId);
        setLoading(false);
        if (!result.success) toast.error(result.error || 'Unable to assemble production');
        else toast.success(`Assembly manifest ready for ${result.manifest?.items?.length || 0} shots.`);
    }
    return <button onClick={handleClick} disabled={loading} className="primary-cta inline-flex h-12 items-center gap-2 px-6 disabled:opacity-40">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />} Assemble approved shots</button>;
}
