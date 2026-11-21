'use client';

import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { createCreditCheckout } from '@/lib/payments/actions';
import type { SupportedCurrency } from '@/lib/payments/types';

import { CREDIT_PACKS } from '@/lib/payments/config';
import { useQuery, useAction } from 'convex/react';
import { api } from '../../../convex/_generated/api';

type PurchaseState =
    | { kind: 'idle' }
    | { kind: 'redirecting'; packId: string }
    | { kind: 'unavailable' | 'failed'; message: string };

function isUnavailableMessage(message: string) {
    return /not enabled|not configured|not available|sandbox|BACHS_API_KEY/i.test(message);
}

export function CreditPacks({ balance, studioExternalId }: { balance: number; studioExternalId?: string }) {
    const sandbox = useQuery(api.paymentCheckoutState.status, studioExternalId ? { studioExternalId } : 'skip');
    const refund = useAction(api.bachsCheckout.refundSandbox);
    const submitting = useRef(false);
    const [currency, setCurrency] = useState<SupportedCurrency>('NGN');
    const [loading, setLoading] = useState<string | null>(null);
    const [purchaseState, setPurchaseState] = useState<PurchaseState>({ kind: 'idle' });

    async function buy(packId: string) {
        if (submitting.current) return;
        submitting.current = true;
        setLoading(packId);
        setPurchaseState({ kind: 'idle' });

        try {
            const slot = `ff-checkout:${studioExternalId}:${packId}:${currency}`;
            const key = sessionStorage.getItem(slot) || crypto.randomUUID();
            sessionStorage.setItem(slot, key);
            const result = await createCreditCheckout(packId, currency, key);
            if (!result.success || !result.checkoutUrl) {
                if (result.finished) sessionStorage.removeItem(slot);
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
            submitting.current = false;
            setLoading(null);
        }
    }

    const busy = loading !== null;

    return (
        <div className="space-y-5" aria-busy={busy}>
            <p className="rounded-xl border border-border p-4 text-sm" role="status">{sandbox?.enabled ? `Sandbox test mode — no real money. Test balance: ${sandbox.balance} credits. These credits cannot pay for video generation.` : sandbox?.environment === 'sandbox' ? `New sandbox checkouts are paused. Test balance: ${sandbox.balance} credits. Payment and refund confirmations continue.` : 'Live credit purchases are disabled. Sandbox testing is available only to authorized test accounts.'}</p>
            {sandbox?.purchases?.map((purchase) => <div key={purchase.id} className="rounded-xl border border-border p-4 text-sm"><p>{purchase.amount} {purchase.currency} — {purchase.status}{purchase.refundedCredits > 0 ? ' — Refunded' : purchase.refundStatus === 'PROCESSING' ? ' — Refund processing' : purchase.refundStatus === 'FAILED' ? ' — Refund failed' : ''}</p><p className="break-all text-xs text-muted-foreground">{purchase.reference}</p>{purchase.status === 'COMPLETED' && purchase.refundedCredits === 0 && purchase.refundStatus !== 'PROCESSING' && <button className="ff-button-secondary mt-2" onClick={async () => { try { await refund({ purchaseId: purchase.id }); toast.success('Test refund requested. Waiting for confirmation.'); } catch { toast.error('Test refund could not be confirmed. Retry safely.'); } }}>Refund test purchase</button>}</div>)}
            <div className="flex flex-col justify-between gap-4 rounded-[1.1rem] bg-card p-5 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
                        <WalletCards className="size-5" aria-hidden="true" />
                    </span>
                    <div>
                        <p className="text-xs text-muted-foreground">Available video credits</p>
                        <p className="mt-1 text-3xl font-semibold">{balance.toLocaleString()}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Sandbox purchases do not change this balance.</p>
                    </div>
                </div>
                <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
                    Currency
                    <select
                        aria-label="Purchase currency"
                        value={currency}
                        disabled={busy || !sandbox?.enabled}
                        onChange={(event) => {
                            setCurrency(event.target.value as SupportedCurrency);
                            setPurchaseState({ kind: 'idle' });
                        }}
                        className="h-11 rounded-xl border border-border bg-background px-3 text-base font-normal text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <option value="USD">USD</option>
                        <option value="NGN">NGN</option>
                    </select>
                </label>
            </div>

            {purchaseState.kind === 'redirecting' && (
                <div className="flex items-start gap-3 rounded-2xl border border-[#9be3c3]/60 bg-[#10221b] p-4 text-sm" role="status" aria-live="polite">
                    <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-[hsl(var(--success))]" aria-hidden="true" />
                    <div>
                        <p className="font-semibold">Opening secure checkout…</p>
                        <p className="mt-1 text-muted-foreground">Do not close this tab. Credits will appear after the payment provider confirms the purchase.</p>
                    </div>
                </div>
            )}

            {(purchaseState.kind === 'unavailable' || purchaseState.kind === 'failed') && (
                <div className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${purchaseState.kind === 'unavailable' ? 'border-border bg-secondary/45' : 'border-[#ff9e9e]/45 bg-[#26171a]'}`} role="alert" aria-live="assertive">
                    <AlertTriangle className={`mt-0.5 size-4 shrink-0 ${purchaseState.kind === 'unavailable' ? 'text-muted-foreground' : 'text-[#ff9e9e]'}`} aria-hidden="true" />
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
                        <div key={pack.id} className={`rounded-[1.1rem] border p-5 ${index === 1 ? 'border-primary bg-card' : 'border-border bg-card'}`}>
                            <p className="ff-eyebrow">{pack.label}</p>
                            <p className="mt-4 text-xl font-semibold">{pack.credits.toLocaleString()} credits</p>
                            <p className="mt-1 text-sm text-muted-foreground">{pack.amounts[currency].toLocaleString()} {currency}</p>
                            <button
                                type="button"
                                onClick={() => void buy(pack.id)}
                                disabled={busy || !sandbox?.enabled}
                                className="ff-button-primary mt-5 min-h-11 w-full px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isLoading ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-3.5" aria-hidden="true" />}
                                {isLoading ? 'Opening checkout…' : 'Test checkout'}
                            </button>
                        </div>
                    );
                })}
            </div>

            <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <p>Test purchases and refunds use simulated money. Provider processing fees are shown at checkout; the refund test returns the credit-pack purchase amount.</p>
            </div>
        </div>
    );
}
