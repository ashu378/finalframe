import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { requireAuth } from '@/lib/guards';

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return <div className="min-h-dvh bg-background text-foreground"><header className="border-b border-border"><div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-5 py-4"><Link href="/" className="flex min-h-11 items-center gap-3"><Image src="/brand/finalframe-icon-v1.png" alt="" width={32} height={32} className="rounded-lg" priority /><span className="text-xl font-bold tracking-tight">FinalFrame</span></Link><Link href="/dashboard" className="ff-button-quiet px-0 text-sm">Go to dashboard<ArrowRight className="size-4" aria-hidden="true" /></Link></div></header><main id="main-content" className="mx-auto w-full max-w-2xl px-5 py-10 sm:py-16"><p className="mb-8 text-sm leading-6 text-muted-foreground">Optional studio setup. You can change these choices later.</p><div className="onboarding-theme rounded-2xl border border-border bg-card p-5 sm:p-8">{children}</div></main></div>;
}
