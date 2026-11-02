'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { controlInput } from './resource-approval-controls';
import { loadStockVoiceChoices, selectProjectStockVoice } from '@/lib/production/stock-voice-actions';
import type { StockVoiceChoice } from '@/lib/ai/stock-voices';

export function StockVoicePicker({ projectExternalId }: { projectExternalId: string }) {
  const router = useRouter(); const [pending, start] = useTransition();
  const [choices, setChoices] = useState<StockVoiceChoice[]>([]); const [selectionKey, setSelection] = useState('');
  const [name, setName] = useState(''); const [modelName, setModelName] = useState(''); const [error, setError] = useState('');
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  return <section className="space-y-3 rounded-xl border border-border p-4" aria-labelledby="stock-voice-heading">
    <div><h3 id="stock-voice-heading" className="font-semibold">Choose a provider stock voice</h3><p className="mt-1 text-sm text-muted-foreground">Load the provider’s current presets and save a separate voice profile in this project. Loading and saving do not generate speech or spend provider credits.</p></div>
    <Button type="button" variant="secondary" disabled={pending} onClick={() => start(async () => { setError(''); const result = await loadStockVoiceChoices(projectExternalId); if (!result.success) setError(result.error); else { setChoices(result.choices); setModelName(result.modelName); setSelection(''); } })}>{pending ? 'Working…' : choices.length ? 'Refresh stock voices' : 'Load stock voices'}</Button>
    {choices.length > 0 && <form className="grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); start(async () => { setError(''); const fingerprint = JSON.stringify({ name: name.trim(), selectionKey }); if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() }; const result = await selectProjectStockVoice({ projectExternalId, name, selectionKey, requestId: request.current.id }); if (!result.success) setError(result.error); else { setName(''); setSelection(''); router.refresh(); } }); }}>
      <label className="text-sm font-medium">Project stock voice name<input required maxLength={160} value={name} onChange={event => setName(event.target.value)} className={controlInput} /></label>
      <label className="text-sm font-medium">Verified provider preset<select required value={selectionKey} onChange={event => setSelection(event.target.value)} className={controlInput}><option value="">Choose a stock voice</option>{choices.map(choice => <option key={choice.selectionKey} value={choice.selectionKey}>{choice.label}</option>)}</select></label>
      <p className="text-xs text-muted-foreground sm:col-span-2">Catalog: {modelName}. Submit the saved profile for review and approve it before narration. Voice quality is confirmed only by a separate generation test.</p>
      <Button disabled={pending || !name.trim() || !selectionKey}>Save stock voice profile</Button>
    </form>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
