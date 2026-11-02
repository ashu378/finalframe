'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { submitModerationReport } from '@/lib/platform-admin/actions';

export function ModerationReportForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const keys = useRef<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState('');
  const [failed, setFailed] = useState(false);
  function submit(data: FormData) {
    const input = { projectId, category: String(data.get('category')) as 'CONSENT' | 'RIGHTS' | 'HARMFUL_CONTENT' | 'OTHER', reason: String(data.get('reason') || '') };
    const fingerprint = JSON.stringify(input); keys.current[fingerprint] ||= crypto.randomUUID();
    start(async () => {
      const result = await submitModerationReport({ ...input, requestId: keys.current[fingerprint] });
      setFailed(!result.success); setFeedback(result.success ? 'Report submitted. You can follow its status in Your content reports.' : result.error || 'The report could not be submitted.');
      if (result.success) router.refresh();
    });
  }
  return <form action={submit} className="ff-card space-y-5 p-6"><label className="block text-sm font-semibold">Concern<select name="category" required defaultValue="" disabled={pending} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3"><option value="" disabled>Choose a concern</option><option value="CONSENT">Identity or consent</option><option value="RIGHTS">Media or intellectual property rights</option><option value="HARMFUL_CONTENT">Harmful content</option><option value="OTHER">Another concern</option></select></label><label className="block text-sm font-semibold">What should the reviewer know?<textarea name="reason" required minLength={3} maxLength={2000} rows={6} disabled={pending} className="mt-2 w-full rounded-xl border border-border bg-background p-3 font-normal" /></label><p className="text-sm leading-6 text-muted-foreground">Your report is shared with authorized platform moderators. Include enough detail to locate the concern; keep passwords and account credentials out of the report.</p><button disabled={pending} className="ff-button-primary min-h-11">{pending ? 'Submitting…' : 'Submit content report'}</button>{feedback ? <p role={failed ? 'alert' : 'status'} className={`text-sm ${failed ? 'text-destructive' : 'text-muted-foreground'}`}>{feedback}</p> : null}</form>;
}
