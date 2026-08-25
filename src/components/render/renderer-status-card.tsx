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
  NOT_STARTED: { label: 'Ready to make the video', description: 'A locked timeline is required before a render can start.', tone: 'border-border/70 bg-secondary/35' },
  UNAVAILABLE: { label: 'Finishing service is not connected', description: 'The app cannot request a real render in this environment. No fake completion or download is shown.', tone: 'border-border/70 bg-secondary/35' },
  QUEUED: { label: 'Queued for finishing', description: 'Your request is safely queued. You can leave this page.', tone: 'border-primary/25 bg-[#fff8e9]' },
  LEASED: { label: 'Finishing slot reserved', description: 'The renderer is taking ownership of your request.', tone: 'border-primary/25 bg-[#fff8e9]' },
  RUNNING: { label: 'Preparing the finishing job', description: 'Sources and the locked timeline are being checked.', tone: 'border-primary/25 bg-[#fff8e9]' },
  RENDERING: { label: 'Making your video', description: 'FinalFrame is rendering the ordered picture, sound, captions, and transitions.', tone: 'border-primary/25 bg-[#fff8e9]' },
  UPLOADING: { label: 'Securing the finished file', description: 'The render is complete. We are verifying the file before exposing a download.', tone: 'border-primary/25 bg-[#fff8e9]' },
  VERIFYING: { label: 'Checking the finished file', description: 'We are checking duration, dimensions, audio, and playback before review.', tone: 'border-primary/25 bg-[#fff8e9]' },
  COMPLETED: { label: 'Finished file verified', description: 'The file passed the final checks and can now be reviewed or downloaded.', tone: 'border-[#8fbda8]/60 bg-[#f0faf5]' },
  FAILED: { label: 'Finishing needs attention', description: 'The source takes and timeline are still safe. The renderer did not produce a verified file.', tone: 'border-[#d88f79]/45 bg-[#fff4ef]' },
  RETRYABLE_FAILURE: { label: 'Finishing can be tried again', description: 'A temporary problem stopped this attempt. Nothing is charged again until a new request is approved.', tone: 'border-[#d88f79]/45 bg-[#fff4ef]' },
  CANCELED: { label: 'Finishing was canceled', description: 'No download is available for this canceled request.', tone: 'border-border/70 bg-secondary/35' },
  TIMED_OUT: { label: 'Finishing took too long', description: 'The request timed out before a verified file was ready. You can retry when the service is available.', tone: 'border-[#d88f79]/45 bg-[#fff4ef]' },
  RECONCILIATION_REQUIRED: { label: 'Finishing needs a check', description: 'The provider response needs to be reconciled before this request can be marked complete.', tone: 'border-[#d88f79]/45 bg-[#fff4ef]' },
};

export function RendererStatusCard({ state, message, attempt, onRetry, retrying = false }: RendererStatusCardProps) {
  const item = states[state];
  const active = ['QUEUED', 'LEASED', 'RUNNING', 'RENDERING', 'UPLOADING', 'VERIFYING'].includes(state);
  const failure = ['FAILED', 'RETRYABLE_FAILURE', 'TIMED_OUT', 'RECONCILIATION_REQUIRED'].includes(state);
  const Icon = state === 'UNAVAILABLE' ? CircleOff : state === 'COMPLETED' ? CheckCircle2 : failure ? AlertTriangle : active ? Loader2 : state === 'NOT_STARTED' ? ExternalLink : CircleOff;
  return <section className={`rounded-2xl border p-5 sm:p-6 ${item.tone}`} aria-live="polite"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-background/70"><Icon className={`size-5 ${active ? 'animate-spin' : ''}`} aria-hidden="true" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="ff-eyebrow">Finishing status</p><h2 className="mt-2 text-lg font-semibold">{item.label}</h2></div>{attempt ? <span className="rounded-full bg-background/70 px-3 py-2 text-xs font-semibold text-muted-foreground">Attempt {attempt}</span> : null}</div><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{message || item.description}</p>{failure && onRetry ? <button type="button" onClick={() => void onRetry()} disabled={retrying} className="ff-button-quiet mt-4 min-h-11 border border-border"><RefreshCcw className={`size-4 ${retrying ? 'animate-spin' : ''}`} aria-hidden="true" />{retrying ? 'Trying again…' : 'Try finishing again'}</button> : null}</div></div></section>;
}
