'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { OptionCard } from '@/components/onboarding/option-card';
import { saveGoal } from '@/lib/onboarding/actions';
import { OUTCOME_GOALS } from '@/lib/onboarding/types';

export function GoalForm() {
    const [selectedGoal, setSelectedGoal] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(formData: FormData) {
        setLoading(true);
        setError(null);

        if (!selectedGoal) {
            setError('Please select a goal');
            setLoading(false);
            return;
        }

        formData.set('goal', selectedGoal);

        try {
            const result = await saveGoal(formData);
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
            <div className="grid gap-4">
                {OUTCOME_GOALS.map((goal) => (
                    <OptionCard
                        key={goal.id}
                        label={goal.label}
                        description={goal.description}
                        selected={selectedGoal === goal.id}
                        onClick={() => setSelectedGoal(goal.id)}
                    />
                ))}
                <input type="hidden" name="goal" value={selectedGoal} />
            </div>

            {error && (
                <div className="text-red-500 text-metadata bg-red-500/5 border border-red-500/20 p-5 rounded-sm flex items-center gap-4 uppercase tracking-widest italic leading-loose">
                    <span className="w-1.5 h-1.5 rounded-none bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
                    {error}
                </div>
            )}

            <Button
                type="submit"
                disabled={loading || !selectedGoal}
                size="lg"
                className="primary-cta w-full"
            >
                {loading ? 'Saving…' : 'Continue'}
            </Button>
        </form>
    );
}
