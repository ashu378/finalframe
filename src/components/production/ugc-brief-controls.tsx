'use client';
import { EMPTY_UGC_BRIEF, SPEECH_MODES, UGC_FORMATS, type UgcBrief } from '@/lib/production/ugc-brief';
const input = 'mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm';
export function UgcBriefControls({ value, onChange, disabled }: { value?: UgcBrief; onChange: (value: UgcBrief | undefined) => void; disabled: boolean }) {
  return <fieldset disabled={disabled} className="space-y-4 rounded-xl border border-border p-4">
    <legend className="px-2 font-semibold">Make the advertisement useful</legend>
    <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked ? { ...EMPTY_UGC_BRIEF } : undefined)}/>Add product and presenter details</label>
    <p className="text-sm text-muted-foreground">Optional. Tell us what is true about the product. FinalFrame can suggest the story; it should not invent product claims.</p>
    {value ? <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm">What kind of ad?<select className={input} value={value.format} onChange={e => onChange({ ...value, format: e.target.value as UgcBrief['format'] })}>{UGC_FORMATS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
      <label className="text-sm">How should speech work?<select className={input} value={value.speechMode} onChange={e => onChange({ ...value, speechMode: e.target.value as UgcBrief['speechMode'] })}>{SPEECH_MODES.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
      {([['audience', 'Who is this for?'], ['productName', 'Exact product or business name'], ['mainBenefit', 'The main benefit you can support'], ['callToAction', 'What should viewers do next?'], ['delivery', 'Voice and delivery notes']] as const).map(([key, label]) => <label key={key} className="text-sm">{label}<input className={input} maxLength={500} value={value[key]} onChange={e => onChange({ ...value, [key]: e.target.value })}/></label>)}
      <label className="text-sm sm:col-span-2">Product facts and things we must not claim<textarea className={input} rows={3} maxLength={3000} value={value.productFacts} onChange={e => onChange({ ...value, productFacts: e.target.value })}/></label>
      <p className="text-xs leading-5 text-muted-foreground sm:col-span-2">Add clear product packaging and contents photos with your media. For a speaking presenter, approve a portrait and exact audio before making the talking shot. A voiceover does not animate the mouth.</p>
    </div> : null}
  </fieldset>;
}
