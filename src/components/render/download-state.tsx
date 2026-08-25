import { CheckCircle2, Download, FileWarning, LockKeyhole } from 'lucide-react';

interface DownloadStateProps {
  status: 'NOT_READY' | 'VERIFYING' | 'READY' | 'EXPIRED';
  href?: string;
  fileName?: string;
  expiresAt?: string;
}

export function DownloadState({ status, href, fileName = 'finalframe-video.mp4', expiresAt }: DownloadStateProps) {
  if (status === 'READY' && href) return <section className="rounded-2xl border border-[#8fbda8]/60 bg-[#f0faf5] p-5" aria-live="polite"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[hsl(var(--success))]" aria-hidden="true" /><div><p className="font-semibold">Download ready</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{fileName}{expiresAt ? ` · available until ${expiresAt}` : ''}</p></div></div><a href={href} download={fileName} className="ff-button-primary min-h-11 shrink-0"><Download className="size-4" aria-hidden="true" /> Download video</a></div></section>;
  const copy = status === 'VERIFYING' ? { title: 'Download unlocks after verification', description: 'The file is being checked for playback, duration, audio, and format.' } : status === 'EXPIRED' ? { title: 'This download link has expired', description: 'The verified video remains attached to the project. Request a fresh download link when the service is available.' } : { title: 'No download yet', description: 'A download appears only after a real renderer produces and verifies the final file.' };
  const Icon = status === 'EXPIRED' ? FileWarning : status === 'VERIFYING' ? LockKeyhole : Download;
  return <section className="rounded-2xl border border-border/70 bg-secondary/35 p-5" aria-live="polite"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-background"><Icon className="size-5 text-muted-foreground" aria-hidden="true" /></span><div><p className="ff-eyebrow">Download</p><h2 className="mt-2 text-lg font-semibold">{copy.title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.description}</p></div></div></section>;
}
