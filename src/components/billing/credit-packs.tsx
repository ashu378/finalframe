'use client';

import { useState } from 'react';
import { Loader2, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import { createCreditCheckout } from '@/lib/payments/actions';
import { CREDIT_PACKS } from '@/lib/payments/config';
import type { SupportedCurrency } from '@/lib/payments/types';

export function CreditPacks({ balance }: { balance: number }) {
  const [currency, setCurrency] = useState<SupportedCurrency>('XAF');
  const [loading, setLoading] = useState<string | null>(null);
  async function buy(packId: string) { setLoading(packId); try { const result = await createCreditCheckout(packId, currency); if (!result.success || !result.checkoutUrl) throw new Error(result.error || 'Unable to create checkout'); window.location.href = result.checkoutUrl; } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to create checkout'); setLoading(null); } }
  return <div className="space-y-5"><div className="flex flex-col justify-between gap-4 rounded-[1.1rem] bg-[#f4ead6] p-5 sm:flex-row sm:items-center"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#f6dfb1]"><WalletCards className="size-5" /></span><div><p className="text-xs text-muted-foreground">Available credits</p><p className="mt-1 text-3xl font-semibold">{balance}</p></div></div><select aria-label="Currency" value={currency} onChange={(event) => setCurrency(event.target.value as SupportedCurrency)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm"><option value="XAF">XAF / FCFA</option><option value="XOF">XOF / FCFA</option><option value="NGN">NGN</option></select></div><div className="grid gap-3 md:grid-cols-3">{CREDIT_PACKS.map((pack, index) => <div key={pack.id} className={`rounded-[1.1rem] border p-5 ${index === 1 ? 'border-primary bg-[#fff8e9]' : 'border-border bg-card'}`}><p className="ff-eyebrow">{pack.label}</p><p className="mt-4 text-xl font-semibold">{pack.credits} credits</p><p className="mt-1 text-sm text-muted-foreground">{pack.amounts[currency].toLocaleString()} {currency}</p><button onClick={() => buy(pack.id)} disabled={loading !== null} className="ff-button-primary mt-5 min-h-10 w-full px-3 text-xs">{loading === pack.id && <Loader2 className="size-3.5 animate-spin" />} Buy credits</button></div>)}</div></div>;
}
