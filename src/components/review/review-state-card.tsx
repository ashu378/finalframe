import { AlertTriangle, CheckCircle2, Clock3, FileVideo, Loader2 } from 'lucide-react';
import type { ReviewAvailability } from './review-types';

interface ReviewStateCardProps {
  availability: ReviewAvailability;
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

const content: Record<ReviewAvailability, { title: string; description: string; icon: typeof Clock3; className: string }> = {
  READY: { title: 'Ready for your review', description: 'Watch this verified version, leave notes, or approve it when it feels right.', icon: CheckCircle2, className: 'border-[#8fbda8]/60 bg-[#f0faf5]' },
  WAITING: { title: 'Review opens after the video is ready', description: 'The finishing step is still working. Your source takes remain safe while we wait.', icon: Loader2, className: 'border-primary/25 bg-[#fff8e9]' },
  UNAVAILABLE: { title: 'Review is not connected yet', description: 'A verified video is not available in this environment, so no approval or download is shown.', icon: FileVideo, className: 'border-border/70 bg-secondary/45' },
  ERROR: { title: 'We could not load this review', description: 'Try again, or return to the project and check the latest finishing status.', icon: AlertTriangle, className: 'border-[#d88f79]/45 bg-[#fff4ef]' },
};

export function ReviewStateCard({ availability, title, description, action }: ReviewStateCardProps) {
  const item = content[availability];
  const Icon = item.icon;
  return (
    <section className={`rounded-2xl border p-5 sm:p-6 ${item.className}`} aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-background/70">
          <Icon className={`size-5 ${availability === 'WAITING' ? 'animate-spin' : ''}`} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="ff-eyebrow">Review and approval</p>
          <h2 className="mt-2 text-lg font-semibold">{title ?? item.title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{description ?? item.description}</p>
          {action ? <div className="mt-4">{action}</div> : null}
        </div>
      </div>
    </section>
  );
}
