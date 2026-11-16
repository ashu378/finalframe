import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Plus } from 'lucide-react';

export function GuideFrame({ src, alt, caption, className = '' }: { src: string; alt: string; caption: string; className?: string }) {
  return <figure className={`min-w-0 ${className}`}>
    <div className="relative aspect-[16/11] overflow-hidden rounded-2xl bg-card"><Image src={src} alt={alt} fill sizes="(max-width: 768px) 92vw, 48vw" className="object-cover" /></div>
    <figcaption className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{caption}</figcaption>
  </figure>;
}

export function GuideQuestions({ title = 'Before you begin.', questions }: { title?: string; questions: readonly (readonly [string, string])[] }) {
  return <section data-reveal className="ff-container grid gap-10 py-16 sm:py-24 lg:grid-cols-[.7fr_1.3fr]">
    <h2 className="ff-display max-w-sm text-3xl font-semibold leading-tight sm:text-4xl">{title}</h2>
    <div className="divide-y divide-border border-y border-border">{questions.map(([question, answer]) => <details key={question} className="group py-5">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-5 text-base font-semibold"><span>{question}</span><Plus className="size-5 shrink-0 text-primary transition-transform group-open:rotate-45" aria-hidden="true" /></summary>
      <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">{answer}</p>
    </details>)}</div>
  </section>;
}

export function GuideNext({ title, description }: { title: string; description: string }) {
  return <section data-reveal className="ff-container pb-16 sm:pb-24"><div className="grid items-end gap-8 rounded-2xl bg-primary p-6 text-primary-foreground sm:p-12 lg:grid-cols-[1fr_auto]">
    <div><h2 className="ff-display max-w-2xl text-3xl font-semibold leading-tight sm:text-5xl">{title}</h2><p className="mt-5 max-w-xl text-base leading-7">{description}</p></div>
    <div className="flex flex-wrap gap-3"><Link href="/signup" className="ff-button min-h-12 bg-background text-foreground hover:bg-card">Start a project<ArrowRight className="size-4" aria-hidden="true" /></Link><Link href="/contact" className="ff-button min-h-12 border border-black/30">Ask a question</Link></div>
  </div></section>;
}
