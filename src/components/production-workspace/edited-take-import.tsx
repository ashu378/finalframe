'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { ShotControlView, WorkspaceControlData } from '@/lib/production/workspace-controls';
import { Button } from '@/components/ui/button';
import { controlInput } from './resource-approval-controls';

export function EditedTakeImport({ data, shot }: { data: WorkspaceControlData; shot: ShotControlView }) {
    const router = useRouter();
    const importTake = useMutation(api.scenes.importEditedTake);
    const [assetId, setAssetId] = useState('');
    const [note, setNote] = useState('');
    const [pending, setPending] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    if (!data.canEdit || data.versionState !== 'APPROVED' || !['DRAFT', 'REVISION_REQUESTED'].includes(shot.state)) return null;
    const choices = data.assets.filter(asset => asset.mimeType.startsWith('video/') && ['APPROVED', 'LOCKED'].includes(asset.state));
    const mediaHref = `/dashboard/projects/${encodeURIComponent(data.projectExternalId)}/workspace/media?production=${encodeURIComponent(data.productionId)}`;

    async function submit() {
        if (pending || !assetId || !note.trim()) return;
        setPending(true);
        setMessage('');
        setError('');
        try {
            const take = await importTake({
                shotId: shot.id as Id<'shots'>,
                assetId: assetId as Id<'assets'>,
                idempotencyKey: `edited-video:${assetId}`,
                note: note.trim(),
            });
            if (!take) throw new Error('The take could not be confirmed.');
            setMessage(`Take ${take.versionNumber} is saved. Open Saved takes to preview it and review its actions.`);
            setAssetId('');
            setNote('');
            router.refresh();
        } catch {
            setError('Could not import this edit. Check the scene and shot are editable, and that this exact video is approved in this project. If you already imported it, check Saved takes.');
        } finally {
            setPending(false);
        }
    }

    return <details className="space-y-3 rounded-xl border border-border p-4">
        <summary className="min-h-11 cursor-pointer text-sm font-semibold">Use an edited video as a take</summary>
        <p className="text-sm text-muted-foreground">Upload your edited video to project media and approve it, then add it here for shot review. This uses zero AI credits.</p>
        <Link href={mediaHref} className="inline-flex min-h-11 items-center text-sm underline">Open project media</Link>
        {choices.length > 0 && <div className="space-y-3">
            <label className="block text-sm">Edited project video
                <select className={controlInput} value={assetId} disabled={pending} onChange={event => { setAssetId(event.target.value); setError(''); setMessage(''); }}>
                    <option value="">Choose an approved video</option>
                    {choices.map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
                </select>
            </label>
            <label className="block text-sm">What did you change?
                <textarea className={controlInput} maxLength={2000} value={note} disabled={pending} onChange={event => setNote(event.target.value)} />
            </label>
            <Button size="sm" variant="secondary" type="button" disabled={pending || !assetId || !note.trim()} onClick={() => void submit()}>{pending ? 'Saving take…' : 'Add for shot review'}</Button>
        </div>}
        {message && <p role="status" className="text-sm">{message}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </details>;
}
