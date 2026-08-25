'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { createCreditCheckout } from '@/lib/payments/actions';
import type { CreditPack, SupportedCurrency } from '@/lib/payments/types';

const CREDIT_PACKS: CreditPack[] = [
    { id: 'starter', label: 'Starter', amounts: { USD: 5, NGN: 7500 }, credits: 100 },
    { id: 'creator', label: 'Creator', amounts: { USD: 10, NGN: 15000 }, credits: 240 },
    { id: 'studio', label: 'Studio', amounts: { USD: 20, NGN: 30000 }, credits: 520 },
];

type PurchaseState =
    | { kind: 'idle' }
    | { kind: 'redirecting'; packId: string }
    | { kind: 'unavailable' | 'failed'; message: string };

function isUnavailableMessage(message: string) {
    return /not enabled|not configured|not available|sandbox|BACHS_API_KEY/i.test(message);
}

export function CreditPacks({ balance }: { balance: number }) {
    const [currency, setCurrency] = useState<SupportedCurrency>('NGN');
    const [loading, setLoading] = useState<string | null>(null);
    const [purchaseState, setPurchaseState] = useState<PurchaseState>({ kind: 'idle' });

    async function buy(packId: string) {
        setLoading(packId);
        setPurchaseState({ kind: 'idle' });

        try {
            const result = await createCreditCheckout(packId, currency);
            if (!result.success || !result.checkoutUrl) {
                const message = result.error || 'Secure checkout could not be started.';
                setPurchaseState({ kind: isUnavailableMessage(message) ? 'unavailable' : 'failed', message });
                toast.error(message);
                return;
            }

            setPurchaseState({ kind: 'redirecting', packId });
            toast.success('Secure checkout is opening. Your credits are added after payment is verified.');
            window.location.assign(result.checkoutUrl);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Secure checkout could not be started.';
            setPurchaseState({ kind: isUnavailableMessage(message) ? 'unavailable' : 'failed', message });
            toast.error(message);
        } finally {
            setLoading(null);
        }
    }

    const busy = loading !== null;

    return (
        <div className="space-y-5" aria-busy={busy}>
            <div className="flex flex-col justify-between gap-4 rounded-[1.1rem] bg-[#f4ead6] p-5 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-[#f6dfb1]">
                        <WalletCards className="size-5" aria-hidden="true" />
                    </span>
                    <div>
                        <p className="text-xs text-muted-foreground">Available video credits</p>
                        <p className="mt-1 text-3xl font-semibold">{balance.toLocaleString()}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Updates after a verified payment.</p>
                    </div>
                </div>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Currency
                    <select
                        aria-label="Purchase currency"
                        value={currency}
                        disabled={busy}
                        onChange={(event) => {
                            setCurrency(event.target.value as SupportedCurrency);
                            setPurchaseState({ kind: 'idle' });
                        }}
                        className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-normal text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <option value="USD">USD</option>
                        <option value="NGN">NGN</option>
                    </select>
                </label>
            </div>

            {purchaseState.kind === 'redirecting' && (
                <div className="flex items-start gap-3 rounded-2xl border border-[#8fbda8]/60 bg-[#f0faf5] p-4 text-sm" role="status" aria-live="polite">
                    <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-[hsl(var(--success))]" aria-hidden="true" />
                    <div>
                        <p className="font-semibold">Opening secure checkout…</p>
                        <p className="mt-1 text-muted-foreground">Do not close this tab. Credits will appear after the payment provider confirms the purchase.</p>
                    </div>
                </div>
            )}

            {(purchaseState.kind === 'unavailable' || purchaseState.kind === 'failed') && (
                <div className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${purchaseState.kind === 'unavailable' ? 'border-border bg-secondary/45' : 'border-[#d88f79]/45 bg-[#fff4ef]'}`} role="alert" aria-live="assertive">
                    <AlertTriangle className={`mt-0.5 size-4 shrink-0 ${purchaseState.kind === 'unavailable' ? 'text-muted-foreground' : 'text-[#8d3f2c]'}`} aria-hidden="true" />
                    <div>
                        <p className="font-semibold">{purchaseState.kind === 'unavailable' ? 'Credit purchases are unavailable here.' : 'We could not start checkout.'}</p>
                        <p className="mt-1 text-muted-foreground">{purchaseState.message}</p>
                    </div>
                </div>
            )}

            <div className="grid gap-3 md:grid-cols-3">
                {CREDIT_PACKS.map((pack, index) => {
                    const isLoading = loading === pack.id;
                    return (
                        <div key={pack.id} className={`rounded-[1.1rem] border p-5 ${index === 1 ? 'border-primary bg-[#fff8e9]' : 'border-border bg-card'}`}>
                            <p className="ff-eyebrow">{pack.label}</p>
                            <p className="mt-4 text-xl font-semibold">{pack.credits.toLocaleString()} credits</p>
                            <p className="mt-1 text-sm text-muted-foreground">{pack.amounts[currency].toLocaleString()} {currency}</p>
                            <button
                                type="button"
                                onClick={() => void buy(pack.id)}
                                disabled={busy}
                                className="ff-button-primary mt-5 min-h-10 w-full px-3 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isLoading ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-3.5" aria-hidden="true" />}
                                {isLoading ? 'Opening checkout…' : 'Buy credits'}
                            </button>
                        </div>
                    );
                })}
            </div>

            <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <p>Payments are handled by the configured provider. FinalFrame only adds credits after a verified payment event.</p>
            </div>
        </div>
    );
}
