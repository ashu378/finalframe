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
                    className="text-sm text-muted-foreground ml-1"
                >
                    Studio name
                </label>
                <input
                    type="text"
                    id="studioName"
                    name="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Maya’s kitchen studio"
                    required
                    className="w-full min-h-12 rounded-xl border border-border bg-background px-4 text-base font-medium normal-case tracking-normal text-white placeholder:text-muted-foreground transition-all focus:border-primary/50 outline-none "
                />
                <p className="text-sm text-muted-foreground pl-1 not-italic normal-case">
                    You can change this later. It is just the name you will see in your studio.
                </p>
            </div>

            {error && (
                <div className="text-red-500 text-sm bg-red-500/5 border border-red-500/20 p-5 rounded-xl flex items-center gap-4 normal-case tracking-normal not-italic">
                    <span className="w-1.5 h-1.5 rounded-none bg-red-500 " />
                    {error}
                </div>
            )}

            <Button
                type="submit"
                disabled={loading || !name.trim()}
                size="lg"
                className="primary-cta w-full"
            >
                {loading ? 'Creating your studio…' : 'Continue'}
            </Button>
        </form>
    );
}
