'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAction, useQuery } from 'convex/react';
import type { Id } from '../../../convex/_generated/dataModel';
import { api } from '../../../convex/_generated/api';
import { Button } from '@/components/ui/button';

export function TimedRepair({ takeId }: { takeId: Id<'shotVersions'> }) {
  const router = useRouter();
  const option = useQuery(api.repairTiming.option, { takeId });
  const create = useAction(api.repairTiming.create);
  const player = useRef<HTMLVideoElement>(null),
    running = useRef(false);
  const [actionId, setAction] = useState('');
  const [frame, setFrame] = useState<number | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  if (!option) return null;
  const choices = option.choices as {
    actionId: string;
    suggestion?: { providerFrame: number; checkId: Id<'storyActionChecks'> } | null;
    label: string;
    deadline: number;
    firstAllowed: number;
    lastAllowed: number;
  }[];
  const choice = choices.find((c) => c.actionId === actionId) ?? choices[0];
  if (!choice) return null;
  async function fit(selected = frame, checkId?: Id<'storyActionChecks'>) {
    if (running.current || selected === null || !choice || !option) return;
    running.current = true;
    setBusy(true);
    setMessage('');
    try {
      await create({
        takeId,
        reviewId: option.reviewId,
        actionId: choice.actionId,
        providerFrame: selected,
        ...(checkId ? {checkId} : {}),
      });
      router.refresh();
      setMessage(
        'New take saved. Open it in your take list to review the movement with the original voices.',
      );
    } catch {
      setMessage(
        'Timing could not be saved. Choose a later point where the movement has finished, or refresh the review and try again.',
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <details className="space-y-3 rounded-lg border border-border p-3">
      <summary className="cursor-pointer font-medium">Move a late action earlier</summary>
      <p className="mt-3 text-sm">
        Play the saved motion below. Pause where the required movement finishes. FinalFrame will fit it
        before the deadline and keep the original voices in a new take. There is no AI charge.
      </p>
      {choices.length > 1 ? (
        <label className="block text-sm">
          Action{' '}
          <select
            value={choice.actionId}
            disabled={busy}
            onChange={(e) => {
              setAction(e.target.value);
              setFrame(null);
              setMessage('');
            }}
          >
            {choices.map((c) => (
              <option key={c.actionId} value={c.actionId}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-sm">{choice.label}</p>
      )}
      {choice.suggestion ? <Button type="button" size="sm" disabled={busy} onClick={()=>void fit(choice.suggestion!.providerFrame, choice.suggestion!.checkId)}>
        Use the timing found in the picture check
      </Button> : null}
      <video
        controls
        playsInline
        muted
        preload="none"
        className="max-h-64 w-full rounded bg-black"
        src={option.clipUrl}
        ref={player}
        aria-label="Saved silent motion used for this repair"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => {
            const video = player.current;
            if (!video || video.readyState < 2) {
              setMessage('Play the saved motion first.');
              return;
            }
            video.pause();
            const mark = Math.round(video.currentTime * 24);
            if (mark < choice.firstAllowed || mark > choice.lastAllowed) {
              setFrame(null);
              setMessage(
                `Choose a point between ${(choice.firstAllowed / 24).toFixed(2)}s and ${(choice.lastAllowed / 24).toFixed(2)}s so the motion fits the original shot.`,
              );
              return;
            }
            setFrame(mark);
            setMessage('');
          }}
        >
          Mark where the movement finishes
        </Button>
        {frame !== null ? <span className="text-sm">Marked {(frame / 24).toFixed(2)}s</span> : null}
      </div>
      <label className="block text-sm">
        Or enter the finish time in seconds
        <input
          key={choice.actionId}
          type="number"
          min={(choice.firstAllowed / 24).toFixed(2)}
          max={(choice.lastAllowed / 24).toFixed(2)}
          step="0.01"
          disabled={busy}
          className="ml-2 w-24 rounded border border-border bg-background px-2 py-1"
          onChange={(event) => {
            const seconds = event.currentTarget.valueAsNumber,
              mark = Math.round(seconds * 24);
            setFrame(
              Number.isFinite(seconds) && mark >= choice.firstAllowed && mark <= choice.lastAllowed
                ? mark
                : null,
            );
            if (player.current && player.current.readyState >= 1 && Number.isFinite(seconds)) {
              player.current.pause();
              player.current.currentTime = Math.max(0, Math.min(4, seconds));
            }
            setMessage('');
          }}
        />
      </label>
      <Button type="button" size="sm" disabled={busy || frame === null} onClick={() => void fit()}>
        {busy ? 'Making a new take…' : `Fit action before ${choice.deadline.toFixed(2)}s`}
      </Button>
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
    </details>
  );
}
