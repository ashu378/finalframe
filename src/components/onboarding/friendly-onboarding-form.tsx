'use client';

import { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { saveFriendlyOnboarding } from '@/lib/onboarding/actions';

const options = {
  goal: [['social_content', 'Social content'], ['business_video', 'Business video'], ['cartoon_story', 'Cartoon or story'], ['product_demo', 'Product demo']],
  platform: [['social', 'Social media'], ['website', 'Website'], ['presentations', 'Presentations'], ['just_exploring', 'I’m exploring']],
  style: [['expressive', 'Expressive and lively'], ['clean', 'Clean and clear'], ['cinematic', 'Cinematic'], ['playful', 'Playful']],
  media: [['no_media_yet', 'I’ll start from an idea'], ['bring_media', 'I have images or footage'], ['bring_voice', 'I have a voice recording'], ['mixed', 'A mix of things']],
} as const;

function ChoiceGroup({ name, label, value, onChange, items }: { name: string; label: string; value: string; onChange: (value: string) => void; items: readonly (readonly [string, string])[] }) {
  return <fieldset className="space-y-3">
    <legend className="text-sm font-semibold text-foreground">{label}</legend>
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map(([id, text]) => <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)} className={`flex min-h-12 items-center justify-between rounded-xl border px-4 text-left text-sm transition ${value === id ? 'border-primary bg-primary/10 font-semibold' : 'border-border bg-background hover:border-primary/50 hover:bg-secondary/50'}`}>
        <span>{text}</span>{value === id && <Check className="size-4 text-accent" />}
      </button>)}
    </div>
    <input type="hidden" name={name} value={value} />
  </fieldset>;
}

export function FriendlyOnboardingForm() {
  const [values, setValues] = useState({ goal: '', platform: '', style: '', media: '' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const set = (key: keyof typeof values) => (value: string) => setValues((current) => ({ ...current, [key]: value }));
  const ready = Object.values(values).every(Boolean);

  async function submit(formData: FormData) {
    setPending(true); setError('');
    try { await saveFriendlyOnboarding(formData); } catch (cause) {
      if (cause instanceof Error && cause.message.includes('NEXT_REDIRECT')) return;
      setError(cause instanceof Error ? cause.message : 'We couldn’t save your setup. Please try again.');
      setPending(false);
    }
  }

  return <form action={submit} className="space-y-8">
    <div><label htmlFor="studioName" className="text-sm font-semibold">What should we call your studio?</label><input id="studioName" name="studioName" required minLength={2} placeholder="e.g. Maya’s kitchen studio" className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-primary" /></div>
    <ChoiceGroup name="goal" label="What do you want to make first?" value={values.goal} onChange={set('goal')} items={options.goal} />
    <ChoiceGroup name="platform" label="Where will people watch it?" value={values.platform} onChange={set('platform')} items={options.platform} />
    <ChoiceGroup name="style" label="What should it feel like?" value={values.style} onChange={set('style')} items={options.style} />
    <ChoiceGroup name="media" label="Do you have media to bring?" value={values.media} onChange={set('media')} items={options.media} />
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
    <button type="submit" disabled={!ready || pending} className="ff-button-primary min-h-12 w-full">{pending ? 'Saving your studio…' : 'Start my first video'} <ArrowRight className="size-4" /></button>
  </form>;
}
