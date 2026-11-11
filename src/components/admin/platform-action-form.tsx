'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { changePlatformRecord } from '@/lib/platform-admin/actions';
import type { PlatformRole } from '@/lib/platform-admin/contracts';

type Action = Parameters<typeof changePlatformRecord>[0]['action'];
export function PlatformActionForm({ action, targetId, label }: { action: Action; targetId: string; label: string }) {
  const router = useRouter();
  const keys = useRef<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState('');
  const [failed, setFailed] = useState(false);
  function submit(data: FormData) {
    const input = { action, targetId, reason: String(data.get('reason') || ''), ...(action === 'ROLE' ? { role: String(data.get('role')) as PlatformRole, roleStatus: String(data.get('roleStatus')) as 'ACTIVE' | 'REVOKED' } : {}), ...(action === 'DECIDE_REPORT' ? { decision: String(data.get('decision')) as 'DISMISSED' | 'QUARANTINED' } : {}) };
    const fingerprint = JSON.stringify(input);
    keys.current[fingerprint] ||= crypto.randomUUID();
    start(async () => {
      setFeedback('');
      try {
        const result = await changePlatformRecord({ ...input, requestId: keys.current[fingerprint] });
        setFailed(!result.success); setFeedback(result.success ? 'Change recorded.' : result.error || 'The change could not be confirmed.');
        if (result.success) router.refresh();
      } catch {
        setFailed(true);
        setFeedback('This change was not confirmed. Check the current record before retrying the same decision.');
      }
    });
  }
  return <details className="rounded-xl border border-border p-3"><summary className="min-h-8 cursor-pointer text-sm font-semibold">{label}</summary><form action={submit} className="mt-3 grid gap-3">
    {action === 'ROLE' ? <><label className="text-sm">Platform role<select name="role" required defaultValue="" disabled={pending} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3"><option value="" disabled>Choose role</option><option value="SUPPORT">Support</option><option value="MODERATOR">Moderator</option><option value="ADMIN">Administrator</option></select></label><label className="text-sm">Access state<select name="roleStatus" required defaultValue="" disabled={pending} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3"><option value="" disabled>Choose state</option><option value="ACTIVE">Grant active role</option><option value="REVOKED">Revoke role</option></select></label></> : null}
    {action === 'DECIDE_REPORT' ? <label className="text-sm">Decision<select name="decision" required defaultValue="" disabled={pending} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3"><option value="" disabled>Choose decision</option><option value="DISMISSED">Dismiss report</option><option value="QUARANTINED">Restrict project and resolve report</option></select></label> : null}
    <label className="text-sm">Reason<textarea name="reason" minLength={3} maxLength={action === 'DECIDE_REPORT' || action === 'CLEAR_RESTRICTION' ? 2000 : 1000} required disabled={pending} rows={3} className="mt-2 w-full rounded-xl border border-border bg-background p-3" /></label>
    <p className="text-xs leading-5 text-muted-foreground">This decision is recorded in the platform audit trail. Project media and history are retained.</p><button disabled={pending} className="ff-button-primary min-h-11">{pending ? 'Recording…' : 'Confirm change'}</button>{feedback ? <p role={failed ? 'alert' : 'status'} className={`text-sm ${failed ? 'text-destructive' : 'text-muted-foreground'}`}>{feedback}</p> : null}
  </form></details>;
}
