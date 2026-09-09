import { FriendlyOnboardingForm } from '@/components/onboarding/friendly-onboarding-form';

export default async function OnboardingRootPage() {
    return <div className="space-y-8"><div><p className="ff-eyebrow">Optional quick setup</p><h1 className="ff-display mt-4 text-4xl font-semibold sm:text-5xl">Start creating when you’re ready.</h1><p className="mt-4 max-w-xl leading-7 text-muted-foreground">Answer a few questions to personalize your first project, or skip setup and explore the studio. You can change these choices later.</p></div><FriendlyOnboardingForm /></div>;
}
