'use client';

import Link from 'next/link';

export default function PublicError({ reset }: { reset: () => void }) {
  return <div className="ff-container flex min-h-[55dvh] items-center justify-center py-24"><div className="ff-card max-w-lg p-8 text-center sm:p-10"><p className="ff-eyebrow">We couldn’t load this page</p><h1 className="ff-display mt-4 text-3xl font-semibold">The page needs another try.</h1><p className="mt-3 leading-7 text-muted-foreground">Your work is safe. Try loading the page again, or return to the homepage.</p><div className="mt-7 flex flex-wrap justify-center gap-3"><button type="button" onClick={reset} className="ff-button-primary">Try again</button><Link href="/" className="ff-button-quiet">Back home</Link></div></div></div>;
}
