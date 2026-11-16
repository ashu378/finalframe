import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Check, Film, Layers3, WandSparkles } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-background text-foreground lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-card p-12 lg:flex xl:p-16">
        <Link href="/" className="flex items-center gap-3 text-xl font-bold">
          <Image src="/brand/finalframe-mark-small.png" alt="" width={36} height={36} className="rounded-lg grayscale" />FinalFrame
        </Link>
        <div className="my-14 max-w-lg">
          <h2 className="ff-display text-5xl font-semibold leading-[1.05] xl:text-6xl">Your next story starts here.</h2>
          <p className="mt-6 max-w-md text-lg leading-8 text-muted-foreground">An idea, a script, or footage you already have. Give it a home, shape every scene, and make it yours.</p>
          <div className="mt-12 space-y-0" aria-label="Production workflow">
            {[
              { icon: WandSparkles, title: 'Shape the idea', text: 'Build a script and review your plan.' },
              { icon: Layers3, title: 'Make each scene', text: 'Keep characters, voices and references together.' },
              { icon: Film, title: 'Finish your edit', text: 'Review, refine and download your video.' },
            ].map(({ icon: Icon, title, text }) => <div key={title} className="flex gap-5 border-t border-border py-6"><Icon className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" /><div><p className="font-semibold">{title}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p></div></div>)}
          </div>
        </div>
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Check className="size-4 text-primary" aria-hidden="true" /> Review the cost before generation.</p>
      </aside>
      <main id="main-content" className="flex min-w-0 flex-col px-6 py-6 sm:px-10 lg:px-14">
        <div className="flex min-h-11 items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"><ArrowLeft className="size-4" aria-hidden="true" />Back to home</Link>
          <Link href="/" className="ff-display text-lg font-semibold lg:hidden">FinalFrame<span className="text-primary">.</span></Link>
        </div>
        <div className="ff-auth-form mx-auto my-auto w-full max-w-[400px] py-12 sm:py-16">{children}</div>
        <footer className="flex flex-wrap justify-between gap-3 pb-2 text-xs leading-6 text-muted-foreground"><span>© {new Date().getFullYear()} FinalFrame</span><div className="flex gap-5"><Link href="/legal/privacy" className="hover:text-foreground">Privacy</Link><Link href="/legal/terms" className="hover:text-foreground">Terms</Link></div></footer>
      </main>
    </div>
  );
}
