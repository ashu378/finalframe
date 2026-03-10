'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { createStudio } from '@/lib/onboarding/actions';

export function StudioForm() {
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(formData: FormData) {
        setLoading(true);
        setError(null);

        if (!name.trim()) {
            setError('Please enter a studio name');
            setLoading(false);
            return;
        }

        try {
            const result = await createStudio(formData);
            if (result?.error) {
                setError(result.error);
                setLoading(false);
            }
        } catch (e) {
            // Redirect handled by Next.js
        }
    }

    return (
        <form action={handleSubmit} className="space-y-6">
            <input type="hidden" name="role" value="Owner" />
            <div className="space-y-4">
                <label
                    htmlFor="studioName"
                    className="text-metadata text-zinc-500 ml-1"
                >
                    Studio Designator (Identity)
                </label>
                <input
                    type="text"
                    id="studioName"
                    name="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="ALPHA_CREATIVE_SYSTEMS"
                    required
                    className="w-full h-16 rounded-sm border border-zinc-800 bg-zinc-950 px-6 text-sm font-black uppercase tracking-widest text-white placeholder:text-zinc-800 transition-all focus:border-primary/50 outline-none shadow-2xl"
                />
                <p className="text-metadata text-zinc-600 pl-1 italic normal-case">
                    Permanent designator for production manifests and verified billing.
                </p>
            </div>

            {error && (
                <div className="text-red-500 text-metadata bg-red-500/5 border border-red-500/20 p-5 rounded-sm flex items-center gap-4 uppercase tracking-widest italic">
                    <span className="w-1.5 h-1.5 rounded-none bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
                    {error}
                </div>
            )}

            <Button
                type="submit"
                disabled={loading || !name.trim()}
                size="lg"
                className="primary-cta w-full"
            >
                {loading ? 'ESTABLISHING MANIFEST...' : 'Authorize Studio Creation'}
            </Button>
        </form>
    );
}
