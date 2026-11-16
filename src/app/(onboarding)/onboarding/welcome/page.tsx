import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { ensureOnboardingStep } from '@/lib/onboarding/access';
import { OnboardingStep } from '@/lib/onboarding/types';
export default async function WelcomePage() {
  await ensureOnboardingStep(OnboardingStep.WELCOME);
  return <div className="space-y-8"><div><h1 className="ff-display text-3xl font-semibold sm:text-4xl">Make this space yours.</h1><p className="mt-4 max-w-xl leading-7 text-muted-foreground">A few optional choices help you get started. Each project can still have its own people, style and media.</p></div><ul className="divide-y divide-border border-y border-border">{['Choose what you want to make.','Pick a starting style.','Bring photos, clips or a voice recording when you need them.'].map(text => <li key={text} className="flex gap-3 py-5 text-sm leading-7"><Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />{text}</li>)}</ul><Link href="/onboarding/studio" className="ff-button-primary w-full">Set up my studio<ArrowRight className="size-4" aria-hidden="true" /></Link></div>;
}
