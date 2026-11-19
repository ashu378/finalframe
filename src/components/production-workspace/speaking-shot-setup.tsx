'use client';
import { useState } from 'react';
import { useAction, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { useRouter } from 'next/navigation';
import { assessSpeechFit } from '@/lib/production/ugc-brief';
import type { ShotControlView, ShotOperationControls, WorkspaceControlData } from '@/lib/production/workspace-controls';
import { Button } from '@/components/ui/button';
import { ApprovalControls, controlInput } from './resource-approval-controls';
import { PreparationPanel } from './preparation-panel';

export function SpeakingShotSetup({ data, shot, disabled, onSelect }: { data: WorkspaceControlData; shot: ShotControlView; disabled: boolean; onSelect: (controls: ShotOperationControls) => void }) {
  const router = useRouter();
  const measureAudio = useAction(api.audioCertificates.prepareSource), measurePortrait = useAction(api.imageCertificates.prepareSource);
  const fitRecording = useMutation(api.productions.fitTalkingShotToRecording);
  const [verifiedAudioId, setVerifiedAudioId] = useState('');
  const [measurement, setMeasurement] = useState(''), [measuring, setMeasuring] = useState(false);
  async function verifySavedInputs() {
    setMeasuring(true); setMeasurement(''); setVerifiedAudioId('');
    try { const args = { productionId: data.productionId as Id<'productions'>, shotId: shot.id as Id<'shots'> }; const audio = await measureAudio(args); await measurePortrait(args); setVerifiedAudioId(audio.assetId); setMeasurement(`Verified recording: ${audio.durationSeconds.toFixed(3)} seconds. Saved shot: ${shot.durationSeconds} seconds. ${Math.abs(audio.durationSeconds-shot.durationSeconds)<=1/30?'Timing matches.':'Change the draft shot length to the complete recording before approval.'}`); router.refresh(); }
    catch { setMeasurement('Verification could not finish. Save the lip-sync settings, approve both source assets and check that the media worker is available. No generation was purchased.'); }
    finally { setMeasuring(false); }
  }
  const [portraitId, setPortrait] = useState(''), [audioId, setAudio] = useState('');
  const portrait = data.assets.find(asset => asset.id === portraitId), audio = data.assets.find(asset => asset.id === audioId);
  const approved = (state?: string) => state === 'APPROVED' || state === 'LOCKED';
  return <details className="space-y-4 rounded-xl border border-border p-4">
    <summary className="min-h-11 cursor-pointer font-semibold">Make a character speak this recording</summary>
    <p className="text-sm leading-6 text-muted-foreground">A voiceover plays over pictures. Lip sync makes one pictured character speak the selected recording. Use a separate talking shot for each speaker; this does not transfer a group performance or animate every mouth in a group photo.</p>
    {shot.dialogueSegments?.map((line, index) => <p key={index} className="text-sm">Line {index + 1}: {assessSpeechFit(line.text, line.durationSeconds).message}</p>)}
    <details><summary className="min-h-11 cursor-pointer text-sm">1. Prepare speech if you do not have a recording</summary><PreparationPanel productionId={data.productionId} projectId={data.projectId} voices={data.voices} assets={data.assets} canEdit={!disabled} speechOnly initialText={shot.dialogueSegments?.map(line => line.text).join(' ') ?? ''} speakingSeconds={shot.durationSeconds} onPrepared={id => { setAudio(id); router.refresh(); }}/></details>
    <label className="block text-sm">2. Choose the portrait<select className={controlInput} disabled={disabled} value={portraitId} onChange={e => setPortrait(e.target.value)}><option value="">One person, with a clear visible mouth</option>{data.assets.filter(asset => ['image/png', 'image/jpeg'].includes(asset.mimeType)).map(asset => <option key={asset.id} value={asset.id}>{asset.name} · {asset.state.toLowerCase()}</option>)}</select></label>
    <label className="block text-sm">3. Choose the exact complete recording<select className={controlInput} disabled={disabled} value={audioId} onChange={e => setAudio(e.target.value)}><option value="">Choose spoken WAV or MP3 audio</option>{data.assets.filter(asset => ['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3'].includes(asset.mimeType)).map(asset => <option key={asset.id} value={asset.id}>{asset.name} · {asset.state.toLowerCase()}</option>)}</select></label>
    {audio?.url ? <audio controls preload="none" src={audio.url} aria-label="Review the complete selected speech" className="w-full"/> : null}
    {portrait ? <ApprovalControls data={data} resourceType="asset" resourceId={portrait.id} state={portrait.state}/> : null}
    {audio ? <ApprovalControls data={data} resourceType="asset" resourceId={audio.id} state={audio.state}/> : null}
    <p className="text-xs leading-5 text-muted-foreground">Review the selected portrait in the project library and listen to every word. The approved audio controls the talking-video length. Before approving the plan, match this shot to the measured recording. FinalFrame checks image/audio format, duration, permissions, route and price again before purchase.</p>
    <Button type="button" disabled={disabled || !approved(portrait?.state) || !approved(audio?.state)} onClick={() => onSelect({ operation: 'LIP_SYNC', audioPolicy: 'USE_RECORDING', referenceAssetIds: [portraitId, audioId], firstFrameAssetId: '', lastFrameAssetId: '', referenceBindings: [{ assetId: portraitId, alias: 'speaker', role: 'IDENTITY' }, { assetId: audioId, alias: 'speech', role: 'RECORDING' }] })}>Use these inputs for the talking shot</Button>
    {shot.operationControls.operation === 'LIP_SYNC' ? <Button type="button" variant="secondary" disabled={!data.canEdit || measuring} onClick={() => void verifySavedInputs()}>{measuring?'Checking saved inputs…':'Verify saved portrait and recording · no AI cost'}</Button> : null}
    {verifiedAudioId && !disabled ? <Button type="button" variant="secondary" disabled={measuring} onClick={async () => { setMeasuring(true); try { const result = await fitRecording({productionId:data.productionId as Id<'productions'>,shotId:shot.id as Id<'shots'>,expectedAudioAssetId:verifiedAudioId as Id<'assets'>}); setMeasurement(`Draft updated: talking shot ${result.shotSeconds.toFixed(3)} seconds; whole video ${result.productionSeconds.toFixed(3)} seconds. Review the new timing before approval.`); router.refresh(); } catch { setMeasurement('The draft could not be retimed. Review any dialogue windows or locks, and verify the saved recording again. Approved plans stay unchanged.'); } finally { setMeasuring(false); } }}>Match draft length to this complete recording</Button> : null}
    {measurement ? <p role="status" className="text-sm">{measurement}</p> : null}
    <p className="text-xs text-muted-foreground">This saves draft settings only. Approve the plan and review the generation estimate separately.</p>
  </details>;
}
