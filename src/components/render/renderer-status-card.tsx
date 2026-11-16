import { AlertTriangle, CheckCircle2, CircleOff, ExternalLink, Loader2, RefreshCcw } from 'lucide-react';
import type { RenderJobState } from '@/lib/render/contracts';

interface RendererStatusCardProps {
  state: RenderJobState | 'NOT_STARTED' | 'UNAVAILABLE';
  message?: string;
  attempt?: number;
  onRetry?: () => void | Promise<void>;
  retrying?: boolean;
}

const states: Record<RendererStatusCardProps['state'], { label: string; description: string; tone: string }> = {
  NOT_STARTED: { label: 'Ready to make the video', description: 'Review and lock your edit before making the finished video.', tone: 'border-border/70 bg-secondary/35' },
  UNAVAILABLE: { label: 'Finishing service is not connected', description: 'Video finishing is not available here yet. Your work has not been marked complete.', tone: 'border-border/70 bg-secondary/35' },
  QUEUED: { label: 'Queued for finishing', description: 'Your request is safely queued. You can leave this page.', tone: 'border-primary/25 bg-primary/5' },
  LEASED: { label: 'Finishing slot reserved', description: 'The finishing service has reserved a place for your video.', tone: 'border-primary/25 bg-primary/5' },
  RUNNING: { label: 'Preparing the finishing job', description: 'Your saved media and locked edit are being checked.', tone: 'border-primary/25 bg-primary/5' },
  RENDERING: { label: 'Making your video', description: 'FinalFrame is combining your approved video, sound and captions.', tone: 'border-primary/25 bg-primary/5' },
  UPLOADING: { label: 'Saving your finished file', description: 'Your video is made. We are saving and checking the file before download.', tone: 'border-primary/25 bg-primary/5' },
  VERIFYING: { label: 'Checking the finished file', description: 'We are checking duration, dimensions, audio, and playback before review.', tone: 'border-primary/25 bg-primary/5' },
  COMPLETED: { label: 'Finished file verified', description: 'The file passed the final checks and can now be reviewed or downloaded.', tone: 'border-[hsl(var(--success)/0.4)] bg-[hsl(var(--success)/0.08)]' },
  FAILED: { label: 'Finishing needs attention', description: 'The source takes and timeline are still safe. The renderer did not produce a verified file.', tone: 'border-destructive/40 bg-destructive/5' },
  RETRYABLE_FAILURE: { label: 'Finishing can be tried again', description: 'A temporary problem stopped this attempt. Nothing is charged again until a new request is approved.', tone: 'border-destructive/40 bg-destructive/5' },
  CANCELED: { label: 'Finishing was canceled', description: 'No download is available for this canceled request.', tone: 'border-border/70 bg-secondary/35' },
  TIMED_OUT: { label: 'Finishing took too long', description: 'The request timed out before a verified file was ready. You can retry when the service is available.', tone: 'border-destructive/40 bg-destructive/5' },
  RECONCILIATION_REQUIRED: { label: 'Finishing needs a check', description: 'We need to confirm the finishing result before marking this video complete.', tone: 'border-destructive/40 bg-destructive/5' },
};

export function RendererStatusCard({ state, message, attempt, onRetry, retrying = false }: RendererStatusCardProps) {
  const item = states[state];
  const active = ['QUEUED', 'LEASED', 'RUNNING', 'RENDERING', 'UPLOADING', 'VERIFYING'].includes(state);
  const failure = ['FAILED', 'RETRYABLE_FAILURE', 'TIMED_OUT', 'RECONCILIATION_REQUIRED'].includes(state);
  const Icon = state === 'UNAVAILABLE' ? CircleOff : state === 'COMPLETED' ? CheckCircle2 : failure ? AlertTriangle : active ? Loader2 : state === 'NOT_STARTED' ? ExternalLink : CircleOff;
  return <section className={`rounded-2xl border p-5 sm:p-6 ${item.tone}`} aria-live="polite"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-background/70"><Icon className={`size-5 ${active ? 'animate-spin' : ''}`} aria-hidden="true" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h2 className="break-words text-lg font-semibold">{item.label}</h2></div>{attempt ? <span className="rounded-full bg-background/70 px-3 py-2 text-xs font-semibold text-muted-foreground">Attempt {attempt}</span> : null}</div><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{message || item.description}</p>{failure && onRetry ? <button type="button" onClick={() => void onRetry()} disabled={retrying} className="ff-button-quiet mt-4 min-h-11 border border-border"><RefreshCcw className={`size-4 ${retrying ? 'animate-spin' : ''}`} aria-hidden="true" />{retrying ? 'Trying again…' : 'Try finishing again'}</button> : null}</div></div></section>;
}
