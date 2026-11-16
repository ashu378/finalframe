'use client';

interface RenderProgressProps { projectId: string; initialJobId?: string; }

/** Legacy project-state shell directs users to current canonical job status. */
export function RenderProgress(_props: RenderProgressProps) {
    return <section aria-label="Finishing status" className="ff-card space-y-4 p-5 sm:p-8">
        <h3 className="text-xl font-semibold text-foreground">Finishing status</h3>
        <p className="text-sm leading-6 text-muted-foreground">Open your finishing jobs to check each video and retry a failed job when available.</p>
        <a href="#finishing-jobs" className="inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm text-primary underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Check finishing jobs</a>
    </section>;
}
