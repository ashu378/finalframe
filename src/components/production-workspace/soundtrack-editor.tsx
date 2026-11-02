'use client';

import { Button } from '@/components/ui/button';
import type { CompositionAudioTrack } from '@/lib/production/workspace-controls';
import { controlInput } from './resource-approval-controls';

export type SoundtrackEntry = { id: string; track: CompositionAudioTrack };

export function SoundtrackEditor({ entries, assets, disabled, totalSeconds, onChange }: {
    entries: SoundtrackEntry[];
    assets: Array<{ id: string; name: string; mimeType: string }>;
    disabled: boolean;
    totalSeconds: number;
    onChange: (entries: SoundtrackEntry[]) => void;
}) {
    function update(id: string, patch: Partial<CompositionAudioTrack>) {
        onChange(entries.map(entry => entry.id === id ? { ...entry, track: { ...entry.track, ...patch } } : entry));
    }
    const fields = [
        ['startSeconds', 'Timeline start', 0], ['durationSeconds', 'Audio length', .1],
        ['trimStartSeconds', 'Source trim start', 0], ['volume', 'Volume', 0],
        ['fadeInSeconds', 'Fade in', 0], ['fadeOutSeconds', 'Fade out', 0],
    ] as const;
    return <section aria-label="Narration and music" className="space-y-4 rounded-xl border border-border p-4">
        <div><h3 className="font-semibold">Narration and music · optional</h3><p className="mt-1 text-sm text-muted-foreground">Add separate lanes to play narration over music. Choose approved audio from this project and set when each clip starts. Times are in seconds.</p></div>
        {entries.map((entry, index) => <fieldset key={entry.id} disabled={disabled} className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-2">
            <legend className="px-1 text-sm font-medium">Audio lane {index + 1}</legend>
            <label className="text-sm font-medium" htmlFor={`${entry.id}-asset`}>Approved project audio<select id={`${entry.id}-asset`} className={controlInput} value={entry.track.assetId} onChange={event => update(entry.id, { assetId: event.target.value })}><option value="">Choose project audio</option>{assets.filter(asset => asset.mimeType.startsWith('audio/')).map(asset => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
            <label className="text-sm font-medium" htmlFor={`${entry.id}-role`}>Audio purpose<select id={`${entry.id}-role`} className={controlInput} value={entry.track.role ?? 'music'} onChange={event => update(entry.id, { role: event.target.value as CompositionAudioTrack['role'] })}><option value="music">Music</option><option value="voiceover">Narration</option><option value="dialogue">Dialogue</option><option value="ambience">Ambience</option><option value="sfx">Sound effect</option></select></label>
            {fields.map(([key, label, minimum]) => <label key={key} className="text-sm font-medium" htmlFor={`${entry.id}-${key}`}>{label}<input id={`${entry.id}-${key}`} type="number" min={minimum} max={key === 'volume' ? 1 : 60} step={key === 'volume' ? .05 : .01} className={controlInput} value={entry.track[key] ?? 0} onChange={event => update(entry.id, { [key]: Number(event.target.value) })} /></label>)}
            <Button type="button" variant="ghost" size="sm" aria-label={`Remove audio lane ${index + 1}`} onClick={() => onChange(entries.filter(value => value.id !== entry.id))}>Remove audio lane</Button>
        </fieldset>)}
        <Button type="button" variant="secondary" size="sm" disabled={disabled || entries.length >= 16} onClick={() => onChange([...entries, { id: crypto.randomUUID(), track: { assetId: '', role: 'music', startSeconds: 0, durationSeconds: Math.min(4, totalSeconds || 4), trimStartSeconds: 0, volume: .2, fadeInSeconds: 0, fadeOutSeconds: 0 } }])}>Add audio lane</Button>
    </section>;
}
