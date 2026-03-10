'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { OptionCard } from '@/components/onboarding/option-card';
import { savePlatform } from '@/lib/onboarding/actions';
import { PLATFORMS, CONTEXTS } from '@/lib/onboarding/types';

export function PlatformForm() {
    const [selectedPlatform, setSelectedPlatform] = useState<string>('');
    const [selectedContext, setSelectedContext] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(formData: FormData) {
        setLoading(true);
        setError(null);

        if (!selectedPlatform || !selectedContext) {
            setError('Please select both a platform and context');
            setLoading(false);
            return;
        }

        formData.set('platform', selectedPlatform);
        formData.set('context', selectedContext);

        try {
            const result = await savePlatform(formData);
            if (result?.error) {
                setError(result.error);
                setLoading(false);
            }
        } catch (e) {
            // Redirect handled by Next.js
        }
    }

    return (
        <form action={handleSubmit} className="space-y-8">
            <div className="space-y-6">
                <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400 pl-1 italic">01. Distribution_Target (Platform)</h2>
                <div className="grid gap-3">
                    {PLATFORMS.map((platform) => (
                        <OptionCard
                            key={platform.id}
                            label={platform.label}
                            selected={selectedPlatform === platform.id}
                            onClick={() => setSelectedPlatform(platform.id)}
                        />
                    ))}
                </div>
            </div>

            <div className="space-y-6">
                <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400 pl-1 italic">02. Signal_Context</h2>
                <div className="grid gap-3">
                    {CONTEXTS.map((context) => (
                        <OptionCard
                            key={context.id}
                            label={context.label}
                            selected={selectedContext === context.id}
                            onClick={() => setSelectedContext(context.id)}
                        />
                    ))}
                </div>
            </div>

            <input type="hidden" name="platform" value={selectedPlatform} />
            <input type="hidden" name="context" value={selectedContext} />

            {error && (
                <div className="text-red-500 text-[10px] font-black bg-red-500/5 border border-red-500/20 p-5 rounded-sm flex items-center gap-3 uppercase tracking-widest italic leading-loose">
                    <span className="w-1.5 h-1.5 rounded-none bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
                    {error}
                </div>
            )}

            <Button
                type="submit"
                disabled={loading || !selectedPlatform || !selectedContext}
                size="lg"
                className="w-full h-16 text-[11px] font-black uppercase tracking-[0.3em] bg-primary text-black rounded-sm shadow-2xl shadow-primary/20 hover:bg-white active:scale-[0.98] transition-all border-none italic"
            >
                {loading ? 'CALIBRATING_PLATFORM...' : 'Authorize_Signal_Parameters'}
            </Button>
        </form>
    );
}
