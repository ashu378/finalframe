'use client';

export default function WorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="ff-card mx-auto max-w-2xl p-8 text-center"><p className="ff-eyebrow">Workspace unavailable</p><h1 className="ff-display mt-3 text-3xl font-semibold">We could not load this video project.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Your project data is safe. Try again, or return to your projects.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><button type="button" onClick={reset} className="ff-button-primary">Try again</button><a href="/dashboard" className="ff-button-quiet">Back to projects</a></div></div>;
}
