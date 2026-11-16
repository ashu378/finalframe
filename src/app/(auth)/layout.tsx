import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Check, Clapperboard, Layers3 } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-dvh bg-background text-foreground lg:grid-cols-[1fr_1.05fr]">
    <aside className="relative hidden min-h-dvh flex-col overflow-hidden border-r border-border bg-card p-10 lg:flex xl:p-14">
      <Image src="/showcase/cinema.webp" alt="" fill sizes="50vw" className="object-cover opacity-35" priority />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/65 to-background/20" />
      <Link href="/" className="relative flex w-fit items-center gap-3 text-xl font-bold"><Image src="/brand/finalframe-icon-v1.png" alt="" width={36} height={36} className="rounded-lg" />FinalFrame</Link>
      <div className="relative my-auto max-w-lg py-16">
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/15 bg-background/75 px-4 py-2 text-sm"><Clapperboard className="size-4 text-primary" aria-hidden="true" />Your own video studio</div>
        <h2 className="ff-display text-5xl font-semibold leading-[1.08] xl:text-6xl">Big ideas.<br />Made one scene at a time.</h2>
        <p className="mt-6 max-w-md text-base leading-8 text-white/75">Make a cartoon, tell a story or show what your business does. Start with words or bring your own photos and clips.</p>
        <div className="mt-10 rounded-2xl border border-white/15 bg-background/80 p-5 shadow-[0_16px_40px_-24px_rgba(0,0,0,.8)]"><div className="flex items-start gap-3"><Layers3 className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" /><div><p className="font-semibold">A home for every project</p><p className="mt-2 text-sm leading-7 text-white/65">Your characters, voices, scenes and saved versions stay together. Come back when the next idea arrives.</p></div></div></div>
      </div>
      <p className="relative flex items-center gap-2 text-sm text-white/70"><Check className="size-4 shrink-0 text-primary" aria-hidden="true" />You review the plan and cost before generation.</p>
    </aside>
    <main id="main-content" className="flex min-w-0 flex-col px-5 py-5 sm:px-10 lg:px-12">
      <div className="flex min-h-11 items-center justify-between gap-4"><Link href="/" className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" />Back to home</Link><Link href="/" className="flex items-center gap-2 text-base font-bold tracking-tight lg:hidden"><Image src="/brand/finalframe-icon-v1.png" alt="" width={28} height={28} className="rounded-md" />FinalFrame</Link></div>
      <div className="ff-auth-form mx-auto my-auto w-full max-w-[440px] py-10 sm:py-14"><div className="rounded-2xl border border-border bg-card/60 p-5 shadow-[0_20px_60px_-36px_rgba(0,0,0,.85)] sm:p-8">{children}</div></div>
      <footer className="flex flex-wrap justify-between gap-3 text-xs leading-6 text-muted-foreground"><span>© {new Date().getFullYear()} FinalFrame</span><div className="flex gap-5"><Link href="/legal/privacy" className="min-h-11 content-center hover:text-foreground">Privacy</Link><Link href="/legal/terms" className="min-h-11 content-center hover:text-foreground">Terms</Link></div></footer>
    </main>
  </div>;
}
