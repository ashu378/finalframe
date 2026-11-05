'use client';
import { useRef, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { previewSoundEffect, previewCharacterReference, queuePreparation } from '@/lib/production/preparation-actions';
import type { CharacterReferenceEstimateConsent } from '@/lib/ai/character-reference-estimate';
import type { PreparationKind } from '@/lib/ai/preparation';
import { transcriptAlignmentMessage } from '@/lib/ai/transcription';

export function PreparationPanel({ productionId, projectId, voices, assets, canEdit, referenceOnly = false, onPrepared }: {
  productionId: string;
  projectId: string;
  voices: Array<{ id: string; name: string; kind: string; status: string; state: string; sampleAssetIds: string[] }>;
  assets: Array<{ id: string; name: string; mimeType: string; state: string }>;
  canEdit: boolean;
  referenceOnly?: boolean;
  onPrepared?: (assetId: string) => void;
}) {
  const availability=useQuery(api.preparation.musicAvailability,{});
  const [kind, setKind] = useState<PreparationKind>(referenceOnly ? 'CHARACTER_REFERENCE' : 'NARRATION');
  const [text, setText] = useState('');
  const [voiceId, setVoice] = useState('');
  const [primaryVoiceSampleAssetId, setPrimarySample] = useState('');
  const selectedVoice = voices.find(voice => voice.id === voiceId);
  const clone = (kind === 'NARRATION' || kind === 'VOICE_PREVIEW') && selectedVoice?.kind === 'CLONED';
  const primarySamples = useQuery(api.voices.primarySamples, clone && voiceId ? { projectId: projectId as Id<'projects'>, voiceId: voiceId as Id<'voices'> } : 'skip');
  const [sourceAssetId, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sfxEstimate,setSfxEstimate]=useState<{requestHash:string;quoteFingerprint:string;expiresAt:number;maximumOriginalSeconds:120;baseProviderCeilingUsd:number;providerHoldUsd:number}>();
  const [sfxReviewed,setSfxReviewed]=useState(false);
  const [imageEstimate,setImageEstimate]=useState<CharacterReferenceEstimateConsent>();
  const [imageReviewed,setImageReviewed]=useState(false);
  const [jobId, setJob] = useState<string>();
  const submission = useRef<{ fingerprint: string; key: string } | null>(null);
  const state = useQuery(api.generationJobs.get, jobId ? { jobId: jobId as Id<'generationJobs'> } : 'skip');
  const job = state?.job;
  async function submit() {
    setBusy(true); setError('');
    try {
      if(kind==='CHARACTER_REFERENCE'&&(!imageReviewed||!imageEstimate||imageEstimate.expiresAt<Date.now())){setError('Review a fresh reference-image estimate before generating.');return;}
      if(kind==='SFX'&&(!sfxReviewed||!sfxEstimate||sfxEstimate.expiresAt<Date.now())){setError('Review a fresh sound-effect estimate before generating.');return;}
      const payload = { productionId, kind, text, ...(kind==='CHARACTER_REFERENCE'&&imageEstimate?{imageEstimateConsent:imageEstimate}:{}), ...(kind === 'NARRATION' || kind === 'VOICE_PREVIEW' ? { voiceId, ...(clone ? { primaryVoiceSampleAssetId } : {}) } : {}), ...(kind === 'TRANSCRIPT' ? { sourceAssetId } : {}), ...(kind==='SFX'&&sfxEstimate?{sfxEstimateConsent:{requestHash:sfxEstimate.requestHash,quoteFingerprint:sfxEstimate.quoteFingerprint,maximumProviderHoldUsd:sfxEstimate.providerHoldUsd}}:{}) };
      // Quote expiry changes authorization, never the identity of an uncertain image request.
      const fingerprint = JSON.stringify(kind === 'CHARACTER_REFERENCE' ? { ...payload, imageEstimateConsent: undefined } : payload);
      if (submission.current?.fingerprint !== fingerprint) submission.current = { fingerprint, key: `preparation:${crypto.randomUUID()}` };
      const result = await queuePreparation({ ...payload, idempotencyKey: submission.current.key });
      if (result.success) setJob(result.jobId); else { setError(result.error); if (kind==='CHARACTER_REFERENCE') { setImageEstimate(undefined); setImageReviewed(false); } }
    } finally { setBusy(false); }
  }
  async function estimateImage(){setBusy(true);setError('');setImageReviewed(false);try{const result=await previewCharacterReference({productionId,text});if(result.success)setImageEstimate(result.estimate);else{setImageEstimate(undefined);setError(result.error);}}finally{setBusy(false);}}
  async function estimateSound(){setBusy(true);setError('');setSfxReviewed(false);try{const result=await previewSoundEffect({productionId,text});if(result.success)setSfxEstimate(result.estimate);else{setSfxEstimate(undefined);setError(result.error);}}finally{setBusy(false);}}
  return <section className="space-y-4 rounded-2xl border border-white/15 bg-white/[0.03] p-5" aria-label={referenceOnly ? "Generate a character reference" : "Prepare project media"}>
    <div><h2 className="text-lg font-semibold">{referenceOnly ? 'Generate one original character reference' : 'Prepare project media'}</h2><p className="mt-1 text-sm text-muted-foreground">Create one reference image, prepare narration, or transcribe an uploaded recording. Each request uses the capped test budget and stays in this project.</p></div>
    {!referenceOnly && <label className="block text-sm">Preparation type<select value={kind} onChange={event => {setKind(event.target.value as PreparationKind);setSfxEstimate(undefined);setSfxReviewed(false);}} className="mt-1 block min-h-11 w-full rounded-lg border border-white/20 bg-background p-2"><option value="NARRATION">Narration</option><option value="VOICE_PREVIEW">Voice preview</option><option value="CHARACTER_REFERENCE">Reference image</option><option value="TRANSCRIPT">Transcribe recording</option><option value="MUSIC" disabled={!availability?.music}>Music clip · about 30 seconds{!availability?.music?' · unavailable':''}</option><option value="SFX" disabled={!availability?.sfx}>Sound effect{!availability?.sfx?' · unavailable':''}</option></select></label>}
    {kind === 'TRANSCRIPT' ? <label className="block text-sm">Project recording<select value={sourceAssetId} onChange={event => setSource(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/20 bg-background p-2"><option value="">Choose audio (up to 60 seconds)</option>{assets.filter(asset => asset.mimeType.startsWith('audio/')).map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label> : <label className="block text-sm">{kind === 'CHARACTER_REFERENCE' ? 'Describe the reference image' : kind==='MUSIC'?'Describe the music, mood and instruments':kind==='SFX'?'Describe the sound effect':'Words to speak'}<textarea value={text} maxLength={clone||kind==='SFX' ? 3000 : 4000} disabled={busy} onChange={event => {setText(event.target.value);setSfxEstimate(undefined);setSfxReviewed(false);setImageEstimate(undefined);setImageReviewed(false);}} rows={3} className="mt-1 block w-full rounded-lg border border-white/20 bg-background p-3" /></label>}
    {(kind === 'NARRATION' || kind === 'VOICE_PREVIEW') && <label className="block text-sm">Approved project voice<select value={voiceId} onChange={event => { setVoice(event.target.value); setPrimarySample(''); }} className="mt-1 block min-h-11 w-full rounded-lg border border-white/20 bg-background p-2"><option value="">Choose a voice</option>{voices.filter(voice => voice.status === 'READY' && ['APPROVED','LOCKED'].includes(voice.state) && voice.kind !== 'RECORDED').map(voice => <option key={voice.id} value={voice.id}>{voice.name} · {voice.kind}</option>)}</select><span className="mt-1 block text-xs text-muted-foreground">Cloned voices require current consent and approved reference recordings. Use original recordings directly in the timeline.</span></label>}
    {clone && <label className="block text-sm">Primary approved voice recording<select value={primaryVoiceSampleAssetId} onChange={event => setPrimarySample(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-white/20 bg-background p-2"><option value="">Choose one recording (up to 30 seconds)</option>{(primarySamples ?? []).map(asset => <option key={asset.assetId} value={asset.assetId}>{asset.name}</option>)}</select><span className="mt-1 block text-xs text-muted-foreground">This recording supplies the narration voice. Review its approval and consent before use.</span></label>}
    {kind==='CHARACTER_REFERENCE'&&<div className="space-y-3 text-sm"><p className="text-muted-foreground">Describe an original character, outfit, visible face and framing. The image is saved as a draft; review and approve it before creating the character. No image is generated until you confirm the estimate and click Generate.</p><Button type="button" onClick={estimateImage} disabled={!canEdit||busy||!text.trim()}>Review reference-image estimate</Button>{imageEstimate&&<><p>Maximum provider reservation ${imageEstimate.maximumProviderCostUsd.toFixed(4)} · estimate valid for 30 seconds. Actual charge is recorded when returned.</p><label className="flex items-start gap-3"><input type="checkbox" checked={imageReviewed} onChange={event=>setImageReviewed(event.target.checked)} className="mt-1"/>I reviewed this estimate and authorize one image request within this reservation.</label></>}</div>}
    {kind==='MUSIC'&&<p className="text-sm text-muted-foreground">Creates one new music clip of about 30 seconds for review. Actual duration is measured and may be shorter. Advertised provider price $0.04; provider reservation $0.052. Instrumental or vocal instructions are creative guidance, not exact timing or voice controls. An interrupted accepted stream may require operator reconciliation and will not be purchased again automatically.</p>}
    {kind==='SFX'&&<div className="space-y-3 text-sm"><p className="text-muted-foreground">Length is variable, up to 120 seconds. A length requested in the prompt is creative guidance. The result is measured and saved as a draft for review; choose a reviewed window before using a long result in an episode.</p><Button onClick={estimateSound} disabled={!canEdit||busy||!availability?.sfx||!text.trim()}>Review sound-effect estimate</Button>{sfxEstimate&&<><p>Provider base ceiling ${sfxEstimate.baseProviderCeilingUsd.toFixed(2)} · maximum reservation ${sfxEstimate.providerHoldUsd.toFixed(3)}. Actual charge is shown when reported.</p><label className="flex items-start gap-3"><input type="checkbox" checked={sfxReviewed} onChange={event=>setSfxReviewed(event.target.checked)} className="mt-1"/>I reviewed this estimate and authorize one sound-effect request within this reservation.</label></>}</div>}
    <Button onClick={submit} disabled={!canEdit || busy || kind==='CHARACTER_REFERENCE'&&(!imageEstimate||!imageReviewed)||kind==='SFX'&&(!availability?.sfx||!sfxEstimate||!sfxReviewed)||kind==='MUSIC'&&!availability?.music || (clone && (!primaryVoiceSampleAssetId || !primarySamples?.some(sample => sample.assetId === primaryVoiceSampleAssetId))) || (kind === 'TRANSCRIPT' ? !sourceAssetId : !text.trim()) || ((kind === 'NARRATION' || kind === 'VOICE_PREVIEW') && !voiceId)}>{busy ? 'Working…' : kind==='CHARACTER_REFERENCE'&&imageEstimate?`Generate reference image · reserve up to $${imageEstimate.maximumProviderCostUsd.toFixed(4)}`:kind==='SFX'&&sfxEstimate?`Generate sound effect · reserve up to $${sfxEstimate.providerHoldUsd.toFixed(3)}`:'Queue preparation'}</Button>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    {job && <div role="status" className="space-y-2 text-sm"><p>{job.status} · {Math.round(job.progress || 0)}% · {typeof job.estimatedProviderCostUsd === 'number' ? `Provider estimate $${job.estimatedProviderCostUsd.toFixed(4)}` : 'Provider estimate pending'}</p>{typeof job.providerCostUsd === 'number' && <p>Provider receipt ${job.providerCostUsd.toFixed(4)}</p>}{job.request.preparationKind==='SFX'&&typeof job.providerCostUsd!=='number'&&<p>Provider charge not yet reported.</p>}{job.errorMessage && <p>{job.errorMessage}</p>}{job.transcriptText && <p className="whitespace-pre-wrap">{job.transcriptText}</p>}{job.transcriptAlignmentStatus && <p>{transcriptAlignmentMessage(job.transcriptAlignmentStatus)}</p>}{typeof job.actualDurationSeconds === 'number' && <p>Actual {job.request.preparationKind==='SFX'?'sound-effect':'music'} duration {job.actualDurationSeconds.toFixed(3)} seconds{job.request.preparationKind==='SFX'?' · variable length':' · nominal 30 seconds'}. Review before use.</p>}{job.assetId && <><p>Prepared media is saved in the project library. Review it before use.</p>{referenceOnly && onPrepared && job.status==='COMPLETED' ? <Button type="button" variant="secondary" onClick={()=>onPrepared(String(job.assetId))}>Review this prepared image</Button> : null}</>}</div>}
  </section>;
}
