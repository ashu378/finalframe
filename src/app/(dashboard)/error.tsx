'use client';

export default function DashboardError({ reset }: { reset: () => void }) {
  return <div className="flex min-h-[55dvh] items-center justify-center"><div className="ff-card max-w-lg p-8 text-center sm:p-10"><p className="ff-eyebrow">Your studio is still safe</p><h1 className="ff-display mt-4 text-3xl font-semibold">We couldn’t load this view.</h1><p className="mt-3 leading-7 text-muted-foreground">Try again. If it keeps happening, the next step is to check the Convex connection.</p><button type="button" onClick={reset} className="ff-button-primary mt-7">Try again</button></div></div>;
}
