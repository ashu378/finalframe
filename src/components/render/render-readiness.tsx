import { AlertTriangle, Check, Circle, LockKeyhole } from 'lucide-react';

export interface RenderReadinessCheck {
  id: string;
  label: string;
  detail?: string;
  status: 'PASS' | 'BLOCKED' | 'PENDING';
}

interface RenderReadinessProps {
  timelineStatus: 'DRAFT' | 'READY_FOR_REVIEW' | 'APPROVED' | 'LOCKED' | 'SUPERSEDED';
  checks: RenderReadinessCheck[];
  onLock?: () => void | Promise<void>;
  locking?: boolean;
}

export function RenderReadiness({ timelineStatus, checks, onLock, locking = false }: RenderReadinessProps) {
  const blocked = checks.some((check) => check.status === 'BLOCKED');
  const locked = timelineStatus === 'LOCKED';
  const approved = timelineStatus === 'APPROVED' || locked;
  return <section className="ff-card overflow-hidden" aria-labelledby="render-readiness-title"><div className="border-b border-border/70 bg-secondary/35 p-5 sm:p-6"><div className="flex items-start gap-3"><span className={`grid size-10 shrink-0 place-items-center rounded-xl ${locked ? 'bg-[hsl(var(--success)/0.12)]' : 'bg-background'}`}>{locked ? <LockKeyhole className="size-5 text-[hsl(var(--success))]" aria-hidden="true" /> : <Circle className="size-5 text-muted-foreground" aria-hidden="true" />}</span><div className="min-w-0"><h2 id="render-readiness-title" className="text-xl font-semibold">{locked ? 'Your edit is locked for export' : approved ? 'Your edit is approved — lock it before export' : 'Review your edit before export'}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{locked ? 'Your next export will use this saved edit. Any further changes create a new version.' : 'FinalFrame checks your media, timing, captions and sound before making the file.'}</p></div></div></div><div className="space-y-3 p-5 sm:p-6"><ul className="space-y-3" aria-label="Export readiness checks">{checks.map((check) => <li key={check.id} className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/45 p-3"><span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${check.status === 'PASS' ? 'bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]' : check.status === 'BLOCKED' ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-muted-foreground'}`}>{check.status === 'PASS' ? <Check className="size-3.5" aria-hidden="true" /> : check.status === 'BLOCKED' ? <AlertTriangle className="size-3.5" aria-hidden="true" /> : <Circle className="size-2.5 fill-current" aria-hidden="true" />}</span><span className="min-w-0"><span className="block text-sm font-semibold">{check.label}</span>{check.detail ? <span className="mt-1 block text-xs leading-5 text-muted-foreground">{check.detail}</span> : null}</span></li>)}</ul>{!locked ? <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-secondary/45 p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm leading-6 text-muted-foreground">{blocked ? 'Fix the blocked checks before locking your edit.' : 'Locking keeps this version safe for export.'}</p><button type="button" onClick={() => void onLock?.()} disabled={blocked || !approved || locking || !onLock} className="ff-button-primary min-h-11 shrink-0">{locking ? 'Locking…' : 'Lock this edit'}</button></div> : <p className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--success))]"><LockKeyhole className="size-4" aria-hidden="true" /> Ready to make your finished video.</p>}</div></section>;
}
