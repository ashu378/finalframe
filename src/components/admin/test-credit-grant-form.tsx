'use client';

import { useState, useTransition } from 'react';
import { grantDevelopmentTestCredits } from '@/lib/admin/actions';

export function TestCreditGrantForm() {
    const [isPending, startTransition] = useTransition();
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    function submit(formData: FormData) {
        setResult(null);
        setError(null);
        const amount = Number(formData.get('amount'));
        const reason = String(formData.get('reason') || '').trim();
        const idempotencyKey = String(formData.get('idempotencyKey') || '').trim();
        startTransition(async () => {
            try {
                const granted = await grantDevelopmentTestCredits({ amount, reason, idempotencyKey });
                setResult(`${granted.amount.toLocaleString()} test credits granted. New balance: ${granted.balance.toLocaleString()}.`);
            } catch {
                setError('Test credits were not confirmed. Check your administrator access, the development flag, and the current balance before retrying with the same request reference.');
            }
        });
    }

    return <section className="studio-card border border-border/35 bg-card p-6 sm:p-7" aria-labelledby="test-credit-title">
        <div className="max-w-2xl">
            <p className="text-sm font-semibold text-primary">For testing only</p>
            <h2 id="test-credit-title" className="mt-3 text-xl font-semibold">Add test credits</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">This form is available to studio administrators, but testing must still be enabled on the server. It records the change in credit history. It does not create a payment or top up the AI provider account.</p>
        </div>
        <form action={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Amount
                <input name="amount" type="number" min="1" max="10000" step="1" defaultValue="100" required className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-base text-foreground outline-none focus:border-primary" />
            </label>
            <label className="text-sm font-medium">Request reference
                <input name="idempotencyKey" required placeholder="my-first-video-test" className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-base text-foreground outline-none focus:border-primary" />
            </label>
            <label className="text-sm font-medium sm:col-span-2">Reason
                <input name="reason" required minLength={3} maxLength={240} placeholder="Test planning and video export" className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-base text-foreground outline-none focus:border-primary" />
            </label>
            <p className="text-xs leading-6 text-muted-foreground sm:col-span-2">Use the same request reference when retrying the same grant. Use a new reference for a separate grant.</p>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
                <button type="submit" disabled={isPending} className="ff-button-primary disabled:cursor-wait disabled:opacity-60">{isPending ? 'Adding credits…' : 'Add test credits'}</button>
                {result && <p role="status" className="text-sm text-[#9be3c3]">{result}</p>}
                {error && <p role="alert" className="text-sm text-[#ff9e9e]">{error}</p>}
            </div>
        </form>
    </section>;
}
