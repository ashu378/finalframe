import Link from 'next/link';
import { ArrowRight, Check, Film, Sparkles } from 'lucide-react';
import { ensureOnboardingStep } from '@/lib/onboarding/access';
import { OnboardingStep } from '@/lib/onboarding/types';

export default async function WelcomePage() {
  await ensureOnboardingStep(OnboardingStep.WELCOME);
  return <div className="space-y-9"><div><p className="ff-eyebrow">Let’s make your studio feel like yours</p><h1 className="ff-display mt-4 text-4xl font-semibold sm:text-5xl">A few questions, then your first video.</h1><p className="mt-4 max-w-xl leading-7 text-muted-foreground">There are no wrong answers. We use what you tell us to make the first project easier to start.</p></div><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-[1.1rem] bg-primary p-5 text-primary-foreground"><Film className="size-5" /><p className="mt-10 text-sm font-semibold">Choose what you make</p><p className="mt-2 text-xs leading-5 text-primary-foreground/70">Ads, cartoons, UGC, motion, and more.</p></div><div className="rounded-[1.1rem] bg-gradient-to-br from-accent/85 via-secondary to-primary/70 p-5"><Sparkles className="size-5 text-accent" /><p className="mt-10 text-sm font-semibold">Set a starting style</p><p className="mt-2 text-xs leading-5 text-foreground/70">You can change it from project to project.</p></div><div className="rounded-[1.1rem] bg-[hsl(var(--success)/.2)] p-5"><Check className="size-5 text-[hsl(var(--success))]" /><p className="mt-10 text-sm font-semibold">Add media when ready</p><p className="mt-2 text-xs leading-5 text-muted-foreground">Nothing is required before your first idea.</p></div></div><Link href="/onboarding/studio" className="ff-button-primary w-full">Let’s get started <ArrowRight className="size-4" /></Link></div>;
}
