'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark, Check, LayoutTemplate, Plus } from 'lucide-react';
import type { Template } from '@/lib/types/database';
import { createProjectFromTemplate, setTemplateSaved } from '@/lib/templates/actions';
import { Button } from '@/components/ui/button';

export function TemplateList({ templates, studioId }: { templates: Template[]; studioId: string }) {
  const router = useRouter();
  const requests = useRef<Record<string, string>>({});
  const busy = useRef(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(() => new Set(templates.filter((template) => template.blueprint_data.saved === true).map((template) => template.id)));

  async function startTemplate(template: Template) {
    if (busy.current) return;
    busy.current = true;
    setPending(template.id); setError('');
    requests.current[template.id] ||= crypto.randomUUID();
    try {
      const result = await createProjectFromTemplate(studioId, template.id, template.name, requests.current[template.id]);
      if (!result.success || !result.projectId) throw new Error(result.error);
      router.push(`/dashboard/create?project=${encodeURIComponent(result.projectId)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not prepare this project. Please try again.');
    } finally { busy.current = false; setPending(null); }
  }

  async function toggleSaved(template: Template) {
    if (busy.current) return;
    busy.current = true;
    setPending(template.id); setError('');
    try {
      const nextSaved = !saved.has(template.id);
      const result = await setTemplateSaved(studioId, template.id, nextSaved);
      if (!result.success) throw new Error(result.error);
      setSaved((previous) => { const next = new Set(previous); if (nextSaved) next.add(template.id); else next.delete(template.id); return next; });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'We could not save this preset. Please try again.');
    } finally { busy.current = false; setPending(null); }
  }

  if (!templates.length) return <div className="ff-card p-8 text-center"><LayoutTemplate className="mx-auto size-8 text-muted-foreground" /><h2 className="mt-4 text-xl font-semibold">No matching templates</h2><p className="mt-2 text-sm text-muted-foreground">Try another search or choose a new starting point.</p></div>;
  return <div className="space-y-5">
    <p className="text-sm leading-6 text-muted-foreground">Each template gives you a starting idea and video shape. Change it, review the plan and cost, then decide what to make. Save useful templates to find them again.</p>
    {error ? <p role="alert" className="rounded-xl border border-destructive p-4 text-sm text-destructive">{error}</p> : null}
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{templates.map((template) => <article key={template.id} className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/50">
      <div className="flex items-center justify-between gap-3"><LayoutTemplate className="size-6 text-primary" /><span className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">{template.blueprint_data.durationSeconds} seconds</span></div>
      <h2 className="ff-display mt-7 text-2xl font-semibold">{template.name}</h2>
      <p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">{template.description}</p>
      <p className="mt-4 text-xs text-muted-foreground">{String(template.blueprint_data.outputPreset).toLowerCase().replaceAll('_', ' ')} · Change it to fit your idea</p>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2"><Button disabled={pending !== null} onClick={() => void startTemplate(template)}><Plus className="size-4" />{pending === template.id ? 'Working…' : 'Use template'}</Button><Button variant="secondary" disabled={pending !== null} aria-pressed={saved.has(template.id)} aria-label={`${saved.has(template.id) ? 'Remove saved template' : 'Save template'}: ${template.name}`} onClick={() => void toggleSaved(template)}>{saved.has(template.id) ? <Check className="size-4" /> : <Bookmark className="size-4" />}{saved.has(template.id) ? 'Saved' : 'Save template'}</Button></div>
    </article>)}</div>
  </div>;
}
