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
                <h2 className="text-sm font-semibold normal-case tracking-normal text-muted-foreground pl-1 not-italic">Where you will share it</h2>
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
                <h2 className="text-sm font-semibold normal-case tracking-normal text-muted-foreground pl-1 not-italic">How it will be watched</h2>
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
                <div className="text-red-500 text-sm font-semibold bg-red-500/5 border border-red-500/20 p-5 rounded-xl flex items-center gap-3 normal-case tracking-normal not-italic leading-loose">
                    <span className="w-1.5 h-1.5 rounded-none bg-red-500 " />
                    {error}
                </div>
            )}

            <Button
                type="submit"
                disabled={loading || !selectedPlatform || !selectedContext}
                size="lg"
                className="w-full min-h-12 text-sm font-semibold normal-case tracking-normal bg-primary text-black rounded-xl   hover:bg-white active:scale-[0.98] transition-all border-none not-italic"
            >
                {loading ? 'Saving…' : 'Continue'}
            </Button>
        </form>
    );
}
