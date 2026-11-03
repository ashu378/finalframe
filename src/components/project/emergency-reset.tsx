'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { getFinishingProductions, getFinishingRecovery, retryFinishingJob } from '@/lib/render/actions';
import type { FinishingRecoverySnapshot, FinishingProductionPage } from '@/lib/render/recovery';

/** Export name retained for existing project routes; actions are exact-job retries. */
export function EmergencyReset({ projectId }: { projectId: string }) {
    const [snapshot, setSnapshot] = useState<FinishingRecoverySnapshot | null>(null);
    const [choices, setChoices] = useState<FinishingProductionPage | null>(null);
    const [choiceCursor, setChoiceCursor] = useState<string | null>(null);
    const [productionId, setProductionId] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    async function readChoices(cursor: string | null) {
        setSnapshot(null); setProductionId('');
        const result=await getFinishingProductions(projectId,cursor);
        if(!result.success||!result.choices){setChoices(null);setError(result.error||'Videos and episodes could not be loaded.');return '';}
        setChoices(result.choices);setChoiceCursor(cursor);
        const only=cursor===null&&result.choices.isDone&&result.choices.page.length===1?result.choices.page[0].id:'';
        setProductionId(only);return only;
    }
    async function choicesPage(cursor: string | null) {
        setBusy('choices');setError('');setNotice('');
        try{await readChoices(cursor);}catch{setChoices(null);setError('Videos and episodes could not be loaded.');}finally{setBusy(null);}
    }
    async function refresh() {
        setBusy('refresh'); setError(''); setNotice('');
        try {
            let selected=productionId;
            if(!choices){selected=await readChoices(null);if(!selected)return;}
            if(!selected){setError('Choose a video or episode before checking finishing jobs.');return;}
            const result = await getFinishingRecovery(projectId,selected);
            if (result.success && result.snapshot) setSnapshot(result.snapshot);
            else { setSnapshot(null); setError(result.error || 'Finishing jobs could not be loaded.'); }
        } catch { setSnapshot(null); setError('Finishing jobs could not be loaded. Try checking again.'); }
        finally { setBusy(null); }
    }
    async function retry(jobId: string) {
        setBusy(jobId); setError(''); setNotice('');
        try {
            const result = await retryFinishingJob(projectId, jobId,productionId);
            if (result.success && result.retried === 1) setNotice(`Finishing retry queued for job ${jobId}.`);
            else setError(result.error || 'No finishing retry was queued. Check the current job status.');
            // Read after the deliberate action; visiting this panel never queues work.
            const current = await getFinishingRecovery(projectId,productionId);
            if (current.success && current.snapshot) setSnapshot(current.snapshot);
            else setSnapshot(null);
        } catch { setSnapshot(null); setError('The retry could not be confirmed. Check the job status before trying again.'); }
        finally { setBusy(null); }
    }
    return <section id="finishing-jobs" aria-label="Finishing jobs" className="mt-8 space-y-4 border-t border-zinc-800 pt-8">
        <div><h3 className="text-lg font-semibold text-zinc-100">Finishing jobs</h3><p className="mt-2 text-sm text-zinc-400">Check individual export jobs and retry an eligible failed finishing step. Jobs waiting for completion or recovery show their current status.</p></div>
        {choices ? <div className="space-y-3">
            <label className="grid gap-2 text-sm text-zinc-300">Video / episode<select aria-label="Video or episode for finishing status" value={productionId} disabled={busy!==null} onChange={event=>{setProductionId(event.target.value);setSnapshot(null);setError('');setNotice('');}} className="w-full rounded border border-zinc-700 bg-zinc-950 p-3 text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><option value="">Choose a video or episode</option>{choices.page.map(choice=><option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label>
            {!choices.page.length ? <p className="text-sm text-zinc-400">No videos or episodes on this page.</p> : null}
            <div className="flex flex-wrap gap-3">{choiceCursor!==null ? <Button type="button" variant="secondary" disabled={busy!==null} onClick={()=>choicesPage(null)}>First video page</Button> : null}{!choices.isDone ? <Button type="button" variant="secondary" disabled={busy!==null} onClick={()=>choicesPage(choices.continueCursor)}>Next video page</Button> : null}</div>
        </div> : null}
        <Button type="button" variant="secondary" disabled={busy !== null} onClick={refresh}>{busy === 'refresh' ? 'Checking finishing jobs…' : snapshot ? 'Refresh finishing status' : 'Check finishing jobs'}</Button>
        {error ? <p role="alert" className="text-sm text-red-400">{error}</p> : null}
        {notice ? <p role="status" className="text-sm text-emerald-400">{notice}</p> : null}
        {snapshot ? <div className="space-y-3">
            {!snapshot.jobs.length ? <p className="text-sm text-zinc-400">No finishing jobs are available for this video.</p> : null}
            {snapshot.jobs.map(job => <article key={job.id} aria-label={`Finishing job ${job.id}`} className="space-y-2 rounded border border-zinc-700 p-4">
                <p className="break-all text-sm text-zinc-100">Job {job.id}</p>
                <p className="text-sm text-zinc-300">{job.status} · {Math.round(job.progress)}% · {job.preset}{job.stage ? ` · ${job.stage}` : ''}</p>
                {job.error ? <p className="text-sm text-zinc-400">{job.error}</p> : null}
                {job.retryReason ? <p className="text-sm text-zinc-400">{job.retryReason}</p> : null}
                <Button type="button" variant="secondary" disabled={busy !== null || !job.canRetry || !productionId} onClick={() => retry(job.id)} aria-label={`Retry finishing job ${job.id}`}>{busy === job.id ? 'Queueing finishing retry…' : 'Retry this finishing job'}</Button>
            </article>)}
            {snapshot.hasMore ? <p className="text-sm text-zinc-400">Showing up to 100 recent finishing jobs for this video.</p> : null}
        </div> : null}
    </section>;
}
