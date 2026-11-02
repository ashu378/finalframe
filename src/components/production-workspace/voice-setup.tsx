'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { StockVoicePicker } from './stock-voice-picker';
import { ApprovalControls, controlInput } from './resource-approval-controls';
import { createWorkspaceVoice, grantWorkspaceVoiceConsent, revokeWorkspaceVoiceConsent } from '@/lib/production/workspace-actions';
import type { WorkspaceControlData } from '@/lib/production/workspace-controls';

export function VoiceSetup({ data }: { data: WorkspaceControlData }) {
    const router = useRouter(); const [pending, start] = useTransition(); const [error, setError] = useState('');
    const [name, setName] = useState(''); const [kind, setKind] = useState<'RECORDED' | 'CLONED'>('RECORDED'); const [sample, setSample] = useState('');
    return <section className="ff-card space-y-5 p-5 sm:p-7" aria-label="Project voices"><div><h2 className="text-xl font-semibold">Project voices</h2><p className="mt-2 text-sm text-muted-foreground">Use an original recording or an explicitly authorized reference voice. Saving a profile does not train a model or purchase generation.</p></div>
        {data.canEdit ? <StockVoicePicker projectExternalId={data.projectExternalId} /> : null}
        {data.canEdit ? <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); start(async () => { setError(''); try { const result = await createWorkspaceVoice({ projectExternalId: data.projectExternalId, kind, name, sampleAssetId: sample, requestId: crypto.randomUUID() }); if (!result.success) setError(result.error); else { setName(''); setSample(''); router.refresh(); } } catch { setError('The voice could not be saved. Please try again.'); } }); }}>
            <label className="text-sm font-medium">Voice name<input required maxLength={160} className={controlInput} value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label className="text-sm font-medium">How this voice is used<select className={controlInput} value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="RECORDED">Play my uploaded recording</option><option value="CLONED">Synthesize from an authorized reference</option></select></label>
            <label className="text-sm font-medium">Reference recording · maximum 15 MiB<select required className={controlInput} value={sample} onChange={(event) => setSample(event.target.value)}><option value="">Choose project audio</option>{data.assets.filter((asset) => asset.mimeType.startsWith('audio/')).map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
            <div className="self-end"><Button disabled={pending || !name.trim() || !sample}>Save voice profile</Button></div>
        </form> : null}
        <div className="space-y-4">{data.voices.map((voice) => <article key={voice.id} className="space-y-4 rounded-xl border border-border p-4"><div><h3 className="font-semibold">{voice.name}</h3><p className="mt-1 text-xs text-muted-foreground">{voice.kind === 'CLONED' ? 'Reference synthesis' : voice.kind === 'RECORDED' ? 'Original recording' : 'Provider stock voice'} · {voice.status.toLowerCase().replaceAll('_', ' ')} · {voice.kind === 'STOCK' ? 'provider preset' : data.canEdit ? `${voice.sampleCount} recordings` : 'recording details restricted'}</p></div>
            {voice.status === 'READY' ? <ApprovalControls data={data} resourceType="voice" resourceId={voice.id} state={voice.state} /> : voice.status !== 'REVOKED' && voice.status !== 'DELETED' ? <p className="text-sm text-muted-foreground">Add the recording and current consent before submitting this voice for approval.</p> : null}
            {voice.kind === 'CLONED' && data.canEdit && voice.status !== 'REVOKED' ? <ConsentForm key={`${voice.id}:${voice.hasConsent}`} data={data} voiceId={voice.id} hasConsent={voice.hasConsent} /> : null}
            {voice.status === 'REVOKED' ? <p className="text-sm text-muted-foreground">Future synthesis is blocked. Create a separate profile if new permission is obtained.</p> : null}
        </article>)}</div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </section>;
}

function ConsentForm({ data, voiceId, hasConsent }: { data: WorkspaceControlData; voiceId: string; hasConsent: boolean }) {
    const router = useRouter(); const [pending, start] = useTransition(); const [error, setError] = useState('');
    const [subjectType, setSubjectType] = useState<'SELF' | 'AUTHORIZED_SPEAKER'>('SELF'); const [speaker, setSpeaker] = useState(''); const [proof, setProof] = useState('');
    const [consent, setConsent] = useState(false); const [disclosure, setDisclosure] = useState(false); const [lipsync, setLipsync] = useState(false); const [reason, setReason] = useState('');
    return <form className="space-y-3 border-t border-border pt-4" onSubmit={(event) => { event.preventDefault(); start(async () => { setError(''); try {
        const result = hasConsent ? await revokeWorkspaceVoiceConsent({ projectExternalId: data.projectExternalId, voiceId, reason, requestId: crypto.randomUUID() }) : await grantWorkspaceVoiceConsent({ projectExternalId: data.projectExternalId, voiceId, subjectType, subjectDisplayName: speaker, proofAssetId: proof || undefined, lipsyncAllowed: lipsync, consentConfirmed: consent, disclosureAccepted: disclosure, requestId: crypto.randomUUID() });
        if (!result.success) setError(result.error); else router.refresh();
    } catch { setError('Voice consent could not be changed. Please try again.'); } }); }}>
        {hasConsent ? <><p className="text-sm text-muted-foreground">Consent is recorded for this project. Revocation prevents future voice synthesis, including queued work that has not been submitted.</p><label className="block text-sm font-medium">Reason for revocation<input required maxLength={2000} className={controlInput} value={reason} onChange={(event) => setReason(event.target.value)} /></label><Button variant="danger" disabled={pending || !reason.trim()}>Revoke future voice use</Button></> : <>
            <label className="block text-sm font-medium">Who is speaking?<select className={controlInput} value={subjectType} onChange={(event) => setSubjectType(event.target.value as typeof subjectType)}><option value="SELF">This is my own voice</option><option value="AUTHORIZED_SPEAKER">I am authorized by the speaker</option></select></label>
            {subjectType === 'AUTHORIZED_SPEAKER' ? <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Speaker name<input required maxLength={160} className={controlInput} value={speaker} onChange={(event) => setSpeaker(event.target.value)} /></label><label className="text-sm font-medium">Project-owned consent evidence<select required className={controlInput} value={proof} onChange={(event) => setProof(event.target.value)}><option value="">Choose the uploaded evidence</option>{data.assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label></div> : null}
            <label className="flex min-h-11 items-start gap-3 text-sm leading-6"><input type="checkbox" required className="mt-1" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>I own this voice or have the speaker’s explicit permission to create a voice reference and synthesize speech for this project.</span></label>
            <label className="flex min-h-11 items-start gap-3 text-sm leading-6"><input type="checkbox" required className="mt-1" checked={disclosure} onChange={(event) => setDisclosure(event.target.checked)} /><span>I agree that approved recordings and requested text may be processed by the configured external AI provider to produce this project’s voice output.</span></label>
            <label className="flex min-h-11 items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1" checked={lipsync} onChange={(event) => setLipsync(event.target.checked)} /><span>Also permit this voice to be used for avatar and lip-sync requests in this project.</span></label>
            <p className="text-xs text-muted-foreground">Consent version: finalframe-project-reference-voice-v1. No voice provider is contacted when permission is saved.</p><Button disabled={pending || !consent || !disclosure || (subjectType === 'AUTHORIZED_SPEAKER' && (!proof || !speaker.trim()))}>Record project voice consent</Button>
        </>}{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </form>;
}
