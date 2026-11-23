'use client';

import { useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { VIDEO_CATALOG_MAX_AGE_MS } from '@/lib/ai/video-routing';
import { saveVideoRoutePolicy } from '@/lib/admin/actions';

export function VideoRoutePreferenceForm({ children }: { children: ReactNode }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaved(false);
    setError('');
    const models = data.getAll('preferredModelIds');
    if (data.get('qualityTier') === 'PREMIUM' && (!models.length || !data.get('maxCostUsd'))) {
      setError('For Premium, select a reviewed model and enter a maximum price per shot.');
      return;
    }
    if (models.length > 8) {
      setError('Select up to eight preferred models.');
      return;
    }
    const selected = event.currentTarget.querySelectorAll<HTMLOptionElement>('select[name="preferredModelIds"] option:checked');
    const catalogExpired = Array.from(selected).some(option => Number(option.dataset.lastSeenAt) < Date.now() - VIDEO_CATALOG_MAX_AGE_MS);
    startTransition(async () => {
      try {
        await saveVideoRoutePolicy(data);
        setSaved(true);
      } catch {
        setError(catalogExpired
          ? 'Save could not be confirmed. This page shows an expired catalog entry. Refresh the OpenRouter video catalog, check the model’s review and try again.'
          : 'Save could not be confirmed. Reload to check the model and price in the saved preferences below before trying again.');
      }
    });
  }

  return <form action={saveVideoRoutePolicy} onSubmit={submit} onChange={() => { setSaved(false); setError(''); }} className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
    {children}
    <button type="submit" disabled={pending} className="ff-button-primary min-h-11 px-5 md:col-span-2 xl:col-span-5">{pending ? 'Saving…' : 'Save route preference'}</button>
    {saved && <p role="status" className="text-sm md:col-span-2 xl:col-span-5">Route preference saved. The table shows your current settings.</p>}
    {error && <p role="alert" className="text-sm text-destructive md:col-span-2 xl:col-span-5">{error}</p>}
  </form>;
}
