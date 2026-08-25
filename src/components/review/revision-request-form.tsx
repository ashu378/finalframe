'use client';

import { useState } from 'react';
import { Loader2, MessageSquare, X } from 'lucide-react';

interface RevisionRequestFormProps {
  submitting?: boolean;
  onCancel: () => void;
  onSubmit: (note: string) => void | Promise<void>;
}

export function RevisionRequestForm({ submitting = false, onCancel, onSubmit }: RevisionRequestFormProps) {
  const [note, setNote] = useState('');
  const canSubmit = note.trim().length >= 3 && !submitting;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    await onSubmit(note.trim());
    setNote('');
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5" aria-labelledby="revision-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="ff-eyebrow">Ask for a change</p>
          <h3 id="revision-title" className="mt-2 font-semibold">What would you like adjusted?</h3>
        </div>
        <button type="button" onClick={onCancel} className="ff-button-quiet min-h-11 min-w-11 px-3" aria-label="Close revision request">
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <label htmlFor="revision-note" className="sr-only">Revision note</label>
      <textarea id="revision-note" value={note} onChange={(event) => setNote(event.target.value)} rows={4} maxLength={1000} autoFocus placeholder="For example: make the ending shorter and let the product stay on screen for one more second." className="mt-4 min-h-28 w-full resize-y rounded-xl border border-border bg-background p-3 text-sm leading-6 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">Your note will stay attached to this exact version.</p>
        <button type="submit" disabled={!canSubmit} className="ff-button-primary min-h-11">
          {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <MessageSquare className="size-4" aria-hidden="true" />}
          Save revision note
        </button>
      </div>
    </form>
  );
}
