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

    const textareaClass = "flex min-h-[100px] w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 ring-offset-background placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200";
    const labelClass = "text-sm font-semibold text-slate-200 leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 mb-1.5 block";
    const helpClass = "text-xs text-slate-400 mb-2 block";

    return (
        <form action={handleSubmit} className="space-y-6">

            <div className="space-y-1">
                <label htmlFor="value_proposition" className={labelClass}>What you offer</label>
                <span className={helpClass}>Who is this for, and how does it help them?</span>
                <textarea
                    id="value_proposition"
                    name="value_proposition"
                    className={textareaClass}
                    placeholder="e.g. We help busy shop owners make product videos."
                    required
                />
            </div>

            <div className="space-y-1">
                <label htmlFor="emotional_promise" className={labelClass}>How it should feel</label>
                <span className={helpClass}>How should your audience feel after watching?</span>
                <textarea
                    id="emotional_promise"
                    name="emotional_promise"
                    className={textareaClass}
                    placeholder="e.g. Excited, reassured or curious."
                    required
                />
            </div>

            <div className="space-y-1">
                <label htmlFor="proof_point" className={labelClass}>Why people should trust it (optional)</label>
                <span className={helpClass}>Add a real example, result or customer quote.</span>
                <textarea
                    id="proof_point"
                    name="proof_point"
                    className={textareaClass}
                    placeholder="e.g. A real customer review or a result you can prove."
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
                className="w-full min-h-12 text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/85  transition-all"
            >
                {loading ? 'Saving…' : 'Continue'}
            </Button>
        </form>
    );
}
