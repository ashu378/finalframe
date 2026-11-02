'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { recoverDeactivatedAccount } from '@/lib/account-lifecycle/actions';

export function AccountRecoveryForm({ requestId }: { requestId: string }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [feedback, setFeedback] = useState('');
  return <form className="mt-5 space-y-4" action={(data) => start(async () => { try { const result = await recoverDeactivatedAccount(requestId, String(data.get('reason') || '')); if (result.success) router.refresh(); else setFeedback(result.error); } catch { setFeedback('Recovery was not confirmed. Retry the same request after checking its current state.'); } })}><label className="block text-sm font-semibold">Recovery review reason<textarea name="reason" required minLength={3} maxLength={1000} rows={3} disabled={pending} className="mt-2 w-full rounded-xl border border-border bg-background p-3 font-normal" /></label><p className="text-xs leading-6 text-muted-foreground">Confirm the account owner’s recovery request through your support process. Recovery re-enables access, retains all history and records your decision in the platform audit.</p><button disabled={pending} className="ff-button-primary min-h-11">Cancel request and restore account access</button>{feedback ? <p role="alert" className="text-sm text-destructive">{feedback}</p> : null}</form>;
}
