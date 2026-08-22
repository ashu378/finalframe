'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { saveCreativeDNA } from '@/lib/onboarding/actions';
import { CREATIVE_DNA_OPTIONS } from '@/lib/onboarding/types';

const FIELDS = [
    { key: 'brand_energy', label: 'Brand Energy' },
    { key: 'editing_pace', label: 'Editing Pace' },
    { key: 'visual_style', label: 'Visual Style' },
    { key: 'text_personality', label: 'Text Personality' },
    { key: 'music_energy', label: 'Music Energy' },
] as const;

export function CreativeDNAForm() {
    const [selections, setSelections] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(formData: FormData) {
        setLoading(true);
        setError(null);

        // Check all fields
        const missing = FIELDS.find(f => !selections[f.key]);
        if (missing) {
            setError(`Please select a value for ${missing.label}`);
            setLoading(false);
            return;
        }

        FIELDS.forEach(f => {
            formData.set(f.key, selections[f.key]);
        });

        try {
            const result = await saveCreativeDNA(formData);
            if (result?.error) {
                setError(result.error);
                setLoading(false);
            }
        } catch (e) {
            // Redirect handled by Next.js
        }
    }

    return (
        <form action={handleSubmit} className="space-y-10">
            {FIELDS.map((field) => (
                <div key={field.key} className="space-y-6">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400 pl-1 italic">
                        {field.label.toUpperCase()}
                    </h3>
                    <div className="flex flex-wrap gap-3">
                        {(CREATIVE_DNA_OPTIONS as any)[field.key].map((option: string) => {
                            const isSelected = selections[field.key] === option;
                            return (
                                <button
                                    key={option}
                                    type="button"
                                    onClick={() => setSelections(prev => ({ ...prev, [field.key]: option }))}
                                    className={`
                                        px-6 py-3 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all duration-300 border italic
                                        outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black
                                        ${isSelected
                                            ? 'bg-primary border-primary text-black shadow-[0_0_25px_rgba(251,191,36,0.3)] scale-[1.02]'
                                            : 'bg-black border-white/5 text-zinc-500 hover:bg-white/5 hover:border-white/20 hover:text-zinc-300'
                                        }
                                    `}
                                >
                                    {option}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}

            {error && (
                <div className="text-red-500 text-[10px] font-black bg-red-500/5 border border-red-500/20 p-5 rounded-sm flex items-center gap-3 uppercase tracking-widest italic">
                    <span className="w-1.5 h-1.5 rounded-none bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
                    {error}
                </div>
            )}

            <Button
                type="submit"
                disabled={loading || Object.keys(selections).length < FIELDS.length}
                size="lg"
                className="w-full h-16 text-[11px] font-black uppercase tracking-[0.3em] bg-primary text-black rounded-sm shadow-2xl shadow-primary/20 hover:bg-white active:scale-[0.98] transition-all border-none italic"
            >
                {loading ? 'Saving…' : 'Continue'}
            </Button>
        </form>
    );
}
