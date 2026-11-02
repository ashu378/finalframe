'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { changeWorkspaceApproval } from '@/lib/production/workspace-actions';
import type { WorkspaceControlData, WorkspaceResourceState } from '@/lib/production/workspace-controls';

export const controlInput = 'mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm';
const label = (text: string) => text.replaceAll('_', ' ').toLowerCase();

export function ApprovalControls({ data, resourceType, resourceId, state }: { data: WorkspaceControlData; resourceType: 'projectResourceVersion' | 'continuityBible' | 'shotVersion' | 'timeline' | 'voice' | 'asset'; resourceId: string; state: WorkspaceResourceState }) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [error, setError] = useState('');
    const [reason, setReason] = useState('');
    const canReview = data.canEdit || data.role === 'REVIEWER';
    function change(operation: 'REVIEW' | 'APPROVE' | 'LOCK' | 'REVISION' | 'UNLOCK') {
        start(async () => {
            setError('');
            const result = await changeWorkspaceApproval({ projectExternalId: data.projectExternalId, resourceType, resourceId, operation, note: reason });
            if (!result.success) setError(result.error); else router.refresh();
        });
    }
    return <div className="space-y-3"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-secondary px-3 py-1 text-xs capitalize">{label(state)}</span>
        {data.canEdit && (state === 'DRAFT' || state === 'REVISION_REQUESTED') ? <Button size="sm" variant="secondary" disabled={pending} onClick={() => change('REVIEW')}>Submit for review</Button> : null}
        {canReview && state === 'IN_REVIEW' ? <Button size="sm" disabled={pending} onClick={() => change('APPROVE')}>Approve</Button> : null}
        {data.canEdit && state === 'APPROVED' ? <Button size="sm" variant="secondary" disabled={pending} onClick={() => change('LOCK')}>Lock version</Button> : null}
    </div>{canReview && (state === 'IN_REVIEW' || state === 'APPROVED' || (state === 'LOCKED' && data.role === 'OWNER')) ? <div className="flex flex-col gap-2 sm:flex-row"><input aria-label="Revision or unlock reason" placeholder="Reason for this change" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} className={controlInput} /><Button size="sm" variant="secondary" disabled={pending || !reason.trim()} onClick={() => change(state === 'LOCKED' ? 'UNLOCK' : 'REVISION')}>{state === 'LOCKED' ? 'Unlock with reason' : 'Request revision'}</Button></div> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>;
}
