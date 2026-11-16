import Link from 'next/link';
import { ArrowLeft, Search } from 'lucide-react';
export default function NotFound() {
  return <main id="main-content" className="flex min-h-dvh flex-col justify-center bg-background px-6 py-16 text-foreground"><div className="mx-auto w-full max-w-lg"><Search className="size-8 text-primary" aria-hidden="true" /><p className="mt-7 text-sm text-muted-foreground">Error 404</p><h1 className="ff-display mt-3 text-4xl font-semibold sm:text-5xl">We can’t find this page.</h1><p className="mt-5 max-w-md leading-7 text-muted-foreground">The link may be old, or the page may have moved. Head home to find what you need.</p><Link href="/" className="ff-button-primary mt-8"><ArrowLeft className="size-4" aria-hidden="true" />Back to home</Link></div></main>;
}
