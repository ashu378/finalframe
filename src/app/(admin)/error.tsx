'use client';

export default function AdminError({ reset }: { reset: () => void }) {
  return <div className="flex min-h-[55dvh] items-center justify-center"><div className="studio-card max-w-lg p-8 text-center"><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#cbb7a4]">Data unavailable</p><h1 className="ff-display mt-4 text-3xl font-semibold">Operations could not load.</h1><p className="mt-3 leading-7 text-[#cbb7a4]">Try again. If the problem continues, check Convex health before taking an operational action.</p><button type="button" onClick={reset} className="ff-button-primary mt-7">Try again</button></div></div>;
}
