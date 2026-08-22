'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { completeOnboarding } from '@/lib/onboarding/actions';

export function ConfirmForm() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit() {
        setLoading(true);
        setError(null);
        try {
            const result = await completeOnboarding();
            if (result?.error) {
                setError(result.error);
                setLoading(false);
            }
        } catch (e) {
            // Redirect
        }
    }

    return (
        <div className="space-y-6">
            {error && (
                <div className="text-red-500 text-sm bg-red-50 p-3 rounded-md">
                    {error}
                </div>
            )}

            <form action={handleSubmit}>
                <Button type="submit" disabled={loading} size="lg" className="w-full">
                    {loading ? 'Opening your studio…' : 'Start making videos'}
                </Button>
            </form>
        </div>
    );
}
