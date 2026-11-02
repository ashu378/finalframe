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
            } catch (cause) {
                setError(cause instanceof Error ? cause.message : 'Test credits could not be granted.');
            }
        });
    }

    return <section className="studio-card border border-[#b99b5f]/35 bg-[#151b25] p-6 sm:p-7" aria-labelledby="test-credit-title">
        <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#b99b5f]">Development only</p>
            <h2 id="test-credit-title" className="mt-3 text-xl font-semibold">Grant controlled test credits</h2>
            <p className="mt-2 text-sm leading-6 text-[#91a0b8]">This form is available to studio administrators, but Convex still requires the development test-credit flag. It creates an auditable ledger entry and never creates a payment record.</p>
        </div>
        <form action={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Amount
                <input name="amount" type="number" min="1" max="10000" step="1" defaultValue="100" required className="mt-2 h-11 w-full rounded-xl border border-[#263143] bg-[#0b0d12] px-3 text-sm text-[#eaf0fa] outline-none focus:border-[#86a7ff]" />
            </label>
            <label className="text-sm font-medium">Idempotency key
                <input name="idempotencyKey" required placeholder="qa-account-2026-09-20" className="mt-2 h-11 w-full rounded-xl border border-[#263143] bg-[#0b0d12] px-3 text-sm text-[#eaf0fa] outline-none focus:border-[#86a7ff]" />
            </label>
            <label className="text-sm font-medium sm:col-span-2">Reason
                <input name="reason" required minLength={3} maxLength={240} placeholder="Controlled planning and renderer QA" className="mt-2 h-11 w-full rounded-xl border border-[#263143] bg-[#0b0d12] px-3 text-sm text-[#eaf0fa] outline-none focus:border-[#86a7ff]" />
            </label>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
                <button type="submit" disabled={isPending} className="ff-button-primary disabled:cursor-wait disabled:opacity-60">{isPending ? 'Granting…' : 'Grant test credits'}</button>
                {result && <p role="status" className="text-sm text-[#9be3c3]">{result}</p>}
                {error && <p role="alert" className="text-sm text-[#ff9e9e]">{error}</p>}
            </div>
        </form>
    </section>;
}
