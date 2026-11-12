'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { controlInput } from './resource-approval-controls';
import { SHOT_DIRECTION_FIELDS, normalizeShotDirecting, type ShotDirecting } from '@/lib/production/storyboard-contract';

const fields: Record<typeof SHOT_DIRECTION_FIELDS[number], { label: string; hint: string }> = {
  framing: { label: 'Framing', hint: 'For example: wide, medium, close-up or reaction.' },
  angle: { label: 'Camera angle', hint: 'Eye level, low angle, high angle or over the shoulder.' },
  movement: { label: 'Camera movement', hint: 'Static, slow push-in, pan or another deliberate move.' },
  lens: { label: 'Lens treatment', hint: 'Describe perspective or depth of field.' },
  lighting: { label: 'Lighting', hint: 'Describe the light and what must stay recognizable.' },
  atmosphere: { label: 'Atmosphere', hint: 'Describe the mood or environmental treatment.' },
  subjectPosition: { label: 'Character position', hint: 'Who is where, and which direction do they face?' },
  action: { label: 'Action', hint: 'Describe one clear movement and its screen side.' },
  expression: { label: 'Expression', hint: 'Describe the intended reaction or performance.' },
  pacing: { label: 'Pacing', hint: 'Describe the timing of setup, action and reaction.' },
};

export function ShotDirector({ direction, editable, pending, onSave }: { direction: ShotDirecting; editable: boolean; pending: boolean; onSave: (value: ShotDirecting) => Promise<void> }) {
  const [draft, setDraft] = useState(direction);
  const [preserve, setPreserve] = useState(direction.preserve.join('\n'));
  const [error, setError] = useState('');
  return <details className="rounded-xl border border-border p-4">
    <summary className="min-h-9 cursor-pointer font-medium">Direct this shot</summary>
    <p className="mt-2 text-sm text-muted-foreground">Describe the result in your own words. Expand the controls when you want precise direction. Saving changes the draft instructions; it does not generate or purchase media.</p>
    <form className="mt-4 space-y-4" onSubmit={async event => {
      event.preventDefault(); setError('');
      try { await onSave(normalizeShotDirecting({ ...draft, preserve: preserve.split('\n').map(value => value.trim()).filter(Boolean) })); }
      catch { setError('Check these instructions, then refresh if another edit was saved.'); }
    }}>
      <fieldset disabled={!editable || pending} className="grid gap-4 sm:grid-cols-2">
        {SHOT_DIRECTION_FIELDS.map(field => <label key={field} className="text-sm font-medium">{fields[field].label}<textarea maxLength={1000} rows={2} className={controlInput} value={draft[field]} onChange={event => setDraft(value => ({ ...value, [field]: event.target.value }))} /><span className="mt-1 block text-xs font-normal text-muted-foreground">{fields[field].hint}</span></label>)}
        <label className="text-sm font-medium sm:col-span-2">Keep consistent<textarea maxLength={10000} rows={3} className={controlInput} value={preserve} onChange={event => setPreserve(event.target.value)} /><span className="mt-1 block text-xs font-normal text-muted-foreground">One requirement per line, up to 20. Use project references for identity, clothing, products and location.</span></label>
        <Button type="submit" disabled={!editable || pending}>Save draft direction</Button>
      </fieldset>
      {!editable ? <p className="text-sm text-muted-foreground">This approved version is retained. Open a revised plan to change its direction.</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </form>
  </details>;
}
