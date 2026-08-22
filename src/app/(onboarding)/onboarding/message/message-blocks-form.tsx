'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { saveMessageBlocks } from '@/lib/onboarding/actions';

export function MessageBlocksForm() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(formData: FormData) {
        setLoading(true);
        setError(null);
        try {
            const result = await saveMessageBlocks(formData);
            if (result?.error) {
                setError(result.error);
                setLoading(false);
            }
        } catch (e) {
            // Redirect
        }
    }

    const textareaClass = "flex min-h-[100px] w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 ring-offset-background placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:border-violet-500 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200";
    const labelClass = "text-sm font-semibold text-slate-200 leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 mb-1.5 block";
    const helpClass = "text-xs text-slate-400 mb-2 block";

    return (
        <form action={handleSubmit} className="space-y-6">

            <div className="space-y-1">
                <label htmlFor="value_proposition" className={labelClass}>Value Proposition</label>
                <span className={helpClass}>What exactly do you solve, and for whom?</span>
                <textarea
                    id="value_proposition"
                    name="value_proposition"
                    className={textareaClass}
                    placeholder="e.g. We help creators scale their content w/o burnout by automating editing..."
                    required
                />
            </div>

            <div className="space-y-1">
                <label htmlFor="emotional_promise" className={labelClass}>Emotional Promise</label>
                <span className={helpClass}>How should your audience feel after watching?</span>
                <textarea
                    id="emotional_promise"
                    name="emotional_promise"
                    className={textareaClass}
                    placeholder="e.g. Empowered, Relieved, Excited, Curios..."
                    required
                />
            </div>

            <div className="space-y-1">
                <label htmlFor="proof_point" className={labelClass}>Proof Point (Optional)</label>
                <span className={helpClass}>Why should they believe you? (Stats, Logos, Years)</span>
                <textarea
                    id="proof_point"
                    name="proof_point"
                    className={textareaClass}
                    placeholder="e.g. Trusted by 500+ agencies, As seen on Forbes..."
                />
            </div>

            {error && (
                <div className="text-red-400 text-sm bg-red-950/50 border border-red-900/50 p-4 rounded-lg flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    {error}
                </div>
            )}

            <Button
                type="submit"
                disabled={loading}
                size="lg"
                className="w-full h-12 text-base font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:brightness-110 shadow-[0_0_20px_-5px_rgba(124,58,237,0.5)] transition-all"
            >
                {loading ? 'Saving…' : 'Continue'}
            </Button>
        </form>
    );
}
