'use client';
import Image from 'next/image';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { UploadButton } from '@/components/assets/upload-button';
import { createGuidedBible, createGuidedCharacter } from '@/lib/production/character-setup-actions';
import type { WorkspaceControlData } from '@/lib/production/workspace-controls';
import { ApprovalControls, controlInput } from './resource-approval-controls';
import { PreparationPanel } from './preparation-panel';
const suggestionsRef = makeFunctionReference<'query', {projectId:Id<'projects'>;productionId:Id<'productions'>}, Array<{name:string;description:string}>>('characterSetup:suggestions');
const approved = (state?: string) => state === 'APPROVED' || state === 'LOCKED';
function useRequestKey() { const request = useRef<{ fingerprint: string; key: string } | null>(null); return (input: unknown) => { const fingerprint = JSON.stringify(input); if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, key: crypto.randomUUID() }; return request.current.key; }; }

/** Explicit beginner steps alongside the independent professional editor.
 * Rendering or visiting this panel never writes, approves or purchases media. */
export function GuidedCharacterSetup({ data }: { data: WorkspaceControlData }) {
  const router = useRouter();
  const suggestions = useQuery(suggestionsRef,data.canEdit?{projectId:data.projectId as Id<'projects'>,productionId:data.productionId as Id<'productions'>}:'skip');
  const [mode, setMode] = useState<'UPLOAD' | 'GENERATE'>('UPLOAD');
  const [imageId, setImageId] = useState('');
  const [name, setName] = useState(''), [description, setDescription] = useState(''), [voiceId, setVoiceId] = useState('');
  const [characterId, setCharacterId] = useState('');
  const [sourceBibleId, setSourceBibleId] = useState(''), [rules, setRules] = useState(''), [story, setStory] = useState(''), [style, setStyle] = useState('');
  const [createdBible, setCreatedBible] = useState<{ bibleId: string; versionNumber: number }>();
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  const inFlight = useRef(false), characterKey = useRequestKey(), bibleKey = useRequestKey();
  const images = data.assets.filter(asset => ['image/png', 'image/jpeg', 'image/webp'].includes(asset.mimeType));
  const image = images.find(asset => asset.id === imageId), voice = data.voices.find(item => item.id === voiceId);
  const characters = data.resources.filter(resource => resource.kind === 'CHARACTER');
  const character = characters.find(item => item.id === characterId);
  const bible = data.bibles.find(item => item.id === createdBible?.bibleId);
  async function saveCharacter() {
    if (inFlight.current) return; inFlight.current = true; setPending(true); setError('');
    try {
      const input = { projectId: data.projectId, productionId: data.productionId, projectExternalId: data.projectExternalId, name, description, imageAssetId: imageId, ...(voiceId ? { voiceId, ...(voice?.voiceVersionId ? { voiceVersionId: voice.voiceVersionId } : {}) } : {}) };
      const saved = await createGuidedCharacter({ ...input, idempotencyKey: characterKey(input) });
      if (!saved.success) setError(saved.error); else { setCharacterId(saved.resourceVersionId); setCreatedBible(undefined); router.refresh(); }
    } catch { setError('The character could not be saved. Refresh its current project references before trying again.'); }
    finally { inFlight.current = false; setPending(false); }
  }
  async function saveBible() {
    if (inFlight.current) return; inFlight.current = true; setPending(true); setError('');
    try {
      const input = { projectId: data.projectId, productionId: data.productionId, projectExternalId: data.projectExternalId, characterVersionId: characterId, ...(sourceBibleId ? { sourceBibleId } : {}), rules: rules.split('\n').map(line => line.trim()).filter(Boolean), story, visualStyle: style };
      const saved = await createGuidedBible({ ...input, idempotencyKey: bibleKey(input) });
      if (!saved.success) setError(saved.error); else { setCreatedBible(saved); router.refresh(); }
    } catch { setError('The bible draft could not be saved. Review the selected approved character and references.'); }
    finally { inFlight.current = false; setPending(false); }
  }
  return <section aria-label="Guided recurring character setup" className="ff-card space-y-6 p-5 sm:p-7">
    <div><h2 className="text-xl font-semibold">Set up a recurring character</h2><p className="mt-2 text-sm text-muted-foreground">Follow these steps once, then deliberately choose this character’s approved bible when planning another scene or episode. Each character belongs only to this project.</p></div>
    <section className="space-y-4" aria-label="Choose a character reference"><h3 className="font-semibold">1. Bring or create the character’s image</h3><div className="flex flex-wrap gap-3"><Button type="button" variant={mode === 'UPLOAD' ? 'primary' : 'secondary'} onClick={() => setMode('UPLOAD')}>Upload or choose an image</Button><Button type="button" variant={mode === 'GENERATE' ? 'primary' : 'secondary'} onClick={() => setMode('GENERATE')}>Generate an original image</Button></div>
      {mode === 'GENERATE' ? <PreparationPanel referenceOnly productionId={data.productionId} projectId={data.projectId} voices={data.voices} assets={data.assets} canEdit={data.canEdit} onPrepared={assetId => { setImageId(assetId); setMode('UPLOAD'); router.refresh(); }} /> : <><p className="text-sm text-muted-foreground">Use your own or consented image with a clear face and visible mouth. Uploading does not approve it.</p>{data.canEdit ? <UploadButton studioId={data.studioExternalId} projectExternalId={data.projectExternalId} /> : null}</>}
      <label className="block text-sm font-medium">Project character image<select className={controlInput} value={imageId} disabled={pending || !data.canEdit} onChange={event => setImageId(event.target.value)}><option value="">Choose an image deliberately</option>{images.map(asset => <option key={asset.id} value={asset.id}>{asset.name} · {asset.state.toLowerCase()}</option>)}</select></label>
    </section>
    <section className="space-y-4" aria-label="Review the character image"><h3 className="font-semibold">2. Review and approve the image</h3>{image ? <><p className="text-sm">{image.name}</p>{image.url ? <Image src={image.url} alt={`Project character reference: ${image.name}`} width={640} height={640} unoptimized className="max-h-80 w-full rounded-xl object-contain" /> : <p className="text-sm text-muted-foreground">The stored preview is unavailable. Check the project library.</p>}<p className="text-sm text-muted-foreground">Check identity, outfit, face and usage rights before approving.</p><ApprovalControls data={data} resourceType="asset" resourceId={image.id} state={image.state} /></> : <p className="text-sm text-muted-foreground">Choose a project image above to review it here.</p>}</section>
    <section className="space-y-4" aria-label="Save stable character"><h3 className="font-semibold">3. Save a stable character and review its version</h3><p className="text-sm text-muted-foreground">The saved character gets its own stable identity. An optional approved voice is frozen to an exact version; no default voice is applied. Recorded voices retain their recordings and cannot speak new words.</p>
      {suggestions?.length ? <label className="block text-sm">Optional character proposed by this production plan<select className={controlInput} value="" disabled={pending || !data.canEdit} onChange={event => { if (event.target.value === '') return; const suggestion = suggestions[Number(event.target.value)]; if (suggestion) { setName(suggestion.name); setDescription(suggestion.description); } }}><option value="">Choose only if you want to use a proposal</option>{suggestions.map((item,index)=><option key={index} value={index}>{item.name}</option>)}</select><span className="mt-1 block text-xs text-muted-foreground">This fills editable notes only. It does not create a character, image or approval.</span></label> : null}
      <label className="block text-sm">Character name<input className={controlInput} value={name} maxLength={160} disabled={pending || !data.canEdit} onChange={event => setName(event.target.value)} /></label>
      <label className="block text-sm">Appearance, outfit and continuity notes<textarea className={controlInput} value={description} rows={3} maxLength={10000} disabled={pending || !data.canEdit} onChange={event => setDescription(event.target.value)} /></label>
      <label className="block text-sm">Optional approved project voice<select className={controlInput} value={voiceId} disabled={pending || !data.canEdit} onChange={event => setVoiceId(event.target.value)}><option value="">No voice assigned</option>{data.voices.filter(item => item.status === 'READY' && approved(item.state)).map(item => <option key={item.id} value={item.id}>{item.name} · {item.kind.toLowerCase()}{item.voiceVersionId ? ' · frozen version' : ' · freeze on save'}</option>)}</select></label>
      <Button type="button" disabled={!data.canEdit || pending || !approved(image?.state) || !name.trim() || !description.trim()} onClick={() => void saveCharacter()}>{pending ? 'Saving…' : 'Save character draft'}</Button>
      <label className="block text-sm">Review a saved character version<select className={controlInput} value={characterId} onChange={event => { setCharacterId(event.target.value); setCreatedBible(undefined); }}><option value="">Choose a saved character</option>{characters.map(item => <option key={item.id} value={item.id}>{item.name} · v{item.versionNumber} · {item.state.toLowerCase()}</option>)}</select></label>
      {character ? <div className="space-y-3 rounded-xl border border-border p-4"><p className="font-medium">{character.name} · version {character.versionNumber}</p><p className="whitespace-pre-wrap text-sm text-muted-foreground">{String(character.profile.description ?? '')}</p><p className="break-all text-xs text-muted-foreground">Stable character ID: {character.resourceId}{character.voiceVersionId ? ` · voice version ${character.voiceVersionId}` : ' · no frozen voice assigned'}</p><ApprovalControls data={data} resourceType="projectResourceVersion" resourceId={character.id} state={character.state} /></div> : null}
    </section>
    <section className="space-y-4" aria-label="Create a continuity bible snapshot"><h3 className="font-semibold">4. Create and review a new continuity-bible draft</h3><p className="text-sm text-muted-foreground">Approve the character first. Saving creates a separate draft snapshot; earlier approved bibles and plans stay unchanged.</p>
      <label className="block text-sm">Optional approved bible to extend<select className={controlInput} value={sourceBibleId} disabled={pending || !data.canEdit} onChange={event => setSourceBibleId(event.target.value)}><option value="">Start a new independent bible</option>{data.bibles.filter(item => approved(item.state)).map(item => <option key={item.id} value={item.id}>Bible v{item.versionNumber} · {item.snapshot.resourceBindings.length} reference versions, {item.snapshot.rules.length} retained rules</option>)}</select></label><p className="text-xs text-muted-foreground">An explicitly selected source keeps its other references and rules. This character’s selected version replaces only its own binding. Leave story or style blank to retain that source’s text.</p>
      <label className="block text-sm">Story world<textarea className={controlInput} value={story} rows={2} maxLength={10000} disabled={pending || !data.canEdit} onChange={event => setStory(event.target.value)} /></label>
      <label className="block text-sm">Visual style<input className={controlInput} value={style} maxLength={10000} disabled={pending || !data.canEdit} onChange={event => setStyle(event.target.value)} /></label>
      <label className="block text-sm">Additional continuity rules · one per line<textarea className={controlInput} value={rules} rows={3} maxLength={20000} disabled={pending || !data.canEdit} onChange={event => setRules(event.target.value)} /></label>
      <Button type="button" disabled={!data.canEdit || pending || !approved(character?.state)} onClick={() => void saveBible()}>Save a new bible draft</Button>
      {createdBible ? <div className="space-y-3 rounded-xl border border-border p-4"><p className="font-medium">Bible version {createdBible.versionNumber} saved</p><p className="text-sm text-muted-foreground">Review and approve this exact snapshot below. When planning, explicitly choose it; saving it does not alter an approved plan.</p>{bible ? <><div className="space-y-2 text-sm"><p className="whitespace-pre-wrap">{bible.snapshot.story || 'No story-world notes.'}</p><p className="whitespace-pre-wrap">{bible.snapshot.visualStyle || 'No visual-style notes.'}</p><ul className="list-disc space-y-1 pl-5">{bible.snapshot.resourceBindings.map(binding => <li key={binding.resourceId}>{data.resources.find(item => item.id === binding.resourceVersionId)?.name ?? binding.resourceId} · exact reference {binding.resourceVersionId}</li>)}</ul><ul className="list-disc space-y-1 pl-5">{bible.snapshot.rules.map((rule, index) => <li key={index}>{rule}</li>)}</ul></div><ApprovalControls data={data} resourceType="continuityBible" resourceId={createdBible.bibleId} state={bible.state} /></> : <p role="status" className="text-sm text-muted-foreground">Loading the saved snapshot for review…</p>}<a className="inline-flex min-h-11 items-center text-sm text-primary underline" href="#project-continuity-bible">Review the saved bible and all bound references</a></div> : null}
    </section>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <p className="text-xs text-muted-foreground">The professional resource, voice and bible editors remain available below for multiple characters, revisions and detailed control.</p>
  </section>;
}
