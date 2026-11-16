'use client';
import { CircleAlert } from 'lucide-react';
export default function AdminError({ reset }: { reset: () => void }) {
  return <div className="mx-auto flex min-h-[55dvh] max-w-lg flex-col justify-center py-10"><CircleAlert className="size-8 text-destructive" aria-hidden="true" /><h1 className="ff-display mt-6 text-3xl font-semibold">We couldn’t load this page.</h1><p className="mt-4 leading-7 text-muted-foreground">Try again before making any changes. If it keeps happening, check the service status.</p><button type="button" onClick={reset} className="ff-button-primary mt-7 self-start">Try again</button></div>;
}
