'use client';
import { useEffect } from 'react';
import { CircleAlert } from 'lucide-react';
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('Application error:', error); }, [error]);
  return <main id="main-content" className="flex min-h-dvh flex-col justify-center bg-background px-6 py-16 text-foreground"><div className="mx-auto w-full max-w-lg"><CircleAlert className="size-8 text-destructive" aria-hidden="true" /><h1 className="ff-display mt-7 text-4xl font-semibold">Something went wrong.</h1><p className="mt-5 leading-7 text-muted-foreground">Try loading this page again. If it still won’t open, contact support and include the reference below.</p>{error.digest ? <p className="mt-5 break-all rounded-xl bg-card p-4 text-sm text-muted-foreground">Error reference: {error.digest}</p> : null}<button type="button" onClick={reset} className="ff-button-primary mt-8">Try again</button></div></main>;
}
