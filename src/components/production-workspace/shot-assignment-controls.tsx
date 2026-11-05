'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { bindShotResources } from '@/lib/production/workspace-actions';
import type { ShotControlView, WorkspaceControlData } from '@/lib/production/workspace-controls';
import { controlInput } from './resource-approval-controls';

export function ShotAssignmentControls({ data, shot, editable }: { data: WorkspaceControlData; shot: ShotControlView; editable: boolean }) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [selected, setSelected] = useState(shot.resourceVersionIds);
    const [bindings, setBindings] = useState(shot.resourceBindings || []);
    const [dialogue, setDialogue] = useState(shot.dialogueSegments || []);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState('');
    const candidates = data.boundResources.filter(resource => ['APPROVED', 'LOCKED'].includes(resource.state));
    const speakers = candidates.filter(resource => resource.kind === 'CHARACTER' && resource.voiceVersionId && bindings.some(binding => binding.resourceVersionId === resource.id && binding.voiceVersionId === resource.voiceVersionId));
    const unavailable = [...new Set([...selected, ...bindings.map(binding => binding.resourceVersionId)])].filter(id => !candidates.some(resource => resource.id === id));
    function save() {
        if (unavailable.length) { setSaved(''); setError('Remove unavailable references and their associated dialogue before saving this draft.'); return; }
        if (bindings.length > 32 || new Set(bindings.map(binding => binding.role)).size !== bindings.length || bindings.some(binding => !/^[A-Za-z][A-Za-z0-9_ -]{0,63}$/.test(binding.role))) { setSaved(''); setError('Use at most 32 distinct role names, each starting with a letter.'); return; }
        if (dialogue.some(segment => !segment.text.trim() || segment.text.length > 1000 || (segment.delivery?.length ?? 0) > 400 || !Number.isFinite(segment.startSeconds) || !Number.isFinite(segment.durationSeconds) || segment.startSeconds < 0 || segment.durationSeconds <= 0 || segment.startSeconds + segment.durationSeconds > shot.durationSeconds + 0.000001)) { setSaved(''); setError('Give every spoken line its exact words and a start and length that fit within this shot.'); return; }
        start(async () => {
            setError(''); setSaved('');
            try {
                const result = await bindShotResources({ projectExternalId: data.projectExternalId, productionId: data.productionId, shotId: shot.id, resourceVersionIds: selected, resourceBindings: bindings, dialogueSegments: dialogue });
                if (!result.success) setError(result.error || 'The assignments could not be saved.');
                else { setSaved('Cast, resource assignments and timed dialogue saved to this draft.'); router.refresh(); }
            } catch { setError('The assignments could not be saved. Review this draft and try again.'); }
        });
    }
    return <details className="rounded-xl border border-border p-4" open={editable}>
        <summary className="min-h-8 cursor-pointer text-sm font-semibold">Exact continuity references</summary>
        <div className="mt-3 space-y-4">
            {!candidates.length ? <p className="text-sm text-muted-foreground">This plan has no approved continuity resources. Create and approve project references and a bible, then include that bible in a new plan.</p> : null}
            {unavailable.map(id => { const resource = data.boundResources.find(item => item.id === id); const hasDependencies = dialogue.some(segment => segment.speakerResourceVersionId === id) || bindings.some(binding => binding.characterResourceVersionId === id); return <div key={id} className="space-y-2 rounded-lg border border-destructive/50 p-3"><p className="text-sm">{resource?.name || 'Saved reference'} needs approval or is no longer available.</p>{editable ? <><Button size="sm" variant="secondary" disabled={pending || hasDependencies} onClick={() => { setBindings(previous => previous.filter(binding => binding.resourceVersionId !== id)); setSelected(previous => previous.filter(value => value !== id)); }}>Remove unavailable reference</Button>{hasDependencies ? <p className="text-xs text-muted-foreground">Remove its dialogue and dependent assignments first.</p> : null}</> : null}</div>; })}
            {candidates.map(resource => {
                const binding = bindings.find(item => item.resourceVersionId === resource.id);
                const hasDialogue = dialogue.some(segment => segment.speakerResourceVersionId === resource.id);
                const assignedElsewhere = bindings.some(item => item.characterResourceVersionId === resource.id);
                return <div key={resource.id} className="space-y-3 rounded-lg border border-border p-3">
                    <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" disabled={!editable || pending || Boolean(binding)} checked={selected.includes(resource.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, resource.id] : previous.filter(id => id !== resource.id))} />{resource.name} · version {resource.versionNumber} · {resource.kind.toLowerCase()}</label>
                    {selected.includes(resource.id) && !binding && editable ? <Button size="sm" variant="secondary" disabled={pending} onClick={() => { let count = 1; let role = `${resource.kind.toLowerCase()}_${count}`; while (bindings.some(item => item.role === role)) role = `${resource.kind.toLowerCase()}_${++count}`; setBindings(previous => [...previous, { role, resourceVersionId: resource.id, ...(resource.kind === 'CHARACTER' && resource.voiceVersionId ? { voiceVersionId: resource.voiceVersionId } : {}) }]); }}>Assign this {resource.kind.toLowerCase()}</Button> : null}
                    {binding ? <div className="space-y-3 pl-6">
                        <label className="block text-sm">Role in this shot<input aria-label={`Role for ${resource.name}`} className={controlInput} disabled={!editable || pending} maxLength={64} pattern="[A-Za-z][A-Za-z0-9_ -]{0,63}" value={binding.role} onChange={event => setBindings(previous => previous.map(item => item.resourceVersionId === resource.id ? { ...item, role: event.target.value } : item))} /></label>
                        {resource.kind === 'CHARACTER' ? <p className="text-xs text-muted-foreground">{binding.voiceVersionId ? 'Uses the character’s approved voice configuration.' : 'No approved voice configuration. Add a voice in a new character version before planning spoken dialogue.'}</p> : ['COSTUME', 'PROP'].includes(resource.kind) ? <label className="block text-sm">Used by character<select aria-label={`Character using ${resource.name}`} className={controlInput} disabled={!editable || pending} value={binding.characterResourceVersionId || ''} onChange={event => setBindings(previous => previous.map(item => item.resourceVersionId === resource.id ? { ...item, characterResourceVersionId: event.target.value || undefined } : item))}><option value="">Scene-wide resource</option>{bindings.filter(item => candidates.find(candidate => candidate.id === item.resourceVersionId)?.kind === 'CHARACTER').map(character => <option key={character.resourceVersionId} value={character.resourceVersionId}>{candidates.find(item => item.id === character.resourceVersionId)?.name || 'Character needs review'}</option>)}</select></label> : <p className="text-xs text-muted-foreground">Applies to this shot’s setting or style.</p>}
                        {editable ? <><Button size="sm" variant="secondary" disabled={pending || hasDialogue || assignedElsewhere} onClick={() => setBindings(previous => previous.filter(item => item.resourceVersionId !== resource.id))}>Remove role assignment</Button>{hasDialogue || assignedElsewhere ? <p className="text-xs text-muted-foreground">Remove this character’s dialogue and other resource assignments first.</p> : null}</> : null}
                    </div> : null}
                </div>;
            })}
            <fieldset className="space-y-4"><legend className="text-sm font-semibold">Timed character dialogue</legend><p className="text-xs leading-5 text-muted-foreground">Each line uses an assigned character’s approved voice version. Plan times within this shot. Voice synthesis and lip sync are separate production stages with reviewed costs.</p>
                {dialogue.map((segment, index) => <div key={index} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
                    <label className="text-sm">Speaker<select aria-label={`Dialogue ${index + 1} speaker`} className={controlInput} disabled={!editable || pending} value={segment.speakerResourceVersionId} onChange={event => { const speaker = speakers.find(item => item.id === event.target.value); if (speaker) setDialogue(previous => previous.map((item, i) => i === index ? { ...item, speakerResourceVersionId: speaker.id, voiceVersionId: speaker.voiceVersionId! } : item)); }}><option value="" disabled>Choose an approved character voice</option>{!speakers.some(speaker => speaker.id === segment.speakerResourceVersionId) ? <option value={segment.speakerResourceVersionId} disabled>Saved speaker needs review</option> : null}{speakers.map(speaker => <option key={speaker.id} value={speaker.id}>{speaker.name} · approved voice</option>)}</select></label>
                    <label className="text-sm">Delivery<input aria-label={`Dialogue ${index + 1} delivery`} maxLength={400} className={controlInput} disabled={!editable || pending} value={segment.delivery || ''} onChange={event => setDialogue(previous => previous.map((item, i) => i === index ? { ...item, delivery: event.target.value } : item))} /></label>
                    <label className="text-sm">Start in seconds<input aria-label={`Dialogue ${index + 1} start`} type="number" min={0} max={shot.durationSeconds} step="0.01" className={controlInput} disabled={!editable || pending} value={segment.startSeconds} onChange={event => setDialogue(previous => previous.map((item, i) => i === index ? { ...item, startSeconds: Number(event.target.value) } : item))} /></label>
                    <label className="text-sm">Length in seconds<input aria-label={`Dialogue ${index + 1} length`} type="number" min={0.01} max={shot.durationSeconds} step="0.01" className={controlInput} disabled={!editable || pending} value={segment.durationSeconds} onChange={event => setDialogue(previous => previous.map((item, i) => i === index ? { ...item, durationSeconds: Number(event.target.value) } : item))} /></label>
                    <label className="text-sm sm:col-span-2">Spoken line<textarea aria-label={`Dialogue ${index + 1} text`} maxLength={1000} rows={2} className={controlInput} disabled={!editable || pending} value={segment.text} onChange={event => setDialogue(previous => previous.map((item, i) => i === index ? { ...item, text: event.target.value } : item))} /></label>
                    {editable ? <Button size="sm" variant="secondary" disabled={pending} onClick={() => setDialogue(previous => previous.filter((_, i) => i !== index))}>Remove dialogue {index + 1}</Button> : null}
                </div>)}
                {editable ? <Button size="sm" variant="secondary" disabled={pending || !speakers.length || dialogue.length >= 32} onClick={() => { const speaker = speakers[0]; setDialogue(previous => [...previous, { speakerResourceVersionId: speaker.id, voiceVersionId: speaker.voiceVersionId!, startSeconds: 0, durationSeconds: Math.min(4, shot.durationSeconds), text: '' }]); }}>Add spoken line</Button> : null}
            </fieldset>
            {editable ? <Button size="sm" disabled={pending} onClick={save}>{pending ? 'Saving assignments…' : 'Save shot bindings'}</Button> : null}
            {saved ? <p role="status" className="text-sm text-emerald-300">{saved}</p> : null}{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        </div>
    </details>;
}
