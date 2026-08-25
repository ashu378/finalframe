'use client';

import { Check, ChevronRight, Clock3, GitCompareArrows, History, LockKeyhole } from 'lucide-react';
import type { ReviewVersion } from './review-types';

interface VersionHistoryProps {
  versions: ReviewVersion[];
  selectedVersionId?: string;
  compareVersionId?: string;
  onSelect: (version: ReviewVersion) => void;
  onCompare?: (left: ReviewVersion, right: ReviewVersion) => void;
}

function statusLabel(status: ReviewVersion['status']) {
  return { DRAFT: 'Draft', READY: 'Ready to review', APPROVED: 'Approved', SUPERSEDED: 'Replaced' }[status];
}

export function VersionHistory({ versions, selectedVersionId, compareVersionId, onSelect, onCompare }: VersionHistoryProps) {
  if (versions.length === 0) return <div className="rounded-2xl border border-border/70 bg-secondary/35 p-5 text-sm leading-6 text-muted-foreground">Earlier versions will appear here as you make changes. No fake versions are created.</div>;
  return (
    <section className="ff-card p-5 sm:p-6" aria-labelledby="version-history-title">
      <div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-secondary"><History className="size-5" aria-hidden="true" /></span><div><p className="ff-eyebrow">Versions</p><h2 id="version-history-title" className="mt-2 text-xl font-semibold">Every approved choice stays recoverable.</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Select a version to review it. Compare two versions when you need to see what changed.</p></div></div>
      <ol className="mt-6 space-y-3">
        {versions.map((version) => {
          const selected = version.id === selectedVersionId;
          const compare = version.id === compareVersionId;
          return <li key={version.id}><div className={`rounded-2xl border p-4 transition ${selected ? 'border-primary/60 bg-[#fff8e9]' : 'border-border/70 bg-background/45 hover:border-primary/35'}`}><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><button type="button" onClick={() => onSelect(version)} className="flex min-w-0 items-center gap-3 text-left"><span className={`grid size-9 shrink-0 place-items-center rounded-full ${version.status === 'APPROVED' ? 'bg-[#c8ddd5] text-[hsl(var(--success))]' : 'bg-secondary text-muted-foreground'}`}>{version.status === 'APPROVED' ? <Check className="size-4" aria-hidden="true" /> : <ChevronRight className="size-4" aria-hidden="true" />}</span><span className="min-w-0"><span className="block truncate font-semibold">{version.label}</span><span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{statusLabel(version.status)}</span><span aria-hidden="true">·</span><span><Clock3 className="mr-1 inline size-3" aria-hidden="true" />{version.createdAt}</span></span></span></button><div className="flex items-center gap-2 pl-12 sm:pl-0"><span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">{version.durationSeconds ? `${Math.round(version.durationSeconds)}s` : 'Duration pending'}</span>{version.status === 'APPROVED' ? <LockKeyhole className="size-4 text-[hsl(var(--success))]" aria-label="Locked approved version" /> : null}</div></div>{version.note ? <p className="mt-3 border-t border-border/60 pt-3 text-sm leading-6 text-muted-foreground">{version.note}</p> : null}{onCompare && versions.length > 1 ? <button type="button" onClick={() => onCompare(version, versions.find((candidate) => candidate.id !== version.id) ?? version)} className={`mt-3 inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-xs font-semibold transition ${compare ? 'bg-foreground text-background' : 'bg-secondary text-foreground hover:bg-secondary/70'}`}><GitCompareArrows className="size-4" aria-hidden="true" />{compare ? 'Comparing this version' : 'Compare versions'}</button> : null}</div></li>;
        })}
      </ol>
    </section>
  );
}
