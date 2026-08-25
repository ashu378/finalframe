'use client';

import { Check, Loader2, MessageSquareText, Sparkles } from 'lucide-react';
import { useId, useState } from 'react';
import type { ProductionGraphNode } from '@/lib/production-graph/contracts';
import { cn } from '@/lib/utils';
import { EditImpactSummary, type ProductionEditImpact } from './edit-impact-summary';

export type PromptEditSubmission = {
  node: ProductionGraphNode;
  instruction: string;
  impact: ProductionEditImpact;
};

export type PromptEditPanelProps = {
  selectedNode: ProductionGraphNode;
  impact?: ProductionEditImpact | null;
  impactLoading?: boolean;
  impactError?: string | null;
  submitting?: boolean;
  onPreviewImpact?: (instruction: string) => void | Promise<void>;
  onSubmitOperation?: (submission: PromptEditSubmission) => void | Promise<void>;
  className?: string;
};

export function PromptEditPanel({
  selectedNode,
  impact,
  impactLoading = false,
  impactError,
  submitting = false,
  onPreviewImpact,
  onSubmitOperation,
  className,
}: PromptEditPanelProps) {
  const inputId = useId();
  const confirmationId = useId();
  const [instruction, setInstruction] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const trimmedInstruction = instruction.trim();
  const canPreview = trimmedInstruction.length > 0 && !impactLoading && !submitting;
  const canSubmit = Boolean(trimmedInstruction && impact && confirmed && onSubmitOperation && !impactLoading && !submitting);

  function updateInstruction(value: string) {
    setInstruction(value);
    setConfirmed(false);
  }

  function handlePreview() {
    if (!canPreview) return;
    onPreviewImpact?.(trimmedInstruction);
  }

  function handleSubmit() {
    if (!canSubmit || !impact || !onSubmitOperation) return;
    void onSubmitOperation({ node: selectedNode, instruction: trimmedInstruction, impact });
  }

  return (
    <section className={cn('ff-card p-5 sm:p-6', className)} aria-labelledby={`${inputId}-heading`}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary" aria-hidden="true">
          <MessageSquareText className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="ff-eyebrow">Shape this part</p>
          <h2 id={`${inputId}-heading`} className="ff-display mt-2 text-2xl font-semibold leading-tight">Tell FinalFrame what to change</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            You are changing <span className="font-semibold text-foreground">{selectedNode.label}</span>. Use everyday language; you can ask for a visual, pacing, voice, or story change.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <label htmlFor={inputId} className="text-sm font-semibold text-foreground">Your change</label>
        <textarea
          id={inputId}
          value={instruction}
          onChange={(event) => updateInstruction(event.target.value)}
          placeholder="For example: Make the room brighter and let the character pause before speaking."
          rows={5}
          maxLength={1200}
          className="mt-2 block min-h-32 w-full resize-y rounded-2xl border border-input bg-background px-4 py-3 text-sm leading-6 text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground/75 focus:border-primary focus:ring-2 focus:ring-ring/40"
          aria-describedby={`${inputId}-hint`}
          disabled={submitting}
        />
        <div id={`${inputId}-hint`} className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
          <span>Describe the result you want. You do not need to know how it is made.</span>
          <span>{instruction.length}/1200</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={handlePreview} disabled={!canPreview} className="ff-button-secondary min-w-44">
          {impactLoading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
          {impactLoading ? 'Checking…' : 'Check what changes'}
        </button>
        <p className="self-center text-xs leading-5 text-muted-foreground">This check does not make a new video.</p>
      </div>

      <EditImpactSummary
        selectedNode={selectedNode}
        impact={impact}
        loading={impactLoading}
        error={impactError}
        className="mt-6"
      />

      {impact ? (
        <div className="mt-5 rounded-2xl border border-border/70 bg-background/55 p-4">
          <label className="flex cursor-pointer items-start gap-3" htmlFor={confirmationId}>
            <input
              id={confirmationId}
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              disabled={submitting || impactLoading}
              className="mt-1 size-5 shrink-0 accent-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="text-sm leading-6 text-foreground">
              I have reviewed what may change and want to save this request for the next approved video step.
            </span>
          </label>
          <button type="button" onClick={handleSubmit} disabled={!canSubmit} className="ff-button-primary mt-4 w-full sm:w-auto">
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
            {submitting ? 'Saving change…' : 'Save this change'}
          </button>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Saving the request uses no credits. FinalFrame will ask for approval before any new generation begins.
          </p>
        </div>
      ) : null}
    </section>
  );
}
