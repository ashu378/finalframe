import Link from 'next/link';
import { ArrowRight, Check, Film, Sparkles } from 'lucide-react';
import { ensureOnboardingStep } from '@/lib/onboarding/access';
import { OnboardingStep } from '@/lib/onboarding/types';

export default async function WelcomePage() {
  await ensureOnboardingStep(OnboardingStep.WELCOME);
  return <div className="space-y-9"><div><p className="ff-eyebrow">Let’s make your studio feel like yours</p><h1 className="ff-display mt-4 text-4xl font-semibold sm:text-5xl">A few questions, then your first video.</h1><p className="mt-4 max-w-xl leading-7 text-muted-foreground">There are no wrong answers. We use what you tell us to make the first project easier to start.</p></div><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-[1.1rem] bg-[#f6dfb1] p-5"><Film className="size-5" /><p className="mt-10 text-sm font-semibold">Choose what you make</p><p className="mt-2 text-xs leading-5 text-foreground/65">Ads, cartoons, UGC, motion, and more.</p></div><div className="rounded-[1.1rem] bg-[#f1c7b7] p-5"><Sparkles className="size-5 text-accent" /><p className="mt-10 text-sm font-semibold">Set a starting style</p><p className="mt-2 text-xs leading-5 text-foreground/65">You can change it from project to project.</p></div><div className="rounded-[1.1rem] bg-[#c8ddd5] p-5"><Check className="size-5 text-[hsl(var(--success))]" /><p className="mt-10 text-sm font-semibold">Add media when ready</p><p className="mt-2 text-xs leading-5 text-foreground/65">Nothing is required before your first idea.</p></div></div><Link href="/onboarding/studio" className="ff-button-primary w-full">Let’s get started <ArrowRight className="size-4" /></Link></div>;
}
