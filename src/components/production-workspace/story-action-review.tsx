'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { validateStoryActionObservations, type StoryAction, type StoryActionObservation } from '@/lib/production/story-actions';
import { Button } from '@/components/ui/button';
import { StoryActionAssistant } from './story-action-assistant';
import { PerformanceCutaway } from './performance-cutaway';
import { StoryRepairRegion } from './story-repair-region';

const inputClass = 'mt-1 min-h-11 w-full rounded-lg border border-border bg-background p-2 text-sm';
type Answers = Record<string, Partial<StoryActionObservation>>;

function ReviewActions({ takeId, requirementKey, actions, observations, canReview }: {
  takeId: Id<'shotVersions'>;
  requirementKey: string;
  actions: StoryAction[];
  observations: StoryActionObservation[];
  canReview: boolean;
}) {
  const record = useMutation(api.storyActionReviews.record);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<Answers | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const answers: Answers = draft ?? Object.fromEntries(observations.map(row => [row.actionId, row]));
  const action = actions[index];
  const answer = answers[action.id];
  const last = index === actions.length - 1;

  function update(change: Partial<StoryActionObservation>) {
    setDraft(previous => {
      const current = previous ?? answers;
      return { ...current, [action.id]: { ...current[action.id], ...change } };
    });
    setError('');
    setSaved(false);
  }

  function move(next: number) {
    setIndex(next);
    setError('');
  }

  async function save() {
    if (!canReview || busy || !last) return;
    setError('');
    setSaved(false);
    const entries: StoryActionObservation[] = [];
    for (const [position, item] of actions.entries()) {
      const value = answers[item.id];
      const observation = {
        actionId: item.id,
        result: value?.result,
        observedStartSeconds: value?.observedStartSeconds ?? null,
        observedEndSeconds: value?.observedEndSeconds ?? null,
        evidence: value?.evidence ?? '',
      };
      if (!observation.result) {
        setIndex(position);
        setError('Choose what you saw for this action.');
        return;
      }
      const entry = { ...observation, result: observation.result };
      try {
        validateStoryActionObservations([item], [entry]);
      } catch (cause) {
        setIndex(position);
        setError(cause instanceof Error ? cause.message : 'Check your answer for this action.');
        return;
      }
      entries.push(entry);
    }
    setBusy(true);
    try {
      await record({ takeId, requirementKey, observations: entries });
      setSaved(true);
    } catch {
      setError('Could not save this review. Your answers are still here. Reload if the take changed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <p aria-live="polite" aria-atomic="true" className="text-sm tabular-nums text-muted-foreground">
        Action {index + 1} of {actions.length}
      </p>
      <fieldset key={action.id} disabled={!canReview || busy} className="space-y-3">
        <legend className="font-medium">{action.subject}</legend>
        <p className="text-pretty text-sm">{action.action}</p>
        <p className="text-sm tabular-nums text-muted-foreground">
          Look between {action.startSeconds} and {action.endSeconds} seconds.
          {action.beforeSeconds !== null && <> The action must start before {action.beforeSeconds} seconds.</>}
        </p>
        <label className="block text-sm">
          What did you see?
          <select className={inputClass} value={answer?.result ?? ''}
            onChange={event => update({ result: event.target.value as 'PASS' | 'FAIL' })}>
            <option value="" disabled>Choose after watching</option>
            <option value="PASS">Action is clearly visible at the required time</option>
            <option value="FAIL">Missing, unnatural, wrong person or too late</option>
          </select>
        </label>
        {answer?.result === 'PASS' && (
          <div className="grid gap-3 sm:grid-cols-2">
            {(['observedStartSeconds', 'observedEndSeconds'] as const).map(field => (
              <label key={field} className="text-sm">
                {field === 'observedStartSeconds' ? 'First seen (seconds)' : 'Last seen (seconds)'}
                <input type="number" min={action.startSeconds} max={action.endSeconds} step="0.01"
                  className={inputClass} value={answer[field] ?? ''}
                  onChange={event => update({ [field]: event.target.value === '' ? null : Number(event.target.value) })} />
              </label>
            ))}
          </div>
        )}
        <label className="block text-sm">
          What happened on screen?
          <textarea className={inputClass} maxLength={2000} minLength={12} value={answer?.evidence ?? ''}
            placeholder="Describe the movement you saw, or what was missing."
            onChange={event => update({ evidence: event.target.value })} />
        </label>
      </fieldset>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {saved && <p role="status" className="text-sm">Action review saved.</p>}
      <div className="flex flex-wrap gap-2">
        {index > 0 && <Button type="button" variant="secondary" disabled={busy} onClick={() => move(index - 1)}>Previous action</Button>}
        {!last && <Button type="button" variant="secondary" disabled={busy} onClick={() => move(index + 1)}>Next action</Button>}
        {last && canReview && <Button type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save action review'}</Button>}
      </div>
    </div>
  );
}

export function StoryActionReview({ takeId, canReview, canEdit }: { takeId: string; canReview: boolean; canEdit: boolean }) {
  const id = takeId as Id<'shotVersions'>;
  const data = useQuery(api.storyActionReviews.get, { takeId: id });
  if (!data?.actions?.length) return null;
  const current = data.latest?.requirementKey === data.requirementKey ? data.latest : null;
  return (
    <section aria-label="Visible story action checks" className="space-y-3 rounded-xl border border-border p-4">
      <h6 className="text-balance font-semibold">Does the action match the story?</h6>
      <p className="text-pretty text-sm text-muted-foreground">Play the shot at normal speed. Watch the person doing the action. A sliding face, a zoom over a still picture, or speech from a motionless character can all make a shot fail.</p>
      <details className="rounded-lg border border-border px-3">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Check or repair this take with AI</summary>
      {data.regionEnabled && canEdit && data.regionSource && current?.passed === false && (
        <StoryRepairRegion key={data.requirementKey} takeId={id} requirementKey={data.requirementKey} source={data.regionSource} saved={current.repairRegion} />
      )}
      <StoryActionAssistant takeId={id} canEdit={canEdit} humanFailed={current?.passed === false} />
      </details>
      {(current?.passed === false || data.failedPictureCheck) && canEdit && <PerformanceCutaway key={id} takeId={id} />}
      <p role="status" className="text-sm">
        {data.passed ? 'All required actions were reviewed for this exact take.' : 'Approval is blocked until every action is visibly present at the right time.'}
      </p>
      <ReviewActions key={`${id}:${data.requirementKey}`} takeId={id} requirementKey={data.requirementKey}
        actions={data.actions} observations={current?.observations ?? []} canReview={canReview} />
    </section>
  );
}
