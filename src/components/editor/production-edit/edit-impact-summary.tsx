'use client';

import { ArrowDownRight, ArrowRight, CheckCircle2, CircleAlert, Loader2 } from 'lucide-react';
import { useId } from 'react';
import type { ProductionGraphNode } from '@/lib/production-graph/contracts';
import { cn } from '@/lib/utils';

export type EditImpactItem = {
  id: string;
  label: string;
  kind?: string;
  detail?: string;
};

export type ProductionEditImpact = {
  direct: EditImpactItem[];
  affected: EditImpactItem[];
  summary?: string;
};

export type EditImpactSummaryProps = {
  selectedNode: ProductionGraphNode;
  impact?: ProductionEditImpact | null;
  loading?: boolean;
  error?: string | null;
  className?: string;
};

function ImpactItem({ item }: { item: EditImpactItem }) {
  return (
    <li className="flex min-w-0 items-start gap-3 rounded-xl border border-border/70 bg-background/65 px-3 py-3">
      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground" aria-hidden="true">
        <ArrowRight className="size-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-foreground">{item.label}</span>
        {item.detail ? <span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.detail}</span> : null}
      </span>
    </li>
  );
}

export function EditImpactSummary({ selectedNode, impact, loading = false, error, className }: EditImpactSummaryProps) {
  const headingId = useId();

  return (
    <section className={cn('rounded-2xl border border-border/70 bg-secondary/35 p-4 sm:p-5', className)} aria-labelledby={headingId} aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary" aria-hidden="true">
          <ArrowDownRight className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Before you make a change</p>
          <h3 id={headingId} className="ff-display mt-1 text-lg font-semibold text-foreground">What this edit may change</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Starting from <span className="font-semibold text-foreground">{selectedNode.label}</span>. We will show the related parts before anything is made.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-border/70 bg-background/60 px-4 py-4 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Checking the parts connected to this change…
        </div>
      ) : error ? (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-4 text-sm text-destructive" role="alert">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : impact ? (
        <div className="mt-5 space-y-4">
          {impact.summary ? <p className="text-sm leading-6 text-muted-foreground">{impact.summary}</p> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold text-foreground">This part</p>
              {impact.direct.length ? (
                <ul className="space-y-2">
                  {impact.direct.map((item) => <ImpactItem key={item.id} item={item} />)}
                </ul>
              ) : (
                <p className="rounded-xl border border-dashed border-border bg-background/55 px-3 py-3 text-sm text-muted-foreground">The selected part will be updated.</p>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-foreground">Related parts</p>
              {impact.affected.length ? (
                <ul className="space-y-2">
                  {impact.affected.map((item) => <ImpactItem key={item.id} item={item} />)}
                </ul>
              ) : (
                <p className="rounded-xl border border-dashed border-border bg-background/55 px-3 py-3 text-sm text-muted-foreground">Nothing else is expected to change.</p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-[hsl(var(--success)/.25)] bg-[hsl(var(--success)/.08)] px-3 py-3 text-xs leading-5 text-foreground">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[hsl(var(--success))]" aria-hidden="true" />
            <span>No credits are used for this preview. Making a new video take is a separate step that will ask for approval first.</span>
          </div>
        </div>
      ) : (
        <p className="mt-5 rounded-xl border border-dashed border-border bg-background/55 px-4 py-4 text-sm leading-6 text-muted-foreground">
          Describe the change, then choose “Check what changes” to see the affected parts.
        </p>
      )}
    </section>
  );
}
