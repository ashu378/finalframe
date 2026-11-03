'use client';

interface RenderProgressProps { projectId: string; initialJobId?: string; }

/** Legacy project-state shell directs users to current canonical job status. */
export function RenderProgress(_props: RenderProgressProps) {
    return <section aria-label="Finishing status" className="space-y-4 rounded border border-zinc-700 bg-zinc-900 p-8">
        <h3 className="text-xl font-semibold text-zinc-100">Finishing status</h3>
        <p className="text-sm text-zinc-400">Use the Finishing jobs panel to check the current export status and any available retry.</p>
        <a href="#finishing-jobs" className="inline-flex rounded px-3 py-2 text-sm text-primary underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Check individual finishing jobs</a>
    </section>;
}
